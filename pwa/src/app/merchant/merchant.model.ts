/**
 * Modèles spécifiques au rôle Commerçant (affiliation livreurs, conversation
 * multi-participants). Synchronisés avec backend/src/merchant-drivers et
 * backend/src/conversations.
 */

export type MerchantDriverStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REMOVED';

export interface MerchantDriverVehicleRef {
  type: string;
  licensePlate?: string | null;
}

/** Livreur affilié (toutes statuts confondus) — `GET /merchants/me/drivers`. */
export interface MerchantDriver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  vehicle?: MerchantDriverVehicleRef | null;
  status: MerchantDriverStatus;
}

export interface InviteDriverPayload {
  driverId?: string;
  driverPhone?: string;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface ConversationResponse {
  conversation: { id: string; deliveryId: string };
  participants: ConversationParticipant[];
}
