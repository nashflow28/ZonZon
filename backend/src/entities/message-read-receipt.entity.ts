import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Message } from './message.entity';
import { User } from './user.entity';

/**
 * Accusé de lecture PAR PARTICIPANT (CDC V1 §13 — conversations à 3+).
 *
 * `Message.readAt` (conservé pour rétro-compat mobile) est global : dans un
 * chat à trois, la lecture par UN participant marquait le message comme lu
 * pour TOUS (compteurs non-lus faussés). Cette table porte le curseur de
 * lecture individuel : une ligne = « ce user a lu ce message ».
 */
@Entity('message_read_receipts')
@Index(['userId'])
export class MessageReadReceipt {
  @PrimaryColumn()
  messageId: string;

  @PrimaryColumn()
  userId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'datetime' })
  readAt: Date;
}
