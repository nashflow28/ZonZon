import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Signalement (CDC V1 §17.1) : permet à tout utilisateur authentifié de
 * signaler une livraison, un utilisateur, un livreur ou un commerçant.
 *
 * ATTENTION NOMMAGE : ne pas confondre avec le module `reports/` existant,
 * qui gère les rapports comptables (commissions). Ceci est un concept
 * différent et volontairement isolé dans son propre module `signalements`.
 */
export enum SignalementTargetType {
  DELIVERY = 'DELIVERY',
  USER = 'USER',
  DRIVER = 'DRIVER',
  MERCHANT = 'MERCHANT',
}

export enum SignalementStatus {
  OPEN = 'OPEN',
  REVIEWED = 'REVIEWED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

@Entity('signalements')
@Index(['targetType', 'targetId'])
export class Signalement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** userId de l'auteur du signalement. */
  @Column({ type: 'varchar', length: 36 })
  @Index()
  reporterId: string;

  @Column({ type: 'enum', enum: SignalementTargetType })
  targetType: SignalementTargetType;

  /** UUID de l'objet signalé (livraison, utilisateur, livreur, commerçant). */
  @Column({ type: 'varchar', length: 36 })
  targetId: string;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({
    type: 'enum',
    enum: SignalementStatus,
    default: SignalementStatus.OPEN,
  })
  status: SignalementStatus;

  /** userId de l'admin ayant traité le signalement ; `null` tant qu'ouvert. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
