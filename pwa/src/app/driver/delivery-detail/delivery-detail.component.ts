import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { OrderChatComponent } from '../../shared/components/chat/chat.component';
import { OrderMapComponent, MapLatLng } from '../../shared/components/map/map.component';
import { StatusTimelineComponent } from '../../shared/components/status-timeline/status-timeline.component';
import { Order, OrderStatus, isTerminalOrderStatus } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { SocketService } from '../../shared/services/socket.service';
import { orderStatusPillClass, paymentStatusPillClass } from '../../shared/status-colors';
import { paymentLabel, statusLongLabel } from '../../shared/status-utils';

interface NextAction {
  status: OrderStatus;
  label: string;
}

/** Étape suivante proposée au livreur selon le statut courant. */
const NEXT_ACTIONS: Partial<Record<OrderStatus, NextAction>> = {
  ACCEPTED: { status: 'EN_ROUTE_PICKUP', label: 'En route vers le retrait' },
  EN_ROUTE_PICKUP: { status: 'AT_PICKUP', label: 'Arrivé au retrait' },
  AT_PICKUP: { status: 'IN_PROGRESS', label: 'Colis récupéré — démarrer' },
  IN_PROGRESS: { status: 'NEAR_CLIENT', label: 'Proche du client' },
  NEAR_CLIENT: { status: 'COMPLETED', label: 'Livré' },
};

/**
 * Écran de conduite d'une course livreur : frise de statut, carte (retrait /
 * livraison / position GPS courante), boutons d'avancement du statut,
 * signalement d'échec, annulation, chat. Émet la position GPS
 * (`driver:location`) UNIQUEMENT tant que la course est active.
 */
@Component({
  selector: 'app-driver-delivery-detail',
  imports: [FormsModule, StatusTimelineComponent, OrderMapComponent, OrderChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-detail.component.html',
  styleUrl: './delivery-detail.component.css',
})
export class DriverDeliveryDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private socketService = inject(SocketService);
  private destroyRef = inject(DestroyRef);

  readonly orderStatusPillClass = orderStatusPillClass;
  readonly paymentStatusPillClass = paymentStatusPillClass;
  readonly paymentLabel = paymentLabel;
  readonly statusLongLabel = statusLongLabel;

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly order = signal<Order | null>(null);
  readonly myPosition = signal<MapLatLng | null>(null);
  readonly geoError = signal<string | null>(null);

  readonly showChat = signal(false);
  readonly advancing = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly showFailPanel = signal(false);
  readonly failReason = signal('');
  readonly failing = signal(false);

  readonly showCancelPanel = signal(false);
  readonly cancelReason = signal('');
  readonly cancelling = signal(false);

  readonly nextAction = computed<NextAction | null>(() => {
    const status = this.order()?.status;
    return status ? (NEXT_ACTIONS[status] ?? null) : null;
  });

  readonly isTerminal = computed(() => isTerminalOrderStatus(this.order()?.status));

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

  private orderId!: string;
  private socketSub = new Subscription();
  private watchId: number | null = null;

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id')!;
    this.load();
    this.wireSocket();

    this.destroyRef.onDestroy(() => {
      this.socketSub.unsubscribe();
      this.stopWatchingPosition();
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
    const wasActive = this.watchId !== null;
    this.order.set(order);
    const active = !isTerminalOrderStatus(order.status);
    if (active && !wasActive) {
      this.startWatchingPosition();
    } else if (!active && wasActive) {
      this.stopWatchingPosition();
    }
  }

  private wireSocket(): void {
    this.socketSub.add(
      this.socketService
        .on$<{ orderId: string; status: string }>('orderStatusUpdated')
        .subscribe((evt) => {
          if (evt.orderId !== this.orderId) return;
          this.ordersService.patchCachedStatus(this.orderId, evt.status as OrderStatus);
          const updated = this.ordersService.findCached(this.orderId);
          if (updated) this.applyOrder(updated);
        })
    );

    // Resynchronisation HTTP après coupure/reconnexion socket.
    this.socketSub.add(this.socketService.connected$.subscribe(() => this.load()));
  }

  private startWatchingPosition(): void {
    if (this.watchId !== null || !('geolocation' in navigator)) return;
    this.geoError.set(null);
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.geoError.set(null);
        this.myPosition.set(point);
        this.socketService.emit('driver:location', point);
      },
      () => {
        this.geoError.set(
          'Position GPS indisponible. Autorisez la géolocalisation pour partager votre position.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  private stopWatchingPosition(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  toggleChat(): void {
    this.showChat.update((v) => !v);
  }

  advance(): void {
    const action = this.nextAction();
    if (!action || this.advancing()) return;
    this.advancing.set(true);
    this.actionError.set(null);
    this.ordersService.updateStatus(this.orderId, action.status).subscribe({
      next: (order) => {
        this.advancing.set(false);
        this.applyOrder(order);
      },
      error: (err: HttpErrorResponse) => {
        this.advancing.set(false);
        this.actionError.set(this.extractMessage(err));
      },
    });
  }

  openFailPanel(): void {
    this.showFailPanel.set(true);
  }

  closeFailPanel(): void {
    this.showFailPanel.set(false);
    this.failReason.set('');
  }

  confirmFail(): void {
    if (this.failing()) return;
    this.failing.set(true);
    this.actionError.set(null);
    this.ordersService.updateStatus(this.orderId, 'FAILED', this.failReason().trim() || undefined).subscribe({
      next: (order) => {
        this.failing.set(false);
        this.showFailPanel.set(false);
        this.applyOrder(order);
      },
      error: (err: HttpErrorResponse) => {
        this.failing.set(false);
        this.actionError.set(this.extractMessage(err));
      },
    });
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

  backToDeliveries(): void {
    this.router.navigate(['/driver/my-deliveries']);
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    return 'Une erreur est survenue. Réessayez.';
  }
}
