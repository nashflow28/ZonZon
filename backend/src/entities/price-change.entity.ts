import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Historique des changements de prix d'une livraison (Priorité 1, CDC V1
 * §6.3 — traçabilité du prix). Une ligne à chaque ajustement manuel du prix
 * (à la création par un commerçant, ou via `PATCH /orders/:id/price`).
 */
@Entity('price_changes')
@Index(['deliveryId', 'createdAt'])
export class PriceChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logique vers `delivery_orders(id)` (ON DELETE CASCADE en DB). */
  @Column({ type: 'varchar', length: 36 })
  @Index()
  deliveryId: string;

  /** Prix avant le changement (`null` si aucun prix calculé connu). */
  @Column({ type: 'int', nullable: true })
  oldPrice: number | null;

  @Column({ type: 'int' })
  newPrice: number;

  /** userId de l'acteur ayant fait l'ajustement (commerçant ou admin). */
  @Column({ type: 'varchar', length: 36 })
  changedBy: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
