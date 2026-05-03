import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('delivery_orders')
export class DeliveryOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.clientOrders)
  client: User;

  @ManyToOne(() => User, (user) => user.livreurOrders, { nullable: true })
  livreur: User;

  @Column('text')
  pickupAddress: string;

  @Column('float', { nullable: true })
  pickupLat: number;

  @Column('float', { nullable: true })
  pickupLng: number;

  @Column('text')
  deliveryAddress: string;

  @Column('float', { nullable: true })
  deliveryLat: number;

  @Column('float', { nullable: true })
  deliveryLng: number;

  @Column('text')
  description: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  distanceKm: number;

  @Column({ type: 'int', nullable: true })
  priceFcfa: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({
    type: 'enum',
    enum: ['CLIENT', 'LIVREUR', 'ADMIN'],
    nullable: true,
  })
  cancelledBy: 'CLIENT' | 'LIVREUR' | 'ADMIN' | null;

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  inProgressAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
