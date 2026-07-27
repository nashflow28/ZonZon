import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Code invalide' })
  code: string;

  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  newPassword: string;
}
