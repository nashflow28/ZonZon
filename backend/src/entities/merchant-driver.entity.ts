import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Statut du flux d'affiliation invite/accept (CDC V1 §9.2). Le commerçant
 * initie l'invitation (PENDING) ; le livreur l'accepte (ACTIVE) ou la
 * refuse (REJECTED). Le commerçant peut ensuite retirer une affiliation
 * ACTIVE (REMOVED) — la ligne est conservée pour historique (soft-remove).
 * Ré-inviter un livreur REJECTED/REMOVED le repasse en PENDING.
 */
export enum AffiliationStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
}

/**
 * Affiliation M:N entre un COMMERCANT et un LIVREUR (Priorité 3, Lot 3,
 * item 2). Un livreur peut être affilié à plusieurs commerçants et
 * inversement — cette table de jointure porte la relation.
 *
 * Utilisée pour :
 * - lister les livreurs "de confiance" d'un commerçant (écran de gestion) ;
 * - prioriser ces livreurs dans `GET /orders/available-drivers` (flag
 *   `isAffiliated`) ;
 * - autoriser (au choix) l'attribution manuelle d'une course à un livreur
 *   affilié même s'il n'est pas immédiatement disponible (cf. Lot 3, item 1).
 */
@Entity('merchant_drivers')
@Unique('UQ_merchant_drivers_merchant_driver', ['merchantId', 'driverId'])
export class MerchantDriver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  merchantId: string;

  @Column({ type: 'varchar', length: 36 })
  driverId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: User;

  /**
   * Cycle de vie de l'invitation (§9.2). Grandfather : les lignes créées
   * avant ce champ (migration `AddAffiliationStatus`) démarrent `ACTIVE`.
   */
  @Column({
    type: 'enum',
    enum: AffiliationStatus,
    default: AffiliationStatus.ACTIVE,
  })
  status: AffiliationStatus;

  /** Horodatage de l'acceptation par le livreur (status → ACTIVE). */
  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  /** Horodatage du retrait par le commerçant (status → REMOVED). */
  @Column({ type: 'datetime', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
