import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
