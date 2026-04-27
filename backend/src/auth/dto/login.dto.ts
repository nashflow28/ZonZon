import { IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @IsString()
  @MinLength(1)
  password: string;
}
