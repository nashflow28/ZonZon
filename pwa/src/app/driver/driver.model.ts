/**
 * Modèles spécifiques au rôle Livreur (véhicule, affiliations commerçant).
 * Synchronisés avec backend/src/vehicles et backend/src/merchant-drivers.
 */

export type VehicleType = 'MOTO' | 'VOITURE' | 'TRICYCLE';

export interface VehicleZoneRef {
  id: string;
  name: string;
}

export interface Vehicle {
  type: VehicleType;
  licensePlate?: string | null;
  description?: string | null;
  usualZone?: VehicleZoneRef | null;
}

export interface UpsertVehiclePayload {
  type: VehicleType;
  licensePlate?: string;
  description?: string;
  usualZoneId?: string | null;
}

export type AffiliationStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REMOVED';

export interface AffiliationMerchantRef {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface Affiliation {
  merchantId: string;
  status: AffiliationStatus;
  acceptedAt: string | null;
  removedAt: string | null;
  createdAt: string;
  merchant: AffiliationMerchantRef | null;
}
