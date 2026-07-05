import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Priorité 3 backlog V1 : tarif au km configurable par l'admin.
 *
 * Conçue comme un singleton — une seule ligne, `id = 1` fixe (get-or-create
 * via `PricingService.getConfig()`). Évite l'overhead d'une table de config
 * générique clé/valeur pour un besoin aussi simple.
 */
@Entity('pricing_config')
export class PricingConfig {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', default: 200 })
  pricePerKm: number;

  /** Prix plancher optionnel (FCFA). `null` = pas de plancher. */
  @Column({ type: 'int', nullable: true })
  minPriceFcfa: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
