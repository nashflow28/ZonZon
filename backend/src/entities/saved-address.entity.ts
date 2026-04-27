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

@Entity('saved_addresses')
@Index(['userId', 'createdAt'])
export class SavedAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ length: 60 })
  label: string;

  @Column({ type: 'text' })
  address: string;

  @Column('float')
  lat: number;

  @Column('float')
  lng: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icon?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
