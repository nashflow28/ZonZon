import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Priorité 3 backlog V1 : liste gérable des quartiers/zones de Lomé.
 * Version simple — pas de tarif par zone (juste un référentiel pour les
 * dropdowns côté mobile/admin).
 */
@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /**
   * Description libre de la zone (ex: repères, limites) — CDC V1 §7,
   * enrichissement du référentiel zones. Optionnel.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /**
   * Prix de base (FCFA) optionnel spécifique à la zone. Non utilisé
   * automatiquement par le calcul de prix en V1 (le tarif global reste la
   * source de vérité, cf. `PricingService`) — champ informatif/préparatoire
   * pour une tarification par zone future.
   */
  @Column({ type: 'int', nullable: true })
  basePrice: number | null;

  /**
   * Tarif au km (FCFA) qui surcharge le tarif global pour cette zone, si
   * renseigné. Non appliqué automatiquement au calcul de prix en V1 (même
   * remarque que `basePrice`) — champ préparatoire.
   */
  @Column({ type: 'int', nullable: true })
  pricePerKmOverride: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
