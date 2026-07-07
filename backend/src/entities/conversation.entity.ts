import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Conversation multi-participants (CDC V1 §13, §18.9-18.11).
 *
 * Couche ADDITIVE au-dessus de la messagerie existante (`Message`/room
 * Socket.IO `order:<id>:chat`) : une conversation est créée/rattachée
 * automatiquement par livraison (`deliveryId` unique) et sert uniquement à
 * suivre QUI participe à l'échange (client/livreur/commerçant/admin), sans
 * remplacer ni modifier le flux d'envoi/lecture des messages existant.
 */
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Une conversation par livraison — clé d'idempotence de `ensureConversation`. */
  @Column({ type: 'varchar', length: 36, unique: true })
  deliveryId: string;

  @CreateDateColumn()
  createdAt: Date;

  /** Renseigné quand la conversation est explicitement fermée (ex. litige clos). */
  @Column({ type: 'datetime', nullable: true })
  closedAt: Date | null;
}
