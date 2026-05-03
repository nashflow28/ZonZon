import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { OrderStatus } from '../../entities/delivery-order.entity';

/**
 * Query params pour `GET /orders` (ADMIN, LIVREUR).
 * Le `ValidationPipe` global avec `transform: true` convertit les strings
 * de la query en number/Date selon les décorateurs ci-dessous.
 */
export class ListOrdersDto {
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
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Date ISO (YYYY-MM-DD ou ISO complet). Inclus, borne basse sur createdAt. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Date ISO (YYYY-MM-DD ou ISO complet). Inclus, borne haute sur createdAt. */
  @IsOptional()
  @IsDateString()
  to?: string;
}
