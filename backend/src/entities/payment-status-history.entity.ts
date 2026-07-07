import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Historique des changements de statut de paiement d'une livraison
 * (Priorité 1, CDC V1 §5.2, §18.13 — traçabilité paiement).
 */
@Entity('payment_status_history')
@Index(['deliveryId', 'createdAt'])
export class PaymentStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logique vers `delivery_orders(id)` (ON DELETE CASCADE en DB). */
  @Column({ type: 'varchar', length: 36 })
  @Index()
  deliveryId: string;

  /** `null` si aucun statut de paiement précédent connu. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  oldStatus: string | null;

  @Column({ type: 'varchar', length: 32 })
  newStatus: string;

  /** userId de l'acteur ayant déclenché le changement ; `null` si système. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  changedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
