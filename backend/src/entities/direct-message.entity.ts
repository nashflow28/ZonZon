import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Private, non-delivery message between an active merchant/driver pair. */
@Entity('direct_messages')
@Index(['senderId', 'recipientId', 'createdAt'])
@Index(['recipientId', 'readAt'])
@Index(['orderId', 'createdAt'])
export class DirectMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  senderId: string;

  @Column({ type: 'varchar', length: 36 })
  recipientId: string;

  /** Optional delivery context; null keeps this a normal general message. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
