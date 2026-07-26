import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchMerchantClientsQueryDto {
  @IsString()
  @MaxLength(80)
  query: string;

  /**
   * `@Type` est indispensable : le ValidationPipe global n'active pas
   * `enableImplicitConversion`, donc sans lui `limit` reste la chaîne "8"
   * issue de la query string et `@IsInt()` échoue — la route renvoyait 400
   * dès que le client fournissait ce paramètre (ce que le mobile fait
   * systématiquement).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
