import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export type DevicePlatform = 'android' | 'ios' | 'web';

/**
 * Token FCM associé à un appareil d'un utilisateur.
 * Un user peut avoir plusieurs tokens (téléphone + tablette par exemple).
 * Le token est unique : si un appareil est revendu et un autre user s'y connecte,
 * l'upsert réassocie le token au nouveau user.
 */
@Entity('device_tokens')
@Unique(['token'])
@Index(['userId', 'lastSeenAt'])
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'varchar', length: 512 })
  token: string;

  @Column({ type: 'varchar', length: 16, default: 'android' })
  platform: DevicePlatform;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastSeenAt: Date;
}
