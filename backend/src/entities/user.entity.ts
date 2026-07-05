import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { DeliveryOrder } from './delivery-order.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  LIVREUR = 'LIVREUR',
  COMMERCANT = 'COMMERCANT',
}

export enum DriverApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENT })
  role: UserRole;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  phone: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ nullable: true })
  profilePhotoUrl: string;

  /**
   * @deprecated Champ legacy mono-token. Conservé en lecture/écriture pour la
   * rétro-compatibilité avec les anciens APK. Les nouvelles écritures passent
   * par la table `device_tokens` (multi-devices). À supprimer dans une migration
   * de cleanup une fois que tous les clients mobiles auront migré.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  fcmToken?: string | null;

  /**
   * Statut de validation admin obligatoire pour un livreur avant de pouvoir
   * voir/accepter des courses. `null` pour les non-livreurs (CLIENT, ADMIN,
   * COMMERCANT), qui ne sont pas concernés par ce workflow.
   */
  @Column({
    type: 'enum',
    enum: DriverApprovalStatus,
    nullable: true,
  })
  driverApprovalStatus: DriverApprovalStatus | null;

  /** Raison du rejet renseignée par l'admin (affichée au livreur). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  driverRejectionReason: string | null;

  /** Disponibilité déclarée par le livreur (bascule manuelle côté mobile). */
  @Column({ type: 'boolean', default: false })
  isAvailable: boolean;

  @OneToOne(() => Vehicle, (vehicle) => vehicle.driver)
  vehicle: Vehicle;

  @OneToMany(() => DeliveryOrder, (order) => order.client)
  clientOrders: DeliveryOrder[];

  @OneToMany(() => DeliveryOrder, (order) => order.livreur)
  livreurOrders: DeliveryOrder[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
