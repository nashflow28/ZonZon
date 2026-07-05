import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../entities/user.entity';
import { VehicleType } from '../../entities/vehicle.entity';

/**
 * Rôles autorisés à l'auto-inscription publique (`POST /auth/register`).
 * ADMIN est volontairement exclu : ce rôle ne doit JAMAIS pouvoir être
 * obtenu via l'inscription publique (cf. audit sécurité — escalade de
 * privilèges). La création d'un ADMIN doit passer par un canal manuel
 * (accès direct DB / futur endpoint admin protégé).
 */
export const REGISTRABLE_ROLES = [
  UserRole.CLIENT,
  UserRole.LIVREUR,
  UserRole.COMMERCANT,
] as const;

export type RegistrableRole = (typeof REGISTRABLE_ROLES)[number];

export class RegisterDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @IsString()
  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  password: string;

  @IsIn(REGISTRABLE_ROLES, {
    message: 'Rôle invalide (rôles autorisés : CLIENT, LIVREUR, COMMERCANT)',
  })
  role: RegistrableRole;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}
