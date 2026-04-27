import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ShopCategory } from '../../entities/shop.entity';

export class CreateShopDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEnum(ShopCategory)
  category: ShopCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  address: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hours?: string;
}
