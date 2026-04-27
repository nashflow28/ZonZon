import { Injectable, signal, inject, effect, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../environments/environment';

/**
 * Wrap un client socket.io pour exposer l'etat de connexion temps reel.
 *
 * Etats possibles :
 * - 'connected'    : socket pret (point vert pulsant)
 * - 'disconnected' : socket ferme normalement (point gris)
 * - 'error'        : erreur reseau / auth (point rouge)
 */
export type LiveStatus = 'connected' | 'disconnected' | 'error';

@Injectable({ providedIn: 'root' })
export class LiveStatusService implements OnDestroy {
  private authService = inject(AuthService);

  readonly status = signal<LiveStatus>('disconnected');
  readonly isConnected = signal<boolean>(false);

  private socket: Socket | null = null;

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  connect(): void {
    if (this.socket) {
      return;
    }
    const token = this.authService.getToken();
    if (!token) {
      this.status.set('disconnected');
      this.isConnected.set(false);
      return;
    }

    try {
      this.socket = io(environment.apiUrl, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500
      });

      this.socket.on('connect', () => {
        this.status.set('connected');
        this.isConnected.set(true);
      });
      this.socket.on('disconnect', () => {
        this.status.set('disconnected');
        this.isConnected.set(false);
      });
      this.socket.on('connect_error', () => {
        this.status.set('error');
        this.isConnected.set(false);
      });
      this.socket.io.on('error', () => {
        this.status.set('error');
        this.isConnected.set(false);
      });
    } catch {
      this.status.set('error');
      this.isConnected.set(false);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.status.set('disconnected');
    this.isConnected.set(false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Chat (admin = lecture seule, on rejoint la room d'une commande pour
  // recevoir les messages live et les afficher dans le panneau de détail)
  // ──────────────────────────────────────────────────────────────────────────

  joinOrderChat(orderId: string): void {
    this.socket?.emit('chat:join', { orderId });
  }

  leaveOrderChat(orderId: string): void {
    this.socket?.emit('chat:leave', { orderId });
  }

  /**
   * Souscrit aux nouveaux messages d'une commande. Retourne une fonction
   * de cleanup à appeler au unsubscribe.
   */
  onChatMessage(orderId: string, handler: (message: any) => void): () => void {
    if (!this.socket) return () => {};
    const listener = (payload: any) => {
      if (payload?.orderId === orderId && payload?.message) {
        handler(payload.message);
      }
    };
    this.socket.on('chat:message', listener);
    return () => this.socket?.off('chat:message', listener);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
