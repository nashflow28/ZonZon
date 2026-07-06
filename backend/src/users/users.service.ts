import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { DriverApprovalStatus, User, UserRole } from '../entities/user.entity';
import { Vehicle, VehicleType } from '../entities/vehicle.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Vehicle)
    private vehiclesRepository: Repository<Vehicle>,
    @Optional() private auditLog?: AuditLogService,
  ) {}

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
    user.isAvailable = available;
    await this.usersRepository.save(user);
    return { isAvailable: available };
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
   * (validés par un admin ET actuellement disponibles). Utilisé pour filtrer
   * le broadcast Socket.IO d'une nouvelle course.
   */
  async findEligibleLivreurIds(): Promise<string[]> {
    const eligible = await this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: true,
      },
      select: ['id'],
    });
    return eligible.map((u) => u.id);
  }

  async attachVehicle(userId: string, type: VehicleType) {
    const vehicle = this.vehiclesRepository.create({
      type,
      driver: { id: userId } as User,
    });
    return this.vehiclesRepository.save(vehicle);
  }

  async updateProfilePhoto(userId: string, filename: string) {
    const publicUrl = `/uploads/${filename}`;
    await this.usersRepository.update(userId, { profilePhotoUrl: publicUrl });
    return { profilePhotoUrl: publicUrl };
  }

  /**
   * Enregistre la photo de la pièce d'identité d'un livreur (dossier dédié
   * `identity`, cf. idCardPhotoStorage). Utilisé par l'admin pour la
   * validation du compte livreur.
   */
  async updateIdCardPhoto(userId: string, filename: string) {
    const publicUrl = `/uploads/identity/${filename}`;
    await this.usersRepository.update(userId, { idCardPhotoUrl: publicUrl });
    return { idCardPhotoUrl: publicUrl };
  }

  async updateFcmToken(userId: string, token: string | null) {
    await this.usersRepository.update(userId, { fcmToken: token });
    return { ok: true };
  }

  async updateProfile(userId: string, dto: { firstName?: string; lastName?: string }) {
    await this.usersRepository.update(userId, dto);
    return this.findOne(userId);
  }

  findByPhone(phone: string) {
    return this.usersRepository.findOne({ where: { phone } });
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
  findLivreursWithFcmToken(): Promise<User[]> {
    return this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        fcmToken: Not(IsNull()),
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: true,
      },
      select: ['id', 'firstName', 'fcmToken'],
    });
  }

  /**
   * Livreurs disponibles pour une attribution manuelle (Priorité 3, Lot 3,
   * item 1) : APPROVED + isAvailable, avec leur véhicule. Utilisé par
   * `GET /orders/available-drivers` (enrichi ensuite avec distance/
   * affiliation côté OrdersService).
   */
  findAvailableDrivers(): Promise<User[]> {
    return this.usersRepository.find({
      where: {
        role: UserRole.LIVREUR,
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: true,
      },
      relations: ['vehicle'],
    });
  }
}
