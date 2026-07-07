import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Historique des changements de statut d'une livraison (Priorité 1, CDC V1
 * — traçabilité). Une ligne par transition, y compris la création
 * (`oldStatus = null`, `newStatus = PENDING`). Entité dédiée et distincte de
 * `AdminAuditLog` (réservé aux actions ADMIN) : ceci trace le cycle de vie
 * métier de la course, consultable par les parties prenantes (client,
 * livreur, commerçant) et pas seulement l'administration.
 */
@Entity('delivery_status_history')
@Index(['deliveryId', 'createdAt'])
export class DeliveryStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logique vers `delivery_orders(id)` (ON DELETE CASCADE en DB). */
  @Column({ type: 'varchar', length: 36 })
  @Index()
  deliveryId: string;

  /** `null` pour la ligne de création de la course. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  oldStatus: string | null;

  @Column({ type: 'varchar', length: 32 })
  newStatus: string;

  /** userId de l'acteur ayant déclenché le changement ; `null` si système. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  changedBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
