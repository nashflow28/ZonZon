import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Order, OrdersService, PagedOrders } from '../orders.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { OrderDetailComponent } from '../shared/order-detail/order-detail.component';
import { LucideAngularModule } from 'lucide-angular';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

type StatusFilter =
  | 'ALL'
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

const PAGE_LIMIT = 20;

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

  // Pagination — page courante (1-indexée), total renvoyé par le backend, etc.
  readonly page = signal<number>(1);
  readonly total = signal<number>(0);
  readonly hasMore = signal<boolean>(false);
  readonly limit = PAGE_LIMIT;

  readonly totalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.total() / this.limit))
  );

  // Revenu total des courses COMPLETED présentes sur la page courante.
  readonly totalRevenue = computed<number>(() =>
    this.orders()
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + (Number(o.priceFcfa) || 0), 0)
  );

  readonly completedCount = computed<number>(() =>
    this.orders().filter((o) => o.status === 'COMPLETED').length
  );

  readonly cancelledCount = computed<number>(() =>
    this.orders().filter((o) => o.status === 'CANCELLED').length
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
    this.ordersService
      .getOrdersPaged({
        page: this.page(),
        limit: this.limit,
        status: this.statusFilter() !== 'ALL' ? this.statusFilter() : undefined,
        from: this.fromDate() || undefined,
        to: this.toDate() || undefined,
      })
      .subscribe({
        next: (res: PagedOrders) => {
          this.orders.set(res.items ?? []);
          this.total.set(res.total ?? 0);
          this.hasMore.set(res.hasMore ?? false);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur archives', err);
          this.errored.set(true);
          this.isLoading.set(false);
        }
      });
  }

  /// Recharge depuis la page 1 lorsqu'un filtre change.
  private reloadFromFirstPage(): void {
    this.page.set(1);
    this.fetch();
  }

  onRowClick(order: Order): void {
    this.selectedOrder.set(order);
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
  }

  onFromChange(value: string): void {
    this.fromDate.set(value);
    this.reloadFromFirstPage();
  }
  onToChange(value: string): void {
    this.toDate.set(value);
    this.reloadFromFirstPage();
  }
  onStatusChange(value: string): void {
    this.statusFilter.set(value as StatusFilter);
    this.reloadFromFirstPage();
  }

  resetFilters(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.statusFilter.set('ALL');
    this.reloadFromFirstPage();
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.fetch();
  }

  nextPage(): void {
    if (!this.hasMore() && this.page() >= this.totalPages()) return;
    this.page.update((p) => p + 1);
    this.fetch();
  }

  canPrev = computed<boolean>(() => this.page() > 1);
  canNext = computed<boolean>(() => this.hasMore() || this.page() < this.totalPages());

  statusBadge(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'CANCELLED': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'PENDING': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'ACCEPTED': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'IN_PROGRESS': return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  }
}
