import { IsString, Matches } from 'class-validator';

export class VerifyWhatsappOtpDto {
  @Matches(/^\+[1-9][0-9]{7,14}$/, {
    message: 'Le téléphone doit être au format international',
  })
  phone: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Le code doit contenir 6 chiffres' })
  code: string;
}
