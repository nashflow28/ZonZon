/**
 * Modèles partagés avec le backend NestJS (voir backend/src/entities/delivery-order.entity.ts).
 * Utilisés par tous les rôles (client rond 2, livreur/commerçant rounds suivants).
 */

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE_PICKUP'
  | 'AT_PICKUP'
  | 'IN_PROGRESS'
  | 'NEAR_CLIENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type PaymentStatus =
  | 'UNPAID'
  | 'PAID'
  | 'PAY_ON_DELIVERY'
  | 'RECEIVED_BY_MERCHANT'
  | 'RECEIVED_BY_LIVREUR'
  | 'CASH_ON_DELIVERY'
  | 'REFUNDED';

/** Statuts qui ferment définitivement une course (plus d'action possible). */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'COMPLETED',
  'CANCELLED',
  'FAILED',
]);

export function isTerminalOrderStatus(status: OrderStatus | string | undefined | null): boolean {
  return !!status && TERMINAL_ORDER_STATUSES.has(status as OrderStatus);
}

/**
 * Statuts pour lesquels le paiement est considéré comme réglé — miroir de
 * `SETTLED_PAYMENT_STATUSES` côté backend, qui refuse tout double règlement.
 */
export const SETTLED_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>([
  'PAID',
  'RECEIVED_BY_LIVREUR',
  'RECEIVED_BY_MERCHANT',
  'CASH_ON_DELIVERY',
  'REFUNDED',
]);

/** Vrai si le paiement de la course est déjà réglé. */
export function isSettledPayment(status: PaymentStatus | string | undefined | null): boolean {
  return !!status && SETTLED_PAYMENT_STATUSES.has(status as PaymentStatus);
}

/** Référence utilisateur allégée telle que renvoyée dans les relations d'une commande. */
export interface OrderUserRef {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePhotoUrl?: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  description: string;
  distanceKm: number | null;
  priceFcfa: number | null;
  estimatedPrice: number | null;
  priceWasManuallyAdjusted?: boolean;
  cancellationReason?: string | null;
  client?: OrderUserRef | null;
  livreur?: OrderUserRef | null;
  merchant?: OrderUserRef | null;
  createdAt: string;
  acceptedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
}

export interface EstimateResult {
  distanceKm: number;
  priceFcfa: number;
  /** Paires [lat, lng] formant le tracé routier (OpenRouteService). */
  polyline: number[][];
}

export interface CreateOrderPayload {
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  description: string;
  pickupZoneId?: string;
  destinationZoneId?: string;
}

/** Payload `POST /orders/merchant` (Type 1, création par le commerçant). */
export interface CreateMerchantOrderPayload {
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  description: string;
  clientId?: string;
  clientPhone?: string;
  clientName?: string;
  priceFcfa?: number;
  priceReason?: string;
  preferredLivreurId?: string;
  runId?: string;
  pickupZoneId?: string;
  destinationZoneId?: string;
}

export interface DeliveryRun {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  livreur: AvailableDriver | null;
  orders?: Order[];
}

/** Réponse `GET /orders/available-drivers` — affiliés en tête, puis triés par distance. */
export interface AvailableDriver {
  id: string;
  firstName: string;
  lastName: string;
  vehicle: { type: string; licensePlate?: string | null } | null;
  distanceKm: number | null;
  isAffiliated: boolean;
}

export interface EtaResult {
  distanceKm: number | null;
  etaMinutes: number | null;
  basedOn: 'driver_position' | 'pickup' | 'unavailable';
  driverLat?: number;
  driverLng?: number;
  positionAt?: string;
}

export interface StatusHistoryEntry {
  id: string;
  status: OrderStatus;
  changedAt: string;
  changedBy?: string | null;
}

export interface PaymentHistoryEntry {
  id: string;
  paymentStatus: PaymentStatus;
  changedAt: string;
  changedBy?: string | null;
}

export interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string | null;
  sender?: OrderUserRef | null;
  type: string;
  content: string;
  readAt?: string | null;
  readBy?: string[];
  createdAt: string;
}

export interface Zone {
  id: string;
  name: string;
  active: boolean;
  description?: string | null;
  basePrice?: number | null;
  pricePerKmOverride?: number | null;
}

export interface AppNotification {
  id: string;
  deliveryId?: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
