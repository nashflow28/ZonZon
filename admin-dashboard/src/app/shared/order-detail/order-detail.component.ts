import { Component, EventEmitter, Input, OnDestroy, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order } from '../../orders.service';
import { ChatMessage, MessagesService } from '../messages.service';
import { LiveStatusService } from '../live-status.service';

interface TimelineStep {
  key: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';
  label: string;
  state: 'done' | 'current' | 'future' | 'cancelled';
}

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css'
})
export class OrderDetailComponent implements OnDestroy {
  private readonly _order = signal<Order | null>(null);
  private messagesService = inject(MessagesService);
  private liveStatus = inject(LiveStatusService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly messagesLoading = signal(false);
  private chatJoinedOrderId: string | null = null;
  private chatUnsubscribe: (() => void) | null = null;

  @Input()
  set order(value: Order | null) {
    this._order.set(value ?? null);
    this.handleOrderChange(value ?? null);
  }
  get order(): Order | null {
    return this._order();
  }

  @Output() close = new EventEmitter<void>();

  readonly isOpen = computed(() => this._order() !== null);

  readonly shortId = computed(() => {
    const o = this._order();
    if (!o?.id) return '—';
    return o.id.slice(0, 8).toUpperCase();
  });

  readonly steps = computed<TimelineStep[]>(() => {
    const o = this._order();
    const status = o?.status ?? 'PENDING';
    const order: TimelineStep['key'][] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
    const labels: Record<TimelineStep['key'], string> = {
      PENDING: 'En attente',
      ACCEPTED: 'Acceptée',
      IN_PROGRESS: 'En cours',
      COMPLETED: 'Livrée'
    };

    if (status === 'CANCELLED') {
      return order.map((k) => ({
        key: k,
        label: labels[k],
        state: k === 'PENDING' ? 'cancelled' : 'future'
      }));
    }

    const currentIdx = order.indexOf(status as TimelineStep['key']);
    return order.map((k, i) => {
      let state: TimelineStep['state'] = 'future';
      if (currentIdx === -1) state = 'future';
      else if (i < currentIdx) state = 'done';
      else if (i === currentIdx) state = status === 'COMPLETED' ? 'done' : 'current';
      return { key: k, label: labels[k], state };
    });
  });

  readonly statusBadgeClass = computed(() => {
    const s = this._order()?.status;
    switch (s) {
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'ACCEPTED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'IN_PROGRESS':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'CANCELLED':
        return 'bg-red-500/20 text-red-300 border-red-500/50';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/50';
    }
  });

  onClose(): void {
    this.close.emit();
  }

  fullName(user: any): string {
    if (!user) return '—';
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Anonyme';
  }

  initials(user: any): string {
    if (!user) return '?';
    const f = (user.firstName?.[0] ?? '').toUpperCase();
    const l = (user.lastName?.[0] ?? '').toUpperCase();
    return (f + l) || '?';
  }

  /** Numéro international propre pour tel: et wa.me (retire tout sauf chiffres). */
  telHref(phone?: string | null): string {
    if (!phone) return '#';
    return `tel:${phone}`;
  }

  waHref(phone?: string | null): string {
    if (!phone) return '#';
    const digits = phone.replace(/[^0-9]/g, '');
    return `https://wa.me/${digits}`;
  }

  /** Placeholder pour dates "acceptée / livrée" non exposées par l'API actuelle. */
  acceptedAt(): string | null {
    const o = this._order();
    if (!o) return null;
    // Heuristique : pas encore exposé par l'API, on affiche seulement si status >= ACCEPTED.
    return ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(o.status) ? o.createdAt : null;
  }

  completedAt(): string | null {
    const o = this._order();
    if (!o) return null;
    return o.status === 'COMPLETED' ? o.createdAt : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Chat (lecture seule pour l'admin)
  // ──────────────────────────────────────────────────────────────────────────

  private handleOrderChange(order: Order | null): void {
    this.cleanupChat();
    if (!order) {
      this.messages.set([]);
      return;
    }
    this.loadMessages(order.id);
    this.subscribeLive(order.id);
  }

  private loadMessages(orderId: string): void {
    this.messagesLoading.set(true);
    this.messagesService.list(orderId).subscribe({
      next: (msgs) => {
        this.messages.set(msgs ?? []);
        this.messagesLoading.set(false);
      },
      error: () => {
        this.messages.set([]);
        this.messagesLoading.set(false);
      },
    });
  }

  private subscribeLive(orderId: string): void {
    this.liveStatus.joinOrderChat(orderId);
    this.chatJoinedOrderId = orderId;
    this.chatUnsubscribe = this.liveStatus.onChatMessage(orderId, (msg) => {
      const current = this.messages();
      // Évite les doublons si le message est déjà dans l'historique
      if (current.some((m) => m.id === msg.id)) return;
      this.messages.set([...current, msg as ChatMessage]);
    });
  }

  private cleanupChat(): void {
    if (this.chatUnsubscribe) {
      this.chatUnsubscribe();
      this.chatUnsubscribe = null;
    }
    if (this.chatJoinedOrderId) {
      this.liveStatus.leaveOrderChat(this.chatJoinedOrderId);
      this.chatJoinedOrderId = null;
    }
  }

  ngOnDestroy(): void {
    this.cleanupChat();
  }

  isOwnMessage(msg: ChatMessage): boolean {
    const o = this._order();
    return !!o?.livreur?.id && msg.senderId === o.livreur.id;
  }

  senderInitial(msg: ChatMessage): string {
    return msg.sender?.firstName?.[0]?.toUpperCase() ?? '?';
  }

  senderName(msg: ChatMessage): string {
    if (!msg.sender) return 'Inconnu';
    return `${msg.sender.firstName ?? ''} ${msg.sender.lastName ?? ''}`.trim() || 'Inconnu';
  }
}
