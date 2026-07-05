import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';

export class AvailableDriversQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
