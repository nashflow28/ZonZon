import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, QueryDeepPartialEntity, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  DriverApprovalStatus,
  User,
  UserRole,
  UserStatus,
} from '../entities/user.entity';
import {
  DeliveryOrder,
  OrderStatus,
} from '../entities/delivery-order.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { Vehicle, VehicleType } from '../entities/vehicle.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { IdentityStorageService } from '../storage/identity-storage.service';
import { basename } from 'path';
import { Readable } from 'stream';
import { createReadStream, promises as fsPromises } from 'fs';
import type { AuthenticatedUser } from '../auth/types';

/**
 * Statuts d'une course encore « vivante » : tant qu'une livraison est dans
 * l'un d'eux, elle engage encore son client, son livreur et/ou son commerçant.
 * Les états terminaux (COMPLETED, CANCELLED, FAILED) n'empêchent donc pas la
 * suppression d'un compte.
 */
const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.EN_ROUTE_PICKUP,
  OrderStatus.AT_PICKUP,
  OrderStatus.IN_PROGRESS,
  OrderStatus.NEAR_CLIENT,
];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Vehicle)
    private vehiclesRepository: Repository<Vehicle>,
    // Lecture seule, uniquement pour vérifier qu'un compte n'a pas de course
    // en cours avant de le supprimer (`deleteOwnAccount`). On injecte le repo
    // plutôt que `OrdersService` : ce dernier dépend déjà de `UsersService`,
    // le passer en dépendance créerait un cycle DI de plus.
    @InjectRepository(DeliveryOrder)
    private ordersRepository: Repository<DeliveryOrder>,
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
  /**
   * Reset de mot de passe d'un compte ADMIN par un autre admin déjà connecté
   * — filet de sécurité utilisable dès aujourd'hui, sans dépendre du canal
   * WhatsApp (cf. `AuthService.resetPasswordWithOtp`, encore inactif).
   *
   * Scopé aux cibles ADMIN : élargir à CLIENT/LIVREUR/COMMERCANT ferait de
   * cet endpoint un outil de prise de contrôle de n'importe quel compte par
   * un admin, sans le consentement du titulaire — hors du besoin exprimé.
   *
   * L'auto-ciblage est refusé : réinitialiser SON PROPRE mot de passe doit
   * passer par `changePassword` (qui exige de connaître l'ancien), pas par
   * ce contournement réservé au cas où le titulaire est bloqué dehors.
   */
  async adminResetPassword(
    id: string,
    newPassword: string,
    adminId: string,
  ): Promise<{ ok: true }> {
    if (id === adminId) {
      throw new BadRequestException(
        'Utilisez « Modifier le mot de passe » pour réinitialiser le vôtre',
      );
    }
    const user = await this.findOne(id);
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException("Cet utilisateur n'est pas un administrateur");
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await this.usersRepository.update(id, { password: hash });

    void this.auditLog?.log({
      adminId,
      action: 'ADMIN_PASSWORD_RESET',
      targetType: 'User',
      targetId: id,
    });

    return { ok: true };
  }

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

  /** Charge le hash uniquement pour les opérations d’authentification. */
  async findByIdWithPassword(userId: string): Promise<User> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update(userId, { password: passwordHash });
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
    // Garde indispensable : TypeORM ignore les valeurs `undefined` dans un
    // `where` (invalidWhereValuesBehavior par défaut = "ignore"), donc
    // `findOne({ where: { id: undefined } })` produit un SELECT sans clause
    // WHERE et renvoie le premier utilisateur de la table.
    if (!id) throw new NotFoundException('Utilisateur introuvable');
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
   * Suppression de compte en self-service (`DELETE /users/me`) — exigence
   * obligatoire Google Play depuis 2024, tous rôles confondus.
   *
   * On ANONYMISE + soft-delete plutôt que de faire un DELETE SQL : les
   * livraisons terminées doivent rester lisibles (comptabilité, litiges,
   * commissions) et référencent `users.id` par clé étrangère. Ce que la
   * réglementation impose de faire disparaître, ce sont les DONNÉES
   * PERSONNELLES — pas la trace transactionnelle.
   *
   * L'ensemble est transactionnel : une anonymisation appliquée à moitié
   * (téléphone brouillé mais compte encore actif, ou l'inverse) serait pire
   * que pas de suppression du tout.
   */
  /**
   * Efface du stockage la photo de profil et la pièce d'identité d'un compte
   * supprimé. Sans ça, remettre les colonnes à NULL laisserait les fichiers
   * lisibles sur les volumes `zonzon_uploads` / `zonzon_identity`, alors que
   * l'application annonce à l'utilisateur qu'ils sont supprimés.
   */
  private async purgeAccountFiles(
    userId: string,
    profilePhotoUrl?: string | null,
    idCardPhotoUrl?: string | null,
  ): Promise<void> {
    // `remove()` est écrit pour ne jamais lever, mais on ne s'en remet pas à
    // cette promesse : une exception inattendue ici renverrait un 500 alors que
    // le compte est DÉJÀ supprimé et committé — l'utilisateur croirait à un
    // échec et réessaierait dans le vide.
    const purge = async (
      label: string,
      run: () => Promise<boolean>,
    ): Promise<void> => {
      let ok = false;
      try {
        ok = await run();
      } catch (error) {
        ok = false;
        this.logger.error(
          `Échec inattendu de la purge (${label}) : ${(error as Error)?.message}`,
        );
      }
      if (!ok) {
        this.logger.error(
          `${label} non supprimée pour le compte ${userId} — fichier orphelin à purger manuellement`,
        );
      }
    };

    if (profilePhotoUrl && this.objectStorage) {
      await purge('Photo de profil', () =>
        this.objectStorage!.remove(profilePhotoUrl),
      );
    }
    if (idCardPhotoUrl && this.identityStorage) {
      await purge("Pièce d'identité", () =>
        this.identityStorage!.remove(idCardPhotoUrl),
      );
    }
  }

  async deleteOwnAccount(
    userId: string,
    password: string,
  ): Promise<{ ok: true }> {
    const user = await this.findByIdWithPassword(userId);

    // Un compte sans mot de passe local (créé directement en base, ou futur
    // login par OTP seul) ne peut rien prouver par ce canal. On renvoie le
    // MÊME 403 que pour un mot de passe faux : un message distinct
    // indiquerait au porteur d'un jeton volé qu'il suffit d'envoyer n'importe
    // quoi. Ces comptes restent supprimables par un admin (`DELETE /users/:id`).
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new ForbiddenException('Mot de passe incorrect');
    }

    // Le rôle ne suffit pas à décider quel champ regarder : un COMMERCANT peut
    // aussi commander en tant que client, un LIVREUR aussi. On teste donc les
    // trois rattachements pour tout le monde.
    // NB volontaire : `preferredLivreur` n'est PAS testé. Une course PENDING
    // simplement réservée à un livreur qui ne l'a jamais acceptée le
    // bloquerait sans qu'il ait le moindre moyen de s'en défaire — donc sans
    // aucune issue pour supprimer son compte.
    const activeOrders = await this.ordersRepository.count({
      where: [
        { client: { id: userId }, status: In(ACTIVE_ORDER_STATUSES) },
        { livreur: { id: userId }, status: In(ACTIVE_ORDER_STATUSES) },
        { merchant: { id: userId }, status: In(ACTIVE_ORDER_STATUSES) },
      ],
    });
    if (activeOrders > 0) {
      throw new ConflictException(
        'Vous avez une livraison en cours. Terminez-la ou annulez-la avant de supprimer votre compte.',
      );
    }

    // Double cast assumé : ces colonnes sont NULLABLE en base (cf. migrations)
    // mais typées non-nulles sur l'entité, parce qu'elles sont toujours
    // renseignées sur un compte vivant. L'anonymisation est justement le seul
    // chemin qui les remet à NULL — assouplir le type de l'entité ferait
    // apparaître des `| null` dans tout le code qui les lit légitimement.
    const anonymized = {
      firstName: 'Compte',
      lastName: 'supprimé',
      // `phone` est UNIQUE et sert d'identifiant de connexion. Le brouiller
      // (a) rend toute reconnexion impossible même si le filtre soft-delete
      // venait à sauter, (b) libère le vrai numéro pour une réinscription
      // ultérieure. La colonne est un varchar(255) : `deleted-<uuid>`
      // (44 caractères) tient très largement.
      phone: `deleted-${randomUUID()}`,
      password: null,
      profilePhotoUrl: null,
      idCardPhotoUrl: null,
      fcmToken: null,
      // Filet supplémentaire pour un livreur : même si une requête oubliait le
      // filtre soft-delete, il ne serait plus ni disponible ni public.
      isAvailable: false,
      isPublic: false,
    } as unknown as QueryDeepPartialEntity<User>;

    // Références conservées avant l'anonymisation : une fois les colonnes
    // remises à NULL, plus aucun moyen de retrouver les fichiers à purger.
    // `idCardPhotoUrl` est `select: false` sur l'entité et n'est donc PAS
    // renseigné par `findByIdWithPassword` — il faut une lecture explicite,
    // sinon la pièce d'identité resterait sur disque en silence.
    const photoToPurge = user.profilePhotoUrl;
    const withIdCard = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, idCardPhotoUrl: true } as any,
    });
    const idCardToPurge = withIdCard?.idCardPhotoUrl ?? null;

    await this.usersRepository.manager.transaction(async (manager) => {
      // Purge des device tokens : sans elle, les appareils continueraient de
      // recevoir des notifications push après la suppression du compte.
      await manager.getRepository(DeviceToken).delete({ userId });
      await manager.getRepository(User).update(userId, anonymized);
      await manager.getRepository(User).softDelete(userId);
    });

    // Suppression des fichiers APRÈS le commit : les effacer avant exposerait
    // à les perdre pour rien si la transaction échouait ensuite.
    //
    // On n'échoue pas la requête si le stockage refuse : le compte est déjà
    // supprimé, renvoyer une erreur laisserait croire au contraire. Un échec
    // est journalisé en `error` — c'est une donnée personnelle qui survit,
    // ça doit être visible dans les logs, pas silencieux.
    await this.purgeAccountFiles(userId, photoToPurge, idCardToPurge);

    // Traçabilité (fire-and-forget, comme les autres actions sensibles) sans
    // aucune donnée personnelle. `adminId` reste `null` : l'acteur n'est pas
    // un administrateur, et le faire pointer sur la ligne qu'on vient
    // d'anonymiser n'apporterait rien — la relation `admin` est de toute façon
    // filtrée par le soft-delete à la relecture.
    void this.auditLog?.log({
      adminId: null,
      action: 'ACCOUNT_SELF_DELETE',
      targetType: 'User',
      targetId: userId,
      metadata: { role: user.role },
    });

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
