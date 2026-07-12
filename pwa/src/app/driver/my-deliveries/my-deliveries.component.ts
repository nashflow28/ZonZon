import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Order } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { orderStatusPillClass, paymentStatusPillClass } from '../../shared/status-colors';
import { paymentLabel, statusLabel } from '../../shared/status-utils';

/** Liste des courses du livreur — actives / terminées, cf. GET /orders/mine. */
@Component({
  selector: 'app-driver-my-deliveries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-deliveries.component.html',
  styleUrl: './my-deliveries.component.css',
})
export class DriverMyDeliveriesComponent implements OnInit {
  private ordersService = inject(OrdersService);
  private router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly active = this.ordersService.activeOrders;
  readonly past = this.ordersService.pastOrders;

  readonly totalEarnings = computed(() =>
    this.past()
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + (o.priceFcfa ?? 0), 0)
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
        this.errorMessage.set('Impossible de charger vos courses.');
      },
    });
  }

  open(order: Order): void {
    this.router.navigate(['/driver/my-deliveries', order.id]);
  }
}
