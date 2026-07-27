import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Suppression de compte en self-service (`DELETE /users/me`).
 *
 * Volontairement PAS de `@MinLength(6)` ici, contrairement à `RegisterDto` :
 * la règle de longueur s'applique à la création d'un mot de passe, pas à sa
 * vérification. L'imposer ici transformerait « mauvais mot de passe trop
 * court » en 400 (erreur de validation) au lieu du 403 attendu par le contrat
 * d'API, et renseignerait au passage sur la politique de mot de passe.
 */
export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  password: string;
}
