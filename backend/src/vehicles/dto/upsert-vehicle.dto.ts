import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { VehicleType } from '../../entities/vehicle.entity';

export class UpsertVehicleDto {
  @IsEnum(VehicleType)
  type: VehicleType;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /**
   * Zone habituelle du livreur. `undefined` = champ non fourni (on ne touche
   * pas à la valeur existante) ; `null` explicite = retire la zone.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  usualZoneId?: string | null;
}
