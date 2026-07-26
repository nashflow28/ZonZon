import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Préférences d'affichage personnelles pour un fil direct entre deux users. */
@Entity('direct_thread_states')
@Unique(['ownerId', 'contactId'])
@Index(['ownerId'])
export class DirectThreadState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  ownerId: string;

  @Column({ type: 'varchar', length: 36 })
  contactId: string;

  /** Les messages antérieurs ou égaux sont masqués uniquement pour ownerId. */
  @Column({ type: 'datetime', precision: 6 })
  hiddenBefore: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
