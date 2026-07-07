import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class UpdatePriceDto {
  @IsInt()
  @Min(0)
  priceFcfa: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
