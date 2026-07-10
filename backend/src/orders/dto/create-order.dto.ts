import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateOrderDto {
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

  /**
   * Livreur choisi manuellement par le client (réservation) — Priorité 3,
   * Lot 3, item 1. Optionnel : si absent, comportement de broadcast normal.
   */
  @IsOptional()
  @IsUUID()
  preferredLivreurId?: string;

  /**
   * Zone de retrait (référentiel `zones`, CDC V1 §7) — optionnelle,
   * renseignée par le client. Aucune dérivation automatique depuis les
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
