import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  DriverApprovalStatus,
  User,
  UserRole,
  UserStatus,
} from '../entities/user.entity';
import { Vehicle, VehicleType } from '../entities/vehicle.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { IdentityStorageService } from '../storage/identity-storage.service';
import { basename } from 'path';
import { Readable } from 'stream';
import { createReadStream, promises as fsPromises } from 'fs';
import type { AuthenticatedUser } from '../auth/types';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Vehicle)
    private vehiclesRepository: Repository<Vehicle>,
    @Optional() private auditLog?: AuditLogService,
    // Cycle DI (NotificationsModule ↔ UsersModule) résolu par forwardRef
    // (cf. UsersModule/NotificationsModule) + @Optional() pour ne pas
    // casser les tests unitaires existants qui n'injectent pas ce service.
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private notifications?: NotificationsService,
    @Optional() private objectStorage?: ObjectStorageService,
    @Optional() private identityStorage?: IdentityStorageService,
  ) {}

  private ensureDriverHasOperationalProfile(user: User) {
    if (
      user.role === UserRole.LIVREUR &&
      (!user.profilePhotoUrl || user.profilePhotoUrl.trim().length === 0)
    ) {
      throw new BadRequestException(
        'Une photo de profil est obligatoire avant validation ou prise de course',
      );
    }
  }

  async createWithPassword(data: {
    firstName: string;
    lastName: string;
    phone: string;
    role: UserRole;
    password?: string;
  }): Promise<User> {
    const user = this.usersRepository.create({
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      // Un livreur doit être validé par un admin avant de pouvoir voir/accepter
      // des courses ; il démarre donc PENDING + indisponible. Les autres rôles
      // ne sont pas concernés par ce workflow (statut null).
      driverApprovalStatus:
        data.role === UserRole.LIVREUR ? DriverApprovalStatus.PENDING : null,
      isAvailable: false,
    });
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(data.password, salt);
    }
    return this.usersRepository.save(user);
  }

  /**
   * Valide ou rejette un livreur (ADMIN uniquement, via le controller).
   * Un rejet remet automatiquement le livreur en indisponible.
   */
  async setDriverApproval(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    adminId: string,
    reason?: string,
  ): Promise<User> {
    const user = await this.findOne(id);
    if (user.role !== UserRole.LIVREUR) {
      throw new BadRequestException("Cet utilisateur n'est pas un livreur");
    }
    if (status === 'APPROVED') {
      this.ensureDriverHasOperationalProfile(user);
    }

    user.driverApprovalStatus =
      status === 'APPROVED'
        ? DriverApprovalStatus.APPROVED
        : DriverApprovalStatus.REJECTED;

    if (status === 'REJECTED') {
      user.driverRejectionReason = reason ?? null;
      user.isAvailable = false;
    } else {
      user.driverRejectionReason = null;
    }

    const saved = await this.usersRepository.save(user);

    void this.auditLog?.log({
      adminId,
      action: status === 'APPROVED' ? 'DRIVER_APPROVE' : 'DRIVER_REJECT',
      targetType: 'User',
      targetId: id,
      metadata: reason ? { reason } : undefined,
    });

    // Notification au livreur (§14.1) : fire-and-forget, ne bloque jamais
    // l'action admin même si l'envoi échoue (FCM indisponible, etc.).
    if (status === 'APPROVED') {
      void this.notifications?.sendToUser(id, {
        title: 'Compte validé',
        body: 'Votre compte livreur a été validé, vous pouvez passer disponible.',
        data: { kind: 'driver_approval', status: 'APPROVED' },
      });
    } else {
      void this.notifications?.sendToUser(id, {
        title: 'Compte refusé',
        body: reason ?? 'Votre compte livreur a été refusé.',
        data: { kind: 'driver_approval', status: 'REJECTED' },
      });
    }

    return saved;
  }

  /**
   * Bascule la disponibilité d'un livreur. Impossible tant que le compte
   * n'est pas APPROVED (empêche un livreur PENDING/REJECTED de se rendre
   * disponible et donc de recevoir des courses).
   */
  async setAvailability(
    userId: string,
    available: boolean,
  ): Promise<{ isAvailable: boolean }> {
    const user = await this.findOne(userId);
    if (user.role !== UserRole.LIVREUR) {
      throw new ForbiddenException(
        'Seul un livreur peut modifier sa disponibilité',
      );
    }
    if (user.driverApprovalStatus !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException(
        'Votre compte livreur est en attente de validation',
      );
    }
    this.ensureDriverHasOperationalProfile(user);
    user.isAvailable = available;
    await this.usersRepository.save(user);
    return { isAvailable: available };
  }

  /**
   * Suspend un compte (P0 sécurité, CDC V1). Applicable à tout rôle
   * (CLIENT, LIVREUR, COMMERCANT, ADMIN). Bloque la connexion
   * (`AuthService.loginWithCredentials`) et sert de défense en profondeur
   * sur les actions sensibles (`OrdersService`).
   */
  async suspend(id: string, adminId: string, reason?: string): Promise<User> {
    const user = await this.findOne(id);
    user.status = UserStatus.SUSPENDED;
    const saved = await this.usersRepository.save(user);

    void this.auditLog?.log({
      adminId,
      action: 'USER_SUSPEND',
      targetType: 'User',
      targetId: id,
      metadata: reason ? { reason } : undefined,
    });

    return saved;
  }

  /**
   * Réactive un compte préalablement suspendu.
   */
  async reactivate(id: string, adminId: string): Promise<User> {
    const user = await this.findOne(id);
    user.status = UserStatus.ACTIVE;
    const saved = await this.usersRepository.save(user);

    void this.auditLog?.log({
      adminId,
      action: 'USER_REACTIVATE',
      targetType: 'User',
      targetId: id,
    });

    return saved;
  }

  /**
   * Liste les livreurs en attente de validation admin (pour l'écran
   * "Livreurs à valider" du dashboard).
   */
  findPendingDrivers(): Promise<User[]> {
    return this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        driverApprovalStatus: DriverApprovalStatus.PENDING,
      },
      relations: ['vehicle', 'vehicle.usualZone'],
    });
  }

  /**
   * Renvoie les ids des livreurs éligibles à recevoir une nouvelle course
   * (validés par un admin ET actuellement disponibles ET publics). Utilisé
   * pour filtrer le broadcast Socket.IO d'une nouvelle course.
   *
   * `isPublic = false` (CDC V1 §9.3) exclut le livreur du broadcast général :
   * il ne reçoit alors des courses que via attribution manuelle
   * (`preferredLivreurId`), ciblage qui n'est PAS filtré par cette méthode.
   */
  async findEligibleLivreurIds(): Promise<string[]> {
    const eligible = await this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: true,
        isPublic: true,
        status: UserStatus.ACTIVE,
      },
      select: ['id', 'profilePhotoUrl'],
    });
    return eligible.filter((u) => !!u.profilePhotoUrl?.trim()).map((u) => u.id);
  }

  /**
   * Bascule la visibilité publique d'un livreur (CDC V1 §9.3) —
   * `PATCH /users/me/visibility`. Un livreur privé (`isPublic = false`) ne
   * reçoit plus les courses du broadcast général ; il reste éligible à
   * l'attribution manuelle par un commerçant (`preferredLivreurId`).
   */
  async setPublicVisibility(
    userId: string,
    isPublic: boolean,
  ): Promise<{ isPublic: boolean }> {
    const user = await this.findOne(userId);
    if (user.role !== UserRole.LIVREUR) {
      throw new ForbiddenException(
        'Seul un livreur peut modifier sa visibilité',
      );
    }
    user.isPublic = isPublic;
    await this.usersRepository.save(user);
    return { isPublic };
  }

  async attachVehicle(userId: string, type: VehicleType) {
    const vehicle = this.vehiclesRepository.create({
      type,
      driver: { id: userId } as User,
    });
    return this.vehiclesRepository.save(vehicle);
  }

  async updateProfilePhoto(
    userId: string,
    file: Pick<Express.Multer.File, 'filename' | 'mimetype' | 'path'> | string,
  ) {
    const filename = typeof file === 'string' ? file : file.filename;
    const localUrl = `/uploads/${filename}`;
    const publicUrl =
      typeof file === 'string'
        ? localUrl
        : ((await this.objectStorage?.store(file, 'avatars', localUrl)) ??
          localUrl);
    await this.usersRepository.update(userId, { profilePhotoUrl: publicUrl });
    return { profilePhotoUrl: publicUrl };
  }

  /**
   * Enregistre la photo de la pièce d'identité d'un livreur (dossier dédié
   * `identity`, cf. idCardPhotoStorage). Utilisé par l'admin pour la
   * validation du compte livreur.
   */
  async updateIdCardPhoto(
    userId: string,
    file: Pick<Express.Multer.File, 'filename' | 'mimetype' | 'path'> | string,
  ) {
    const filename = basename(typeof file === 'string' ? file : file.filename);
    const storageKey = `identity/${filename}`;
    const persistedKey =
      typeof file === 'string'
        ? storageKey
        : ((await this.identityStorage?.store(file)) ?? storageKey);
    await this.usersRepository.update(userId, {
      idCardPhotoUrl: persistedKey,
    });
    return { ok: true };
  }

  async getIdCardPhoto(userId: string, actor: AuthenticatedUser) {
    const actorId = actor.id ?? actor.sub;
    if (actor.role !== UserRole.ADMIN && actorId !== userId) {
      throw new ForbiddenException(
        "Vous ne pouvez consulter que votre propre pièce d'identité",
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        idCardPhotoUrl: true,
      } as any,
    });
    if (!user?.idCardPhotoUrl) {
      throw new NotFoundException("Pièce d'identité introuvable");
    }

    return this.openIdCardAsset(user.idCardPhotoUrl);
  }

  async updateFcmToken(userId: string, token: string | null) {
    await this.usersRepository.update(userId, { fcmToken: token });
    return { ok: true };
  }

  async updateProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string },
  ) {
    await this.usersRepository.update(userId, dto);
    return this.findOne(userId);
  }

  /** Resolves international and local phone input to the same account. */
  async findByPhone(phone: string): Promise<User | null> {
    const raw = phone.trim();
    const digits = raw.replace(/[^0-9]/g, '');
    if (!raw || !digits) return null;

    const normalizedColumn =
      "REPLACE(REPLACE(REPLACE(REPLACE(user.phone, '+', ''), ' ', ''), '-', ''), '.', '')";
    const qb = this.usersRepository
      .createQueryBuilder('user')
      // `password` est select:false pour ne jamais fuiter via les relations.
      // Ce chemin interne est le seul qui doit le charger pour bcrypt.
      .addSelect('user.password')
      .where('user.phone = :raw', { raw })
      .orWhere(`${normalizedColumn} = :digits`, { digits });

    // A local number (such as 90123456) must find its +228 counterpart.
    if (digits.length <= 10) {
      qb.orWhere(`${normalizedColumn} LIKE :localSuffix`, {
        localSuffix: `%${digits}`,
      });
    }
    return qb.getOne();
  }

  async searchClients(query: string, limit = 8): Promise<User[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    // /g obligatoire : sans lui, seul le PREMIER caractère non numérique est
    // retiré ("+228 90-12.34" → "228 90-12.34"), ce qui casse le matching
    // contre le téléphone normalisé côté SQL.
    const digits = normalizedQuery.replace(/[^0-9]/g, '');
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.CLIENT })
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .orderBy('user.firstName', 'ASC')
      .take(Math.min(Math.max(limit, 1), 20));

    qb.andWhere(
      `(
        LOWER(CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, ''))) LIKE :text
        OR LOWER(user.phone) LIKE :text
        OR REPLACE(REPLACE(REPLACE(REPLACE(user.phone, '+', ''), ' ', ''), '-', ''), '.', '') LIKE :digits
      )`,
      {
        text: `%${normalizedQuery}%`,
        digits: `%${digits || normalizedQuery}%`,
      },
    );

    return qb.getMany();
  }

  findAll() {
    return this.usersRepository.find({ relations: ['vehicle'] });
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  /**
   * Soft-delete un utilisateur : positionne `deletedAt` sans supprimer
   * physiquement la ligne (et donc sans cascader sur ratings, messages,
   * commissions, etc.). Les `find/findOne` standard du repo l'excluent
   * automatiquement (sauf si `withDeleted: true` est passé explicitement).
   */
  async softDelete(id: string) {
    await this.usersRepository.softDelete(id);
    return { ok: true };
  }

  /**
   * Restaure un utilisateur soft-deleted (remet `deletedAt = NULL`).
   */
  async restore(id: string) {
    await this.usersRepository.restore(id);
    return { ok: true };
  }

  /**
   * Liste les livreurs qui ont un fcmToken non null.
   * Utilisée par le fallback FCM pour notifier les livreurs déconnectés du WS
   * d'une nouvelle course disponible.
   *
   * NB : pas de filtre géographique ici (les positions des livreurs sont en
   * mémoire dans le gateway, pas persistées). À ajouter quand la persistance
   * des positions sera en place (cf. TODO.md).
   */
  async findLivreursWithFcmToken(): Promise<User[]> {
    const drivers = await this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        fcmToken: Not(IsNull()),
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: true,
        isPublic: true,
        status: UserStatus.ACTIVE,
      },
      select: ['id', 'firstName', 'fcmToken', 'profilePhotoUrl'],
    });
    return drivers.filter((driver) => !!driver.profilePhotoUrl?.trim());
  }

  /**
   * Livreurs disponibles pour une attribution manuelle (Priorité 3, Lot 3,
   * item 1) : APPROVED + isAvailable, avec leur véhicule. Utilisé par
   * `GET /orders/available-drivers` (enrichi ensuite avec distance/
   * affiliation côté OrdersService).
   */
  async findAvailableDrivers(): Promise<User[]> {
    const drivers = await this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: true,
        status: UserStatus.ACTIVE,
      },
      relations: ['vehicle'],
    });
    return drivers.filter((driver) => !!driver.profilePhotoUrl?.trim());
  }

  private async openIdCardAsset(reference: string): Promise<{
    stream: Readable;
    contentType: string;
  }> {
    const cleaned = reference.trim();
    if (/^https?:\/\//i.test(cleaned)) {
      const response = await fetch(cleaned);
      if (!response.ok || !response.body) {
        throw new NotFoundException("Pièce d'identité introuvable");
      }
      return {
        stream: Readable.fromWeb(response.body as any),
        contentType:
          response.headers.get('content-type') ?? 'application/octet-stream',
      };
    }

    if (cleaned.startsWith('/uploads/')) {
      const localPath = cleaned.replace(/^\/+/, '');
      const absolutePath = `${process.cwd()}/${localPath}`;
      await fsPromises.access(absolutePath).catch(() => {
        throw new NotFoundException("Pièce d'identité introuvable");
      });
      return {
        stream: createReadStream(absolutePath),
        contentType: this.contentTypeForReference(cleaned),
      };
    }

    const key = cleaned.startsWith('identity/')
      ? cleaned
      : `identity/${basename(cleaned)}`;
    if (this.identityStorage) {
      return this.identityStorage.open(key);
    }

    const localPath = `${process.cwd()}/${process.env.IDENTITY_UPLOAD_DIR || 'private_uploads/identity'}/${basename(key)}`;
    await fsPromises.access(localPath).catch(() => {
      throw new NotFoundException("Pièce d'identité introuvable");
    });
    return {
      stream: createReadStream(localPath),
      contentType: this.contentTypeForReference(key),
    };
  }

  private contentTypeForReference(reference: string): string {
    const lower = reference.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.webp')) {
      return 'image/webp';
    }
    return 'application/octet-stream';
  }
}
