import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectShopDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
