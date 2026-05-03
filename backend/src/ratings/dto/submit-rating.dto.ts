import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctualityScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communicationScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  courtesyScore?: number;
}
