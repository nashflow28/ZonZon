import { Matches } from 'class-validator';

export class RequestPasswordResetDto {
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;
}
