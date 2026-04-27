import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSavedAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string;
}
