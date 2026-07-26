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

  /** Forfait appliqué aux courses dont la distance ne dépasse pas le seuil. */
  @Column({ type: 'int', default: 500 })
  minPriceFcfa: number;

  /** Jusqu'à cette distance incluse, le forfait `minPriceFcfa` s'applique. */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 2.5,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  shortTripMaxDistanceKm: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
