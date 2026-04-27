import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

export enum CommissionStatus {
  DUE = 'DUE',
  PAID = 'PAID',
}

@Entity('commissions')
@Unique(['livreur', 'weekStart'])
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  livreur: User;

  @Column({ type: 'date' })
  weekStart: string;

  @Column({ type: 'date' })
  weekEnd: string;

  @Column('int', { default: 0 })
  completedCount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalRevenue: number;

  @Column('decimal', { precision: 5, scale: 4, default: 0.35 })
  commissionRate: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  commissionDue: number;

  @Column({ type: 'enum', enum: CommissionStatus, default: CommissionStatus.DUE })
  status: CommissionStatus;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
