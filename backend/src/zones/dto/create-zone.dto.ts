import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** Description libre de la zone (repères, limites...) — CDC V1 §7. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** Prix de base (FCFA) optionnel spécifique à la zone. */
  @IsOptional()
  @IsInt()
  @Min(0)
  basePrice?: number;

  /** Tarif au km (FCFA) qui surcharge le tarif global pour cette zone. */
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerKmOverride?: number;
}
