import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Order, OrdersService } from '../orders.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { OrderDetailComponent } from '../shared/order-detail/order-detail.component';
import { LucideAngularModule } from 'lucide-angular';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

type StatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED';

@Component({
  selector: 'app-archives',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EmptyStateComponent,
    OrderDetailComponent,
    LucideAngularModule,
    SkeletonRowComponent
  ],
  templateUrl: './archives.component.html',
  styleUrls: ['./archives.component.css']
})
export class ArchivesComponent implements OnInit, OnDestroy {
  private ordersService = inject(OrdersService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly orders = signal<Order[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);
  readonly selectedOrder = signal<Order | null>(null);

  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('ALL');

  readonly filtered = computed<Order[]>(() => {
    const from = this.fromDate() ? new Date(this.fromDate()) : null;
    const to = this.toDate() ? new Date(this.toDate() + 'T23:59:59.999') : null;
    const status = this.statusFilter();
    return this.orders().filter((o) => {
      if (status !== 'ALL' && o.status !== status) return false;
      const created = o.createdAt ? new Date(o.createdAt) : null;
      if (from && created && created < from) return false;
      if (to && created && created > to) return false;
      return true;
    });
  });

  // Revenu total des courses COMPLETED affichées (les CANCELLED ne contribuent pas).
  readonly totalRevenue = computed<number>(() =>
    this.filtered()
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + (Number(o.priceFcfa) || 0), 0)
  );

  readonly completedCount = computed<number>(() =>
    this.filtered().filter((o) => o.status === 'COMPLETED').length
  );

  readonly cancelledCount = computed<number>(() =>
    this.filtered().filter((o) => o.status === 'CANCELLED').length
  );

  shortId(id: string): string {
    if (!id) return '-';
    return `#${id.slice(0, 8)}`;
  }

  ngOnInit(): void {
    this.pageActions.setPage('Archives', 'Historique des commandes terminées et annulées');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.ordersService.getOrders().subscribe({
      next: (data) => {
        this.orders.set(
          (data ?? []).filter(
            (o) => o.status === 'COMPLETED' || o.status === 'CANCELLED'
          )
        );
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur archives', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  onRowClick(order: Order): void {
    this.selectedOrder.set(order);
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
  }

  onFromChange(value: string): void { this.fromDate.set(value); }
  onToChange(value: string): void { this.toDate.set(value); }
  onStatusChange(value: string): void { this.statusFilter.set(value as StatusFilter); }

  resetFilters(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.statusFilter.set('ALL');
  }

  statusBadge(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'CANCELLED': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  }
}
