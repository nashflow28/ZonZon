import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';

/**
 * Client Socket.IO partagé (temps réel — position livreur, statuts, chat,
 * notifications). Se connecte à la RACINE du backend (`environment.apiUrl`),
 * PAS au préfixe `/v1` (les WebSockets ont leur propre routing, indépendant
 * des controllers HTTP Nest — cf. backend/src/orders/orders.gateway.ts).
 *
 * Cycle de vie : `connect()` après login/restauration de session,
 * `disconnect()` au logout (géré par AuthService).
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private zone = inject(NgZone);
  private socket: Socket | null = null;

  get isConnected(): boolean {
    return this.socket?.connected === true;
  }

  connect(token: string): void {
    if (this.socket) return; // déjà connecté (ou en cours)
    const normalized = token.trim();
    if (!normalized) return;

    this.socket = io(environment.apiUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 8000,
      auth: { token: normalized },
      extraHeaders: { Authorization: `Bearer ${normalized}` },
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Observable typé sur un événement serveur→client. Se désabonne proprement au unsubscribe. */
  on$<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      if (!this.socket) return;
      const handler = (payload: T) => this.zone.run(() => subscriber.next(payload));
      this.socket.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }

  /** Observable qui émet à chaque (re)connexion — utile pour resynchroniser en HTTP. */
  get connected$(): Observable<void> {
    return new Observable<void>((subscriber) => {
      if (!this.socket) return;
      const handler = () => this.zone.run(() => subscriber.next());
      this.socket.on('connect', handler);
      return () => this.socket?.off('connect', handler);
    });
  }

  emit(event: string, payload?: unknown): void {
    this.socket?.emit(event, payload);
  }

  joinOrderRoom(orderId: string): void {
    this.emit('chat:join', { orderId });
  }

  leaveOrderRoom(orderId: string): void {
    this.emit('chat:leave', { orderId });
  }
}
