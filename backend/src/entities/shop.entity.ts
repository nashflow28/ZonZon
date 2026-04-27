import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';

export enum ShopCategory {
  RESTAURANT = 'RESTAURANT',
  SUPERMARKET = 'SUPERMARKET',
  BAKERY = 'BAKERY',
  PHARMACY = 'PHARMACY',
  FASHION = 'FASHION',
  ELECTRONICS = 'ELECTRONICS',
  BEAUTY = 'BEAUTY',
  HARDWARE = 'HARDWARE',
  BOOKS = 'BOOKS',
  OTHER = 'OTHER',
}

export enum ShopStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

@Entity('shops')
@Index(['status', 'category'])
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'enum', enum: ShopCategory, default: ShopCategory.OTHER })
  category: ShopCategory;

  @Column({ type: 'enum', enum: ShopStatus, default: ShopStatus.PENDING })
  status: ShopStatus;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text' })
  address: string;

  @Column('float')
  lat: number;

  @Column('float')
  lng: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  /** Horaires en texte libre simple : "Lun-Sam 8h-20h" — assez en v1 */
  @Column({ type: 'varchar', length: 200, nullable: true })
  hours?: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @OneToMany(() => Product, (p) => p.shop)
  products: Product[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
