import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Résout le livreur à affilier soit par son `driverId` (compte existant),
 * soit par son numéro de téléphone (`driverPhone`). Au moins un des deux
 * doit être fourni (vérifié dans le contrôleur).
 */
export class AddMerchantDriverDto {
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;
}
