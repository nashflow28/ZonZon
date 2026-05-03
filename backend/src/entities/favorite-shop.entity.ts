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
import { User } from './user.entity';
import { Shop } from './shop.entity';

/**
 * Lien favoris user → boutique. Un user ne peut favoriser une boutique
 * qu'une seule fois (contrainte UNIQUE (userId, shopId)).
 */
@Entity('favorite_shops')
@Unique(['userId', 'shopId'])
@Index(['userId', 'createdAt'])
export class FavoriteShop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column()
  shopId: string;

  @CreateDateColumn()
  createdAt: Date;
}
