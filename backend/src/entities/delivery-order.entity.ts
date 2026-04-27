import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
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

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  priceFcfa: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
