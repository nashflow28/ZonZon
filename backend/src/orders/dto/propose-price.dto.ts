import { IsInt, Max, Min } from 'class-validator';

export class ProposePriceDto {
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  priceFcfa: number;
}
