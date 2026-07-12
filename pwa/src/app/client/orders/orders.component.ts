import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { orderStatusPillClass, paymentStatusPillClass } from '../../shared/status-colors';
import { statusLabel, paymentLabel } from '../../shared/status-utils';
import { Order } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';

/** Liste des commandes client — actives / passées, cf. GET /orders/mine. */
@Component({
  selector: 'app-client-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class ClientOrdersComponent implements OnInit {
  private ordersService = inject(OrdersService);
  private router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly active = this.ordersService.activeOrders;
  readonly past = this.ordersService.pastOrders;

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
        this.errorMessage.set('Impossible de charger vos commandes.');
      },
    });
  }

  open(order: Order): void {
    this.router.navigate(['/client/orders', order.id]);
  }
}
