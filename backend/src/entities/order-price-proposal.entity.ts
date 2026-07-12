import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryOrder } from './delivery-order.entity';
import { User } from './user.entity';

export enum PriceProposalStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
}

@Entity('order_price_proposals')
@Index(['order', 'status', 'expiresAt'])
export class OrderPriceProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DeliveryOrder, { onDelete: 'CASCADE' })
  order: DeliveryOrder;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  livreur: User;

  @Column({ type: 'int' })
  priceFcfa: number;

  @Column({
    type: 'enum',
    enum: PriceProposalStatus,
    default: PriceProposalStatus.PENDING,
  })
  status: PriceProposalStatus;

  @Column({ type: 'datetime', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
