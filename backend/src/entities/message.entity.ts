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

  @Column({ type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
