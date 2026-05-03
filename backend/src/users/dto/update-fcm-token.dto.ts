import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ALLOWED_PLATFORMS = ['android', 'ios', 'web'] as const;

export class UpdateFcmTokenDto {
  /**
   * Token FCM à enregistrer.
   * - String non vide → upsert
   * - null / absent → délistage (cf. previousToken pour cibler un device précis)
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  token?: string | null;

  /**
   * Plateforme du device (default: 'android'). Sert au tri/debug côté admin
   * et à de futures stratégies d'envoi différenciées (ex: payload iOS).
   */
  @IsOptional()
  @IsIn(ALLOWED_PLATFORMS as unknown as string[])
  platform?: 'android' | 'ios' | 'web';

  /**
   * Token à supprimer quand le mobile fait un logout d'un device précis
   * mais sans envoyer un nouveau token. Si absent et `token` est null,
   * tous les tokens du user sont supprimés (rétro-compat).
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  previousToken?: string | null;

  /**
   * Alias de previousToken pour le wording suggéré dans la spec interne.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  lastToken?: string | null;
}
