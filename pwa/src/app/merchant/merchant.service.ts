import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ConversationResponse,
  InviteDriverPayload,
  MerchantDriver,
} from './merchant.model';

const DRIVERS_BASE = `${environment.apiUrl}${environment.apiPrefix}/merchants/me/drivers`;
const ORDERS_BASE = `${environment.apiUrl}${environment.apiPrefix}/orders`;

/**
 * Appels HTTP spécifiques au rôle Commerçant : livreurs affiliés (invite/
 * retrait) et conversation multi-participants. Les endpoints `/orders/*`
 * partagés (création Type 1, attribution, prix, paiement) restent dans
 * `OrdersService` (shared/services), cohérent avec le domaine "commande".
 */
@Injectable({ providedIn: 'root' })
export class MerchantService {
  private http = inject(HttpClient);

  listDrivers(): Observable<MerchantDriver[]> {
    return this.http.get<MerchantDriver[]>(DRIVERS_BASE);
  }

  /**
   * Invite un livreur (par compte ou téléphone). Le retour porte le statut
   * réel de l'affiliation (`PENDING` tant que le livreur n'a pas accepté) —
   * ne jamais afficher "affilié avec succès" avant `ACTIVE`.
   */
  inviteDriver(payload: InviteDriverPayload): Observable<MerchantDriver> {
    return this.http.post<MerchantDriver>(DRIVERS_BASE, payload);
  }

  /** Retrait (soft) d'une affiliation — passe en `REMOVED`, conservée pour historique. */
  removeDriver(driverId: string): Observable<unknown> {
    return this.http.delete(`${DRIVERS_BASE}/${driverId}`);
  }

  getConversation(orderId: string): Observable<ConversationResponse> {
    return this.http.get<ConversationResponse>(`${ORDERS_BASE}/${orderId}/conversation`);
  }

  /** Le commerçant s'inclut explicitement dans la conversation de sa livraison. */
  joinConversation(orderId: string): Observable<unknown> {
    return this.http.post(`${ORDERS_BASE}/${orderId}/conversation/participants`, {});
  }

  /** Quitte la conversation (départ soft, réversible en rejoignant à nouveau). */
  leaveConversation(orderId: string): Observable<unknown> {
    return this.http.delete(`${ORDERS_BASE}/${orderId}/conversation/participants/me`);
  }
}
