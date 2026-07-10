import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DeliveryOrder } from './delivery-order.entity';
import { User } from './user.entity';

export enum MessageType {
  TEXT = 'TEXT',
  QUICK_REPLY = 'QUICK_REPLY',
  SYSTEM = 'SYSTEM',
}

@Entity('messages')
@Index(['orderId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DeliveryOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: DeliveryOrder;

  @Column()
  orderId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender: User | null;

  @Column({ nullable: true })
  senderId: string | null;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Column({ type: 'text' })
  content: string;

  /**
   * Lu par AU MOINS UN destinataire (rétro-compat mobile : coche « lu » côté
   * expéditeur). Le curseur de lecture individuel — nécessaire dès que la
   * conversation a 3+ participants — vit dans `message_read_receipts`
   * (MessageReadReceipt) : c'est lui qui alimente les compteurs non-lus.
   */
  @Column({ type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
