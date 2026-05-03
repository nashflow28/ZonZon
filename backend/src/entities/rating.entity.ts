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
import { DeliveryOrder } from './delivery-order.entity';
import { User } from './user.entity';

@Entity('ratings')
@Unique(['order', 'fromUserId', 'toUserId'])
@Index(['toUserId', 'createdAt'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DeliveryOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: DeliveryOrder;

  @Column()
  orderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  @Column()
  fromUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toUserId' })
  toUser: User;

  @Column()
  toUserId: string;

  @Column({ type: 'tinyint' })
  score: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /**
   * Sous-notes par catégorie (1-5), toutes optionnelles.
   * Permettent à l'utilisateur d'évaluer plus finement chaque aspect de la course.
   * `score` reste le rating principal ; ces colonnes sont strictement additionnelles.
   */
  @Column({ type: 'tinyint', nullable: true })
  punctualityScore: number | null;

  @Column({ type: 'tinyint', nullable: true })
  communicationScore: number | null;

  @Column({ type: 'tinyint', nullable: true })
  courtesyScore: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
