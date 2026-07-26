import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface Order {
  id: string;
  pickupAddress: string;
  deliveryAddress: string;
  description: string;
  distanceKm: number;
  priceFcfa: number;
  status: string;
  /// Statut de paiement (optionnel : pas forcément renvoyé par tous les
  /// endpoints/anciens déploiements). Valeurs backend : UNPAID, PAID,
  /// PAY_ON_DELIVERY, RECEIVED_BY_MERCHANT, RECEIVED_BY_LIVREUR.
  paymentStatus?: string;
  createdAt: string;
  client: any;
  livreur?: any;
}

/// Filtres acceptés par l'endpoint paginé `/orders`.
export interface OrdersFilter {
  page?: number;
  limit?: number;
  status?: string;
  from?: string; // ISO date (yyyy-MM-dd)
  to?: string;   // ISO date (yyyy-MM-dd)
}

/// Forme paginée renvoyée par le backend (nouveau contrat).
export interface PagedOrders {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/// Valeurs possibles du statut de paiement (contrat backend déployé).
/**
 * Doit rester aligné sur `PaymentStatus` du backend
 * (`backend/src/entities/delivery-order.entity.ts`). `CASH_ON_DELIVERY` est le
 * statut posé par le livreur à la livraison — chemin nominal du paiement au
 * Togo — et `REFUNDED` celui du commerçant.
 */
export type PaymentStatus =
  | 'UNPAID'
  | 'PAID'
  | 'PAY_ON_DELIVERY'
  | 'RECEIVED_BY_MERCHANT'
  | 'RECEIVED_BY_LIVREUR'
  | 'CASH_ON_DELIVERY'
  | 'REFUNDED';

/// Livreur disponible pour une réassignation manuelle, tel que renvoyé par
/// `GET /orders/available-drivers`.
export interface AvailableDriver {
  id: string;
  firstName: string;
  lastName: string;
  vehicle?: string | null;
  distanceKm?: number | null;
  isAffiliated: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OrdersService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}${environment.apiPrefix}/orders`;

  /// Ancien contrat — retourne un array brut. Le backend, après migration,
  /// renvoie `{items, total, ...}` : on déballe dans ce cas pour conserver la
  /// rétro-compatibilité avec les pages qui ne paginent pas (ex: dashboard).
  getOrders(): Observable<Order[]> {
    return this.http.get<Order[] | PagedOrders>(this.apiUrl).pipe(
      map((res) => Array.isArray(res) ? res : (res?.items ?? []))
    );
  }

  /// Nouveau contrat paginé. Si le backend renvoie encore un array brut
  /// (ancien déploiement), on l'enveloppe dans la forme paginée pour ne pas
  /// casser l'appelant.
  getOrdersPaged(filter: OrdersFilter = {}): Observable<PagedOrders> {
    let params = new HttpParams();
    if (filter.page) params = params.set('page', String(filter.page));
    if (filter.limit) params = params.set('limit', String(filter.limit));
    if (filter.status && filter.status !== 'ALL') params = params.set('status', filter.status);
    if (filter.from) params = params.set('from', filter.from);
    if (filter.to) params = params.set('to', filter.to);

    return this.http.get<Order[] | PagedOrders>(this.apiUrl, { params }).pipe(
      map((res) => {
        if (Array.isArray(res)) {
          return {
            items: res,
            total: res.length,
            page: filter.page ?? 1,
            limit: filter.limit ?? res.length,
            hasMore: false,
          };
        }
        return res;
      })
    );
  }

  /// Met à jour le statut de paiement d'une livraison.
  /// Backend : PATCH /orders/:id/payment-status { paymentStatus }
  updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Observable<Order> {
    return this.http.patch<Order>(`${this.apiUrl}/${orderId}/payment-status`, { paymentStatus });
  }

  /// Réassigne manuellement un livreur à une course encore PENDING.
  /// Backend : PATCH /orders/:id/assign { livreurId }
  assignDriver(orderId: string, livreurId: string): Observable<Order> {
    return this.http.patch<Order>(`${this.apiUrl}/${orderId}/assign`, { livreurId });
  }

  /// Liste des livreurs disponibles pour un choix manuel (avec distance
  /// optionnelle si lat/lng fournis).
  /// Backend : GET /orders/available-drivers?lat=&lng=
  getAvailableDrivers(lat?: number, lng?: number): Observable<AvailableDriver[]> {
    let params = new HttpParams();
    if (lat !== undefined) params = params.set('lat', String(lat));
    if (lng !== undefined) params = params.set('lng', String(lng));
    return this.http.get<AvailableDriver[]>(`${this.apiUrl}/available-drivers`, { params });
  }
}
