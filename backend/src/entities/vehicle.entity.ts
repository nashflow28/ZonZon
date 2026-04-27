import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
