import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { OrderChatComponent } from '../../shared/components/chat/chat.component';
import { OrderMapComponent, MapLatLng } from '../../shared/components/map/map.component';
import { StatusTimelineComponent } from '../../shared/components/status-timeline/status-timeline.component';
import {
  EtaResult,
  Order,
  PriceProposal,
  isTerminalOrderStatus,
} from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { SignalementsService } from '../../shared/services/signalements.service';
import { SocketService } from '../../shared/services/socket.service';
import { orderStatusPillClass, paymentStatusPillClass } from '../../shared/status-colors';
import { paymentLabel, statusLongLabel } from '../../shared/status-utils';

const ETA_POLL_MS = 20000;

/**
 * Suivi d'une course client : frise de statut, carte + position live du
 * livreur, ETA, badge paiement, chat, annulation, signalement et notation
 * post-livraison.
 */
@Component({
  selector: 'app-client-order-tracking',
  imports: [FormsModule, StatusTimelineComponent, OrderMapComponent, OrderChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-tracking.component.html',
  styleUrl: './order-tracking.component.css',
})
export class ClientOrderTrackingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private socketService = inject(SocketService);
  private signalementsService = inject(SignalementsService);
  private destroyRef = inject(DestroyRef);

  readonly orderStatusPillClass = orderStatusPillClass;
  readonly paymentStatusPillClass = paymentStatusPillClass;
  readonly paymentLabel = paymentLabel;
  readonly statusLongLabel = statusLongLabel;

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly order = signal<Order | null>(null);
  readonly driverPosition = signal<MapLatLng | null>(null);
  readonly eta = signal<EtaResult | null>(null);
  readonly priceProposal = signal<PriceProposal | null>(null);
  readonly respondingToPrice = signal(false);

  readonly showChat = signal(false);
  readonly showCancelPanel = signal(false);
  readonly cancelReason = signal('');
  readonly cancelling = signal(false);

  readonly showReportPanel = signal(false);
  readonly reportReason = signal('');
  readonly reporting = signal(false);
  readonly reportSent = signal(false);

  readonly showRating = signal(false);
  readonly ratingScore = signal(0);
  readonly ratingSubmitting = signal(false);
  readonly ratingSubmitted = signal(false);

  readonly actionError = signal<string | null>(null);

  readonly canCancel = computed(() => {
    const o = this.order();
    return !!o && (o.status === 'PENDING' || o.status === 'ACCEPTED');
  });

  readonly pickupPoint = computed<MapLatLng | null>(() => {
    const o = this.order();
    return o?.pickupLat != null && o?.pickupLng != null
      ? { lat: o.pickupLat, lng: o.pickupLng }
      : null;
  });

  readonly deliveryPoint = computed<MapLatLng | null>(() => {
    const o = this.order();
    return o?.deliveryLat != null && o?.deliveryLng != null
      ? { lat: o.deliveryLat, lng: o.deliveryLng }
      : null;
  });

  private orderId!: string;
  private etaTimer?: Subscription;
  private socketSub = new Subscription();

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id')!;
    this.load();
    this.wireSocket();

    this.destroyRef.onDestroy(() => {
      this.etaTimer?.unsubscribe();
      this.socketSub.unsubscribe();
    });
  }

  private load(): void {
    this.loading.set(true);
    const cached = this.ordersService.findCached(this.orderId);
    if (cached) {
      this.applyOrder(cached);
      this.loading.set(false);
    }
    this.ordersService.refresh().subscribe({
      next: () => {
        const found = this.ordersService.findCached(this.orderId);
        if (found) {
          this.applyOrder(found);
          this.loading.set(false);
        } else {
          this.loading.set(false);
          this.notFound.set(true);
        }
      },
      error: () => {
        this.loading.set(false);
        if (!cached) this.notFound.set(true);
      },
    });
  }

  private applyOrder(order: Order): void {
    this.order.set(order);
    if (order.status === 'PENDING') this.loadPriceProposal();
    else this.priceProposal.set(null);
    if (order.status === 'COMPLETED' && !this.ratingSubmitted()) {
      this.showRating.set(true);
    }
    this.refreshEtaIfRelevant();
  }

  private wireSocket(): void {
    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; lat: number; lng: number }>('driver:position')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.driverPosition.set({ lat: evt.lat, lng: evt.lng });
        }),
    );

    this.socketSub.add(
      this.socketService
        .on$<PriceProposal & { orderId: string }>('orderPriceProposed')
        .subscribe((proposal) => {
          if (proposal.orderId === this.orderId) this.priceProposal.set(proposal);
        }),
    );

    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; status: string }>('orderStatusUpdated')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.ordersService.patchCachedStatus(this.orderId, evt.status as Order['status']);
          const updated = this.ordersService.findCached(this.orderId);
          if (updated) this.applyOrder(updated);
        }),
    );

    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; paymentStatus: string }>('orderPaymentUpdated')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.ordersService.patchCachedPayment(
            this.orderId,
            evt.paymentStatus as Order['paymentStatus'],
          );
          const updated = this.ordersService.findCached(this.orderId);
          if (updated) this.order.set(updated);
        }),
    );

    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; livreurId: string }>('orderAccepted')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.load();
        }),
    );

    // Resynchronisation HTTP après coupure/reconnexion socket.
    this.socketSub.add(
      this.socketService.connected$.subscribe(() => {
        this.load();
        this.loadPriceProposal();
      }),
    );
  }

  private loadPriceProposal(): void {
    if (this.order()?.status !== 'PENDING') return;
    this.ordersService.pendingPriceProposal(this.orderId).subscribe({
      next: (proposal) => this.priceProposal.set(proposal),
      error: () => this.priceProposal.set(null),
    });
  }

  respondToPriceProposal(accept: boolean): void {
    const proposal = this.priceProposal();
    if (!proposal || this.respondingToPrice()) return;
    this.respondingToPrice.set(true);
    this.actionError.set(null);
    this.ordersService.respondToPriceProposal(this.orderId, proposal.id, accept).subscribe({
      next: (result) => {
        this.respondingToPrice.set(false);
        this.priceProposal.set(null);
        this.applyOrder(result.order);
      },
      error: (err: HttpErrorResponse) => {
        this.respondingToPrice.set(false);
        this.actionError.set(this.extractMessage(err));
        this.loadPriceProposal();
      },
    });
  }

  private refreshEtaIfRelevant(): void {
    this.etaTimer?.unsubscribe();
    const status = this.order()?.status;
    if (!status || isTerminalOrderStatus(status) || status === 'PENDING') {
      this.eta.set(null);
      return;
    }
    this.fetchEta();
    this.etaTimer = interval(ETA_POLL_MS).subscribe(() => this.fetchEta());
  }

  private fetchEta(): void {
    this.ordersService.eta(this.orderId).subscribe({
      next: (res) => {
        this.eta.set(res);
        if (res.driverLat != null && res.driverLng != null) {
          this.driverPosition.set({ lat: res.driverLat, lng: res.driverLng });
        }
      },
      error: () => {
        /* silencieux : l'ETA est un bonus, pas bloquant */
      },
    });
  }

  toggleChat(): void {
    this.showChat.update((v) => !v);
  }

  openCancelPanel(): void {
    this.showCancelPanel.set(true);
  }

  closeCancelPanel(): void {
    this.showCancelPanel.set(false);
    this.cancelReason.set('');
  }

  confirmCancel(): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    this.actionError.set(null);
    this.ordersService
      .updateStatus(this.orderId, 'CANCELLED', this.cancelReason().trim() || undefined)
      .subscribe({
        next: (order) => {
          this.cancelling.set(false);
          this.showCancelPanel.set(false);
          this.applyOrder(order);
        },
        error: (err: HttpErrorResponse) => {
          this.cancelling.set(false);
          this.actionError.set(this.extractMessage(err));
        },
      });
  }

  openReportPanel(): void {
    this.showReportPanel.set(true);
  }

  closeReportPanel(): void {
    this.showReportPanel.set(false);
    this.reportReason.set('');
  }

  submitReport(): void {
    const reason = this.reportReason().trim();
    if (reason.length < 3 || this.reporting()) return;
    this.reporting.set(true);
    this.actionError.set(null);
    this.signalementsService
      .create({ targetType: 'DELIVERY', targetId: this.orderId, reason })
      .subscribe({
        next: () => {
          this.reporting.set(false);
          this.showReportPanel.set(false);
          this.reportSent.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.reporting.set(false);
          this.actionError.set(this.extractMessage(err));
        },
      });
  }

  setRatingScore(score: number): void {
    this.ratingScore.set(score);
  }

  submitRating(): void {
    if (this.ratingScore() === 0 || this.ratingSubmitting()) return;
    this.ratingSubmitting.set(true);
    this.ordersService.submitRating(this.orderId, { score: this.ratingScore() }).subscribe({
      next: () => {
        this.ratingSubmitting.set(false);
        this.ratingSubmitted.set(true);
        this.showRating.set(false);
      },
      error: () => {
        this.ratingSubmitting.set(false);
      },
    });
  }

  dismissRating(): void {
    this.showRating.set(false);
  }

  backToOrders(): void {
    this.router.navigate(['/client/orders']);
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    return 'Une erreur est survenue. Réessayez.';
  }
}
