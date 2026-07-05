import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateMerchantOrderDto {
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
}
