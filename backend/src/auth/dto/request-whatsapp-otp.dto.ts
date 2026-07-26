import { Matches } from 'class-validator';

export class RequestWhatsappOtpDto {
  @Matches(/^\+[1-9][0-9]{7,14}$/, {
    message: 'Le téléphone doit être au format international, ex. +22890000000',
  })
  phone: string;
}
