import { Component, EventEmitter, Input, OnDestroy, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AvailableDriver, Order, OrdersService, PaymentStatus } from '../../orders.service';
import { ChatMessage, MessagesService } from '../messages.service';
import { LiveStatusService } from '../live-status.service';
import { orderStatusLabel, orderStatusPillClass } from '../status-colors';

interface TimelineStep {
  key: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';
  label: string;
  state: 'done' | 'current' | 'future' | 'cancelled';
}

/// Les 5 valeurs possibles pour le <select> de statut de paiement, avec
/// libellé FR (contrat backend déjà déployé, cf. PATCH /orders/:id/payment-status).
const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'UNPAID', label: 'Non payé' },
  { value: 'PAY_ON_DELIVERY', label: 'À la livraison' },
  { value: 'PAID', label: 'Payé' },
  { value: 'RECEIVED_BY_MERCHANT', label: 'Reçu (commerçant)' },
  { value: 'RECEIVED_BY_LIVREUR', label: 'Reçu (livreur)' },
  { value: 'CASH_ON_DELIVERY', label: 'Espèces à la livraison' },
  { value: 'REFUNDED', label: 'Remboursé' },
];

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css'
})
export class OrderDetailComponent implements OnDestroy {
  private readonly _order = signal<Order | null>(null);
  private messagesService = inject(MessagesService);
  private liveStatus = inject(LiveStatusService);
  private ordersService = inject(OrdersService);

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
  /// Émis quand une commande a été modifiée localement (paiement ou
  /// réassignation), pour que le parent (ex: liste des archives) mette à
  /// jour sa ligne sans devoir tout recharger.
  @Output() orderUpdated = new EventEmitter<Order>();

  readonly isOpen = computed(() => this._order() !== null);

  // ──────────────────────────────────────────────────────────────────────────
  // Statut de paiement — édition
  // ──────────────────────────────────────────────────────────────────────────
  readonly paymentOptions = PAYMENT_STATUS_OPTIONS;
  readonly paymentSaving = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly paymentSuccess = signal(false);

  updatePaymentStatus(value: string): void {
    const o = this._order();
    if (!o) return;
    const paymentStatus = value as PaymentStatus;
    if (paymentStatus === o.paymentStatus) return;

    this.paymentSaving.set(true);
    this.paymentError.set(null);
    this.paymentSuccess.set(false);

    this.ordersService.updatePaymentStatus(o.id, paymentStatus).subscribe({
      next: (updated) => {
        const merged: Order = { ...o, ...updated, paymentStatus: updated?.paymentStatus ?? paymentStatus };
        this._order.set(merged);
        this.paymentSaving.set(false);
        this.paymentSuccess.set(true);
        this.orderUpdated.emit(merged);
        setTimeout(() => this.paymentSuccess.set(false), 2000);
      },
      error: (err) => {
        console.error('Erreur mise à jour statut paiement', err);
        this.paymentSaving.set(false);
        this.paymentError.set(
          err?.error?.message || 'Impossible de mettre à jour le statut de paiement.'
        );
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Réassignation manuelle du livreur
  // ──────────────────────────────────────────────────────────────────────────
  readonly canAssign = computed(() => this._order()?.status === 'PENDING');
  readonly assignPanelOpen = signal(false);
  readonly driversLoading = signal(false);
  readonly driversError = signal<string | null>(null);
  readonly availableDrivers = signal<AvailableDriver[]>([]);
  readonly assigningDriverId = signal<string | null>(null);
  readonly assignError = signal<string | null>(null);

  openAssignPanel(): void {
    this.assignPanelOpen.set(true);
    this.driversError.set(null);
    this.assignError.set(null);
    this.loadAvailableDrivers();
  }

  closeAssignPanel(): void {
    this.assignPanelOpen.set(false);
  }

  private loadAvailableDrivers(): void {
    this.driversLoading.set(true);
    this.driversError.set(null);
    this.ordersService.getAvailableDrivers().subscribe({
      next: (drivers) => {
        this.availableDrivers.set(drivers ?? []);
        this.driversLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement livreurs disponibles', err);
        this.driversError.set('Impossible de charger les livreurs disponibles.');
        this.driversLoading.set(false);
      }
    });
  }

  chooseDriver(driver: AvailableDriver): void {
    const o = this._order();
    if (!o) return;
    this.assigningDriverId.set(driver.id);
    this.assignError.set(null);

    this.ordersService.assignDriver(o.id, driver.id).subscribe({
      next: (updated) => {
        const merged: Order = { ...o, ...updated };
        this._order.set(merged);
        this.assigningDriverId.set(null);
        this.assignPanelOpen.set(false);
        this.orderUpdated.emit(merged);
      },
      error: (err) => {
        console.error('Erreur réassignation livreur', err);
        this.assigningDriverId.set(null);
        this.assignError.set(
          err?.error?.message ||
          "Cette course n'est plus assignable (déjà acceptée ou annulée)."
        );
      }
    });
  }

  driverFullName(d: AvailableDriver): string {
    return `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Livreur';
  }

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

    // FAILED est terminal au même titre que CANCELLED.
    if (status === 'CANCELLED' || status === 'FAILED') {
      return order.map((k) => ({
        key: k,
        label: labels[k],
        state: k === 'PENDING' ? 'cancelled' : 'future'
      }));
    }

    // Les statuts fins du suivi livreur se rattachent à l'étape qui les
    // englobe. Sans ce mapping, `indexOf` renvoyait -1 et TOUTES les étapes
    // s'affichaient en « future » : une course NEAR_CLIENT (livreur quasiment
    // arrivé) apparaissait comme n'ayant jamais démarré.
    const STEP_BY_STATUS: Record<string, TimelineStep['key']> = {
      EN_ROUTE_PICKUP: 'ACCEPTED',
      AT_PICKUP: 'ACCEPTED',
      NEAR_CLIENT: 'IN_PROGRESS'
    };
    const effectiveStatus = STEP_BY_STATUS[status] ?? status;

    const currentIdx = order.indexOf(effectiveStatus as TimelineStep['key']);
    return order.map((k, i) => {
      let state: TimelineStep['state'] = 'future';
      if (currentIdx === -1) state = 'future';
      else if (i < currentIdx) state = 'done';
      else if (i === currentIdx) state = status === 'COMPLETED' ? 'done' : 'current';
      return { key: k, label: labels[k], state };
    });
  });

  /// Classe de badge unifiée (« Direction A ») — voir shared/status-colors.ts
  /// pour le mapping statut → couleur, partagé avec la sémantique mobile.
  readonly statusBadgeClass = computed(() => {
    return orderStatusPillClass(this._order()?.status);
  });

  /** Libellé FR — le statut brut du backend ne doit pas atteindre l'écran. */
  statusLabel(status: string | undefined | null): string {
    return orderStatusLabel(status);
  }

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
