import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  SignalementStatus,
  SignalementTargetType,
} from '../../entities/signalement.entity';

/**
 * Query params pour `GET /signalements` (ADMIN).
 * Le `ValidationPipe` global avec `transform: true` convertit les strings
 * de la query en number selon les décorateurs ci-dessous.
 */
export class ListSignalementsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(SignalementStatus)
  status?: SignalementStatus;

  @IsOptional()
  @IsEnum(SignalementTargetType)
  targetType?: SignalementTargetType;
}
