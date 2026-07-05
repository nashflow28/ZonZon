import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePricingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  pricePerKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minPriceFcfa?: number;
}
