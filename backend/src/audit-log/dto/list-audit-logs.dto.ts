import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query params pour `GET /admin/audit-logs` (ADMIN).
 * Filtres : adminId, targetType, action, from, to (sur createdAt).
 */
export class ListAuditLogsDto {
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
  @IsString()
  @MaxLength(64)
  adminId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  /** Date ISO (YYYY-MM-DD ou ISO complet). Inclus, borne basse sur createdAt. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Date ISO (YYYY-MM-DD ou ISO complet). Inclus, borne haute sur createdAt. */
  @IsOptional()
  @IsDateString()
  to?: string;
}
