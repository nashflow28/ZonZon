import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MaxLength(255)
  pickupAddress: string;

  @IsOptional()
  @IsLatitude()
  pickupLat?: number;

  @IsOptional()
  @IsLongitude()
  pickupLng?: number;

  @IsString()
  @MaxLength(255)
  deliveryAddress: string;

  @IsOptional()
  @IsLatitude()
  deliveryLat?: number;

  @IsOptional()
  @IsLongitude()
  deliveryLng?: number;

  @IsString()
  @MaxLength(500)
  description: string;

  /**
   * Livreur choisi manuellement par le client (réservation) — Priorité 3,
   * Lot 3, item 1. Optionnel : si absent, comportement de broadcast normal.
   */
  @IsOptional()
  @IsUUID()
  preferredLivreurId?: string;
}
