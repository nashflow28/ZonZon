import { Injectable, inject } from '@angular/core';
import { paymentLabel, statusLabel } from '../status-utils';
import { SocketService } from './socket.service';
import { WebPushService } from './web-push.service';

/**
 * Relie les événements Socket.IO déjà diffusés par le backend (statut de
 * commande, paiement, nouvelle course, message chat) à `WebPushService`, pour
 * afficher une notification locale quand l'onglet n'est pas au premier plan.
 *
 * Ce n'est PAS du Web Push (rien ne se passe si l'app est totalement fermée
 * ou le service worker non réveillé) — voir les limites documentées dans
 * `WebPushService`. C'est un pont léger sur l'infra temps réel déjà livrée.
 *
 * `start()` doit être appelé juste après `SocketService.connect()` (le socket
 * doit déjà exister — cf. `SocketService.on$` qui ne s'attache qu'au socket
 * courant au moment du subscribe). Idempotent : un second appel est ignoré.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeNotificationsBridge {
  private socketService = inject(SocketService);
  private webPush = inject(WebPushService);

  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.socketService
      .on$<{ orderId: string; status: string }>('orderStatusUpdated')
      .subscribe(({ status }) => {
        this.webPush.notifyLocal('ZonZon', `Statut de votre course : ${statusLabel(status)}`);
      });

    this.socketService
      .on$<{ orderId: string; paymentStatus: string }>('orderPaymentUpdated')
      .subscribe(({ paymentStatus }) => {
        this.webPush.notifyLocal('ZonZon', `Paiement : ${paymentLabel(paymentStatus)}`);
      });

    this.socketService
      .on$<{ orderId: string; livreurId: string }>('orderAccepted')
      .subscribe(() => {
        this.webPush.notifyLocal('ZonZon', 'Un livreur a accepté votre course.');
      });

    this.socketService.on$<{ id: string; pickupAddress?: string }>('newOrderAvailable').subscribe(() => {
      this.webPush.notifyLocal('ZonZon', 'Nouvelle course disponible près de vous.');
    });

    this.socketService.on$<{ orderId: string }>('chat:message').subscribe(() => {
      this.webPush.notifyLocal('ZonZon', 'Nouveau message.');
    });

    this.socketService.on$<{ senderId: string }>('direct:message').subscribe(() => {
      this.webPush.notifyLocal('ZonZon', 'Nouveau message.');
    });
  }

  /** Réinitialise l'état "démarré" — utile après un logout/reconnect avec un nouveau socket. */
  reset(): void {
    this.started = false;
  }
}
