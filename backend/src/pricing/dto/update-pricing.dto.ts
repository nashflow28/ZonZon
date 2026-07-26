import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePricingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  pricePerKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minPriceFcfa?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  shortTripMaxDistanceKm?: number;
}
