/**
 * Modèles partagés avec le backend NestJS (voir backend/src/users, auth).
 * Reste synchronisé avec admin-dashboard/src/app/auth/auth.service.ts (User)
 * et mobile_app (mêmes champs côté Flutter).
 */

export type Role = 'CLIENT' | 'LIVREUR' | 'COMMERCANT' | 'ADMIN';

export type VehicleType = 'MOTO' | 'VOITURE' | 'TRICYCLE';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  profilePhotoUrl?: string;
  status?: UserStatus;
  driverApprovalStatus?: DriverApprovalStatus;
  isAvailable?: boolean;
  isPublic?: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  role: Exclude<Role, 'ADMIN'>;
  vehicleType?: VehicleType;
}
