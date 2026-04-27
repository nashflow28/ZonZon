import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OrdersService, Order } from '../orders.service';
import { LucideAngularModule } from 'lucide-angular';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { OrderDetailComponent } from '../shared/order-detail/order-detail.component';
import { TimeAgoPipe } from '../shared/time-ago.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    SkeletonRowComponent,
    EmptyStateComponent,
    OrderDetailComponent,
    TimeAgoPipe
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly allOrders = signal<Order[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly selectedOrder = signal<Order | null>(null);

  /** Courses "live" : ni terminées, ni annulées. */
  readonly orders = computed<Order[]>(() =>
    this.allOrders().filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
  );

  /** Courses terminées aujourd'hui. */
  readonly completedToday = computed<Order[]>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.allOrders().filter(
      (o) => o.status === 'COMPLETED' && o.createdAt && new Date(o.createdAt) >= start
    );
  });

  /** Revenu du jour. */
  readonly revenueToday = computed<number>(() =>
    this.completedToday().reduce((sum, o) => sum + (o.priceFcfa || 0), 0)
  );

  /** Livreurs distincts en course. */
  readonly activeDrivers = computed<number>(() => {
    const ids = new Set<string>();
    for (const o of this.orders()) {
      if (o.livreur?.id) ids.add(o.livreur.id);
    }
    return ids.size;
  });

  /** Compteur animé pour la carte "courses en cours". */
  readonly liveCountAnimated = signal<number>(0);

  private ordersService = inject(OrdersService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  ngOnInit(): void {
    this.pageActions.setPage('Tableau de bord', 'Supervisez vos livraisons en temps réel');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetchOrders());
    this.fetchOrders();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  fetchOrders(): void {
    this.isLoading.set(true);
    this.ordersService.getOrders().subscribe({
      next: (data) => {
        this.allOrders.set(data ?? []);
        // Met à jour le sous-titre dynamique (courses actives • livreurs en ligne).
        this.pageActions.setPage(
          'Tableau de bord',
          `${this.orders().length} course${this.orders().length > 1 ? 's' : ''} actives • ${this.activeDrivers()} livreur${this.activeDrivers() > 1 ? 's' : ''} en ligne`
        );
        this.isLoading.set(false);
        this.animateLiveCount();
      },
      error: (err) => {
        console.error('Erreur API', err);
        this.isLoading.set(false);
      }
    });
  }

  private animateLiveCount(): void {
    const target = this.orders().length;
    if (target === 0) {
      this.liveCountAnimated.set(0);
      return;
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.liveCountAnimated.set(target);
      return;
    }
    const duration = 700;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.liveCountAnimated.set(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  getStatusColor(status: string): string {
    switch (status) {
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
  }

  isPulsing(status: string): boolean {
    return status === 'PENDING' || status === 'IN_PROGRESS';
  }

  openOrder(order: Order): void {
    this.selectedOrder.set(order);
  }

  closeOrder(): void {
    this.selectedOrder.set(null);
  }

  initials(user: any): string {
    if (!user) return '?';
    const f = (user.firstName?.[0] ?? '').toUpperCase();
    const l = (user.lastName?.[0] ?? '').toUpperCase();
    return f + l || '?';
  }
}
