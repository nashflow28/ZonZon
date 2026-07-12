import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { DeliveryOrder } from './delivery-order.entity';

export enum DeliveryRunStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** A merchant batch assigned to one driver; each order remains independently tracked. */
@Entity('delivery_runs')
export class DeliveryRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  merchant: User;

  @ManyToOne(() => User, { nullable: true })
  livreur: User | null;

  @Column({
    type: 'enum',
    enum: DeliveryRunStatus,
    default: DeliveryRunStatus.OPEN,
  })
  status: DeliveryRunStatus;

  @OneToMany(() => DeliveryOrder, (order) => order.run)
  orders: DeliveryOrder[];

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
