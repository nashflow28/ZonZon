import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Affiliation M:N entre un COMMERCANT et un LIVREUR (Priorité 3, Lot 3,
 * item 2). Un livreur peut être affilié à plusieurs commerçants et
 * inversement — cette table de jointure porte la relation.
 *
 * Utilisée pour :
 * - lister les livreurs "de confiance" d'un commerçant (écran de gestion) ;
 * - prioriser ces livreurs dans `GET /orders/available-drivers` (flag
 *   `isAffiliated`) ;
 * - autoriser (au choix) l'attribution manuelle d'une course à un livreur
 *   affilié même s'il n'est pas immédiatement disponible (cf. Lot 3, item 1).
 */
@Entity('merchant_drivers')
@Unique('UQ_merchant_drivers_merchant_driver', ['merchantId', 'driverId'])
export class MerchantDriver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  merchantId: string;

  @Column({ type: 'varchar', length: 36 })
  driverId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: User;

  @CreateDateColumn()
  createdAt: Date;
}
