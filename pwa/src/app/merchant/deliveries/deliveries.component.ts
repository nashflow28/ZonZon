import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Order } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { orderStatusPillClass, paymentStatusPillClass } from '../../shared/status-colors';
import { paymentLabel, statusLabel } from '../../shared/status-utils';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Livraisons créées par le commerçant (`GET /orders/mine`, cas COMMERCANT) —
 * stats agrégées (jour/terminées/montant) calculées côté client depuis la
 * liste, puis actives/passées avec pills statut+paiement.
 */
@Component({
  selector: 'app-merchant-deliveries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deliveries.component.html',
  styleUrl: './deliveries.component.css',
})
export class MerchantDeliveriesComponent implements OnInit {
  private ordersService = inject(OrdersService);
  private router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly orders = this.ordersService.orders;
  readonly active = this.ordersService.activeOrders;
  readonly past = this.ordersService.pastOrders;

  readonly todayCount = computed(() => this.orders().filter((o) => isToday(o.createdAt)).length);
  readonly completedCount = computed(
    () => this.orders().filter((o) => o.status === 'COMPLETED').length
  );
  readonly totalAmount = computed(() =>
    this.orders()
      .filter((o) => o.status !== 'CANCELLED' && o.status !== 'FAILED')
      .reduce((sum, o) => sum + (o.priceFcfa ?? o.estimatedPrice ?? 0), 0)
  );

  readonly orderStatusPillClass = orderStatusPillClass;
  readonly paymentStatusPillClass = paymentStatusPillClass;
  readonly statusLabel = statusLabel;
  readonly paymentLabel = paymentLabel;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.ordersService.refresh().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger vos livraisons.');
      },
    });
  }

  open(order: Order): void {
    this.router.navigate(['/merchant/deliveries', order.id]);
  }

  goToCreate(): void {
    this.router.navigate(['/merchant/create']);
  }
}
