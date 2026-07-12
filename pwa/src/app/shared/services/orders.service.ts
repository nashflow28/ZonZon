import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateOrderPayload,
  EstimateResult,
  EtaResult,
  Order,
  OrderStatus,
  PaymentHistoryEntry,
  PaymentStatus,
  StatusHistoryEntry,
  isTerminalOrderStatus,
} from '../models/order.model';

const BASE = `${environment.apiUrl}${environment.apiPrefix}/orders`;

/**
 * Service commandes, partagé par tous les rôles.
 *
 * Le backend n'expose pas de `GET /orders/:id` — seulement `GET /orders/mine`
 * (liste complète de l'utilisateur courant). On maintient donc un petit store
 * en mémoire (signal) alimenté par `refresh()`, que les écrans (accueil,
 * liste, suivi) peuvent lire/rafraîchir sans dupliquer la logique HTTP.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private http = inject(HttpClient);

  private readonly _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();

  readonly activeOrders = computed(() =>
    this._orders().filter((o) => !isTerminalOrderStatus(o.status))
  );
  readonly pastOrders = computed(() =>
    this._orders().filter((o) => isTerminalOrderStatus(o.status))
  );

  /** Recharge `/orders/mine` et met à jour le store partagé. */
  refresh(): Observable<Order[]> {
    return this.http
      .get<Order[]>(`${BASE}/mine`)
      .pipe(tap((orders) => this._orders.set(orders)));
  }

  findCached(orderId: string): Order | undefined {
    return this._orders().find((o) => o.id === orderId);
  }

  /** Fusionne/ajoute une commande dans le store (ex. après création ou event socket). */
  upsertCached(order: Order): void {
    this._orders.update((list) => {
      const idx = list.findIndex((o) => o.id === order.id);
      if (idx === -1) return [order, ...list];
      const next = [...list];
      next[idx] = { ...next[idx], ...order };
      return next;
    });
  }

  patchCachedStatus(orderId: string, status: OrderStatus): void {
    this._orders.update((list) =>
      list.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
  }

  patchCachedPayment(orderId: string, paymentStatus: PaymentStatus): void {
    this._orders.update((list) =>
      list.map((o) => (o.id === orderId ? { ...o, paymentStatus } : o))
    );
  }

  estimate(payload: {
    pickupLat: number;
    pickupLng: number;
    deliveryLat: number;
    deliveryLng: number;
    pickupZoneId?: string;
    destinationZoneId?: string;
  }): Observable<EstimateResult> {
    return this.http.post<EstimateResult>(`${BASE}/estimate`, payload);
  }

  create(payload: CreateOrderPayload): Observable<Order> {
    return this.http
      .post<Order>(BASE, payload)
      .pipe(tap((order) => this.upsertCached(order)));
  }

  eta(orderId: string): Observable<EtaResult> {
    return this.http.get<EtaResult>(`${BASE}/${orderId}/eta`);
  }

  updateStatus(
    orderId: string,
    status: OrderStatus,
    cancellationReason?: string
  ): Observable<Order> {
    return this.http
      .patch<Order>(`${BASE}/${orderId}/status`, { status, cancellationReason })
      .pipe(tap((order) => this.upsertCached(order)));
  }

  history(orderId: string): Observable<StatusHistoryEntry[]> {
    return this.http.get<StatusHistoryEntry[]>(`${BASE}/${orderId}/history`);
  }

  paymentHistory(orderId: string): Observable<PaymentHistoryEntry[]> {
    return this.http.get<PaymentHistoryEntry[]>(
      `${BASE}/${orderId}/payment-history`
    );
  }

  submitRating(
    orderId: string,
    payload: {
      score: number;
      punctualityScore?: number;
      communicationScore?: number;
      courtesyScore?: number;
    }
  ): Observable<unknown> {
    return this.http.post(`${BASE}/${orderId}/rating`, payload);
  }
}
