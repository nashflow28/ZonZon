import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * `@ValidateIf(v !== undefined)` plutôt que `@IsOptional()` : ce dernier ignore
 * aussi les valeurs `null`, qui atteignaient alors `UPDATE users SET firstName
 * = NULL` sur une colonne NOT NULL — soit une 500 au lieu d'un 400.
 * `@MinLength(2)` empêche par ailleurs d'enregistrer un nom vide, qui rendait
 * l'écran de profil définitivement inouvrable côté mobile (calcul des
 * initiales sur une chaîne vide).
 */
export class UpdateProfileDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;
}
