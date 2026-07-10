import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMerchantOrderDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(255)
  pickupAddress: string;

  @IsOptional()
  @IsLatitude()
  pickupLat?: number;

  @IsOptional()
  @IsLongitude()
  pickupLng?: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(255)
  deliveryAddress: string;

  @IsOptional()
  @IsLatitude()
  deliveryLat?: number;

  @IsOptional()
  @IsLongitude()
  deliveryLng?: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(500)
  description: string;

  /** Client identifié par son compte existant. */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** Client identifié par téléphone (avec ou sans compte). */
  @IsOptional()
  @Matches(/^\+?[0-9]{8,15}$/)
  clientPhone?: string;

  /** Nom du destinataire (utile surtout si pas de compte). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientName?: string;

  /**
   * Ajustement manuel du prix par le commerçant à la création.
   * Si fourni, remplace le calcul automatique (distance × tarif/km) tout
   * en conservant le calcul de `distanceKm` (utile pour stats/ETA).
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  priceFcfa?: number;

  /**
   * Raison optionnelle de l'ajustement manuel du prix (traçabilité, CDC V1
   * §6.3), enregistrée dans `price_changes` si `priceFcfa` est fourni.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  priceReason?: string;

  /**
   * Livreur choisi manuellement par le commerçant (réservation) —
   * Priorité 3, Lot 3, item 1. Optionnel : si absent, comportement de
   * broadcast normal (tous les livreurs éligibles).
   */
  @IsOptional()
  @IsUUID()
  preferredLivreurId?: string;

  /**
   * Zone de retrait (référentiel `zones`, CDC V1 §7) — optionnelle,
   * renseignée par le commerçant. Aucune dérivation automatique depuis les
   * coordonnées GPS en V1.
   */
  @IsOptional()
  @IsUUID()
  pickupZoneId?: string;

  /** Zone de destination (référentiel `zones`, CDC V1 §7) — optionnelle. */
  @IsOptional()
  @IsUUID()
  destinationZoneId?: string;
}
