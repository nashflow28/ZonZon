import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export type ConversationParticipantRole =
  | 'CLIENT'
  | 'LIVREUR'
  | 'MERCHANT'
  | 'ADMIN';

/**
 * Participant d'une `Conversation` (CDC V1 §13, §18.10).
 *
 * Un participant peut quitter la conversation (`leftAt` renseigné, soft —
 * on ne supprime jamais la ligne pour conserver l'historique de qui a été
 * partie prenante). `(conversationId, userId)` est UNIQUE : ré-ajouter un
 * participant déjà présent est idempotent (upsert dans le service).
 */
@Entity('conversation_participants')
@Unique(['conversationId', 'userId'])
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  conversationId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  role: ConversationParticipantRole;

  @CreateDateColumn()
  joinedAt: Date;

  /** `null` tant que le participant est actif dans la conversation. */
  @Column({ type: 'datetime', nullable: true })
  leftAt: Date | null;
}
