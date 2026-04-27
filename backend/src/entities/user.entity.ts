import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { DeliveryOrder } from './delivery-order.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  LIVREUR = 'LIVREUR',
  COMMERCANT = 'COMMERCANT',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENT })
  role: UserRole;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  phone: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ nullable: true })
  profilePhotoUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fcmToken?: string | null;

  @OneToOne(() => Vehicle, (vehicle) => vehicle.driver)
  vehicle: Vehicle;

  @OneToMany(() => DeliveryOrder, (order) => order.client)
  clientOrders: DeliveryOrder[];

  @OneToMany(() => DeliveryOrder, (order) => order.livreur)
  livreurOrders: DeliveryOrder[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
