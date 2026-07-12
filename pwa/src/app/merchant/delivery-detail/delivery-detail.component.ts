import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { OrderChatComponent } from '../../shared/components/chat/chat.component';
import { OrderMapComponent, MapLatLng } from '../../shared/components/map/map.component';
import { StatusTimelineComponent } from '../../shared/components/status-timeline/status-timeline.component';
import { AvailableDriver, Order, PaymentStatus, isTerminalOrderStatus } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { SocketService } from '../../shared/services/socket.service';
import { orderStatusPillClass, paymentStatusPillClass } from '../../shared/status-colors';
import { paymentLabel, statusLongLabel } from '../../shared/status-utils';
import { DriverPickerComponent } from '../driver-picker/driver-picker.component';
import { MerchantService } from '../merchant.service';

const PAYMENT_OPTIONS: PaymentStatus[] = [
  'UNPAID',
  'PAY_ON_DELIVERY',
  'PAID',
  'RECEIVED_BY_MERCHANT',
  'RECEIVED_BY_LIVREUR',
  'CASH_ON_DELIVERY',
  'REFUNDED',
];

/**
 * Suivi commerçant d'une livraison qu'il a créée : frise de statut, carte +
 * position live du livreur, infos client, changement du statut de paiement,
 * ajustement manuel du prix, réassignation d'un livreur (si PENDING), accès
 * à la conversation partagée (rejoindre/quitter).
 */
@Component({
  selector: 'app-merchant-delivery-detail',
  imports: [FormsModule, StatusTimelineComponent, OrderMapComponent, OrderChatComponent, DriverPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-detail.component.html',
  styleUrl: './delivery-detail.component.css',
})
export class MerchantDeliveryDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private merchantService = inject(MerchantService);
  private socketService = inject(SocketService);
  private destroyRef = inject(DestroyRef);

  readonly orderStatusPillClass = orderStatusPillClass;
  readonly paymentStatusPillClass = paymentStatusPillClass;
  readonly paymentLabel = paymentLabel;
  readonly statusLongLabel = statusLongLabel;
  readonly paymentOptions = PAYMENT_OPTIONS;

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly order = signal<Order | null>(null);
  readonly driverPosition = signal<MapLatLng | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly isTerminal = computed(() => isTerminalOrderStatus(this.order()?.status));
  readonly canAssign = computed(() => this.order()?.status === 'PENDING');

  readonly pickupPoint = computed<MapLatLng | null>(() => {
    const o = this.order();
    return o?.pickupLat != null && o?.pickupLng != null ? { lat: o.pickupLat, lng: o.pickupLng } : null;
  });

  readonly deliveryPoint = computed<MapLatLng | null>(() => {
    const o = this.order();
    return o?.deliveryLat != null && o?.deliveryLng != null
      ? { lat: o.deliveryLat, lng: o.deliveryLng }
      : null;
  });

  // ---- Conversation ----
  readonly showChat = signal(false);
  readonly conversationJoined = signal(false);

  // ---- Paiement ----
  readonly showPaymentPanel = signal(false);
  selectedPaymentStatus: PaymentStatus = 'UNPAID';
  readonly updatingPayment = signal(false);

  // ---- Prix ----
  readonly showPricePanel = signal(false);
  priceValue: number | null = null;
  priceReason = '';
  readonly savingPrice = signal(false);

  // ---- Réassignation ----
  readonly showAssignPanel = signal(false);
  readonly assignDrivers = signal<AvailableDriver[]>([]);
  readonly assignDriversLoading = signal(false);
  readonly selectedAssignDriverId = signal<string | null>(null);
  readonly assigning = signal(false);

  private orderId!: string;
  private socketSub = new Subscription();

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id')!;
    this.load();
    this.wireSocket();

    this.destroyRef.onDestroy(() => this.socketSub.unsubscribe());
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
    this.selectedPaymentStatus = order.paymentStatus;
  }

  private wireSocket(): void {
    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; lat: number; lng: number }>('driver:position')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.driverPosition.set({ lat: evt.lat, lng: evt.lng });
        })
    );

    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; status: string }>('orderStatusUpdated')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.ordersService.patchCachedStatus(this.orderId, evt.status as Order['status']);
          const updated = this.ordersService.findCached(this.orderId);
          if (updated) this.applyOrder(updated);
        })
    );

    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; paymentStatus: string }>('orderPaymentUpdated')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.ordersService.patchCachedPayment(this.orderId, evt.paymentStatus as Order['paymentStatus']);
          const updated = this.ordersService.findCached(this.orderId);
          if (updated) this.applyOrder(updated);
        })
    );

    // Resynchronisation HTTP après coupure/reconnexion socket.
    this.socketSub.add(this.socketService.connected$.subscribe(() => this.load()));
  }

  backToDeliveries(): void {
    this.router.navigate(['/merchant/deliveries']);
  }

  // ---- Conversation ----
  toggleChat(): void {
    if (!this.showChat()) {
      this.showChat.set(true);
      if (!this.conversationJoined()) {
        this.merchantService.joinConversation(this.orderId).subscribe({
          next: () => this.conversationJoined.set(true),
          error: () => {
            /* le chat reste accessible même si l'auto-join échoue */
          },
        });
      }
    } else {
      this.showChat.set(false);
    }
  }

  leaveConversation(): void {
    this.merchantService.leaveConversation(this.orderId).subscribe({
      next: () => {
        this.conversationJoined.set(false);
        this.showChat.set(false);
      },
      error: () => {
        this.actionError.set('Impossible de quitter la conversation.');
      },
    });
  }

  // ---- Paiement ----
  togglePaymentPanel(): void {
    this.showPaymentPanel.update((v) => !v);
    const o = this.order();
    if (o) this.selectedPaymentStatus = o.paymentStatus;
  }

  markReceivedByMerchant(): void {
    this.applyPaymentStatus('RECEIVED_BY_MERCHANT');
  }

  applyPaymentStatus(status: PaymentStatus = this.selectedPaymentStatus): void {
    if (this.updatingPayment()) return;
    this.updatingPayment.set(true);
    this.actionError.set(null);
    this.ordersService.updatePaymentStatus(this.orderId, status).subscribe({
      next: (order) => {
        this.updatingPayment.set(false);
        this.showPaymentPanel.set(false);
        this.applyOrder(order);
      },
      error: (err: HttpErrorResponse) => {
        this.updatingPayment.set(false);
        this.actionError.set(this.extractMessage(err));
      },
    });
  }

  // ---- Prix ----
  togglePricePanel(): void {
    this.showPricePanel.update((v) => !v);
    if (this.showPricePanel()) {
      this.priceValue = this.order()?.priceFcfa ?? this.order()?.estimatedPrice ?? null;
      this.priceReason = '';
    }
  }

  savePrice(): void {
    if (this.savingPrice() || this.priceValue == null || this.priceValue < 0) return;
    this.savingPrice.set(true);
    this.actionError.set(null);
    this.ordersService.updatePrice(this.orderId, this.priceValue, this.priceReason.trim() || undefined).subscribe({
      next: (order) => {
        this.savingPrice.set(false);
        this.showPricePanel.set(false);
        this.applyOrder(order);
      },
      error: (err: HttpErrorResponse) => {
        this.savingPrice.set(false);
        this.actionError.set(this.extractMessage(err));
      },
    });
  }

  // ---- Réassignation ----
  toggleAssignPanel(): void {
    this.showAssignPanel.update((v) => !v);
    if (this.showAssignPanel() && this.assignDrivers().length === 0) {
      this.loadAssignDrivers();
    }
  }

  private loadAssignDrivers(): void {
    const o = this.order();
    this.assignDriversLoading.set(true);
    this.ordersService.findAvailableDrivers(o?.pickupLat ?? undefined, o?.pickupLng ?? undefined).subscribe({
      next: (drivers) => {
        this.assignDriversLoading.set(false);
        this.assignDrivers.set(drivers);
      },
      error: () => this.assignDriversLoading.set(false),
    });
  }

  selectAssignDriver(driverId: string | null): void {
    this.selectedAssignDriverId.set(driverId);
  }

  confirmAssign(): void {
    const driverId = this.selectedAssignDriverId();
    if (!driverId || this.assigning()) return;
    this.assigning.set(true);
    this.actionError.set(null);
    this.ordersService.assign(this.orderId, driverId).subscribe({
      next: (order) => {
        this.assigning.set(false);
        this.showAssignPanel.set(false);
        this.applyOrder(order);
      },
      error: (err: HttpErrorResponse) => {
        this.assigning.set(false);
        this.actionError.set(this.extractMessage(err));
      },
    });
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    return 'Une erreur est survenue. Réessayez.';
  }
}
