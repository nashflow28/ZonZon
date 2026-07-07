import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Historique des notifications envoyées à un utilisateur (CDC V1 §18.12).
 * Persistée en parallèle de l'envoi FCM (`NotificationsService.sendToUser`),
 * indépendamment de la présence/config de Firebase, pour permettre un
 * centre de notifications côté client (mobile/admin) même si le push
 * n'a pas pu être délivré.
 */
@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  userId: string;

  /** FK logique vers `delivery_orders(id)` ; `null` si non lié à une course. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  deliveryId: string | null;

  /** Catégorie de notification (ex. `data.kind` du payload push). */
  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  @Column({ type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
