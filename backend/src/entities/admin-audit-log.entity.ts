import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export type AuditAction =
  | 'SHOP_APPROVE'
  | 'SHOP_REJECT'
  | 'SHOP_SUSPEND'
  | 'COMMISSION_MARK_PAID'
  | 'USER_DELETE'
  | 'USER_RESTORE';

@Entity('admin_audit_logs')
@Index(['adminId', 'createdAt'])
@Index(['targetType', 'targetId'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin: User | null;

  @Column({ nullable: true })
  adminId: string | null;

  /** Action effectuée — type chaîne libre côté DB pour évolutivité */
  @Column({ type: 'varchar', length: 64 })
  action: string;

  /** Type d'objet impacté (Shop, Commission, User, ...) */
  @Column({ type: 'varchar', length: 64 })
  targetType: string;

  /** UUID de l'objet impacté */
  @Column({ type: 'varchar', length: 64 })
  targetId: string;

  /** Métadonnées libres (raison de rejet, montant, etc.). JSON sérialisé */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
