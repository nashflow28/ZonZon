import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Dernière position connue d'un livreur.
 * Une seule ligne par livreur (mise à jour à chaque émission `driver:location`).
 * Sert au fallback FCM (filtrage géo) et au tracking historique léger.
 *
 * On ne stocke PAS l'historique row-par-row ici : la table grossirait sans
 * valeur tangible. Une table `driver_position_history` pourra être ajoutée
 * plus tard si le besoin se présente.
 */
@Entity('driver_positions')
@Index(['updatedAt'])
export class DriverPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'livreurId' })
  livreur: User;

  @Column({ type: 'varchar', length: 64, unique: true })
  livreurId: string;

  @Column('float')
  lat: number;

  @Column('float')
  lng: number;

  /** Si la course est en cours, l'orderId associé pour tracking historique. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  orderId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
