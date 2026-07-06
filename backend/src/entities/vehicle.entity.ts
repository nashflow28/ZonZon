import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Zone } from './zone.entity';

export enum VehicleType {
  MOTO = 'MOTO',
  VOITURE = 'VOITURE',
  TRICYCLE = 'TRICYCLE',
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: VehicleType, default: VehicleType.MOTO })
  type: VehicleType;

  @Column({ nullable: true })
  licensePlate: string;

  @Column({ nullable: true })
  description: string;

  @OneToOne(() => User, (user) => user.vehicle)
  @JoinColumn()
  driver: User;

  /**
   * Zone habituelle du livreur (Priorité 3 backlog V1) : utile pour
   * l'attribution manuelle et pour que l'admin voie le secteur du livreur
   * en attente de validation. Nullable : un livreur peut ne pas en déclarer.
   */
  @ManyToOne(() => Zone, { nullable: true })
  @JoinColumn()
  usualZone: Zone | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
