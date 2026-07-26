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
import { orderStatusPillClass, paymentStatusPillClass } from '../shared/status-colors';

/** Les 9 statuts du backend + « ALL ». Le backend les accepte tous en filtre. */
type StatusFilter =
  | 'ALL'
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE_PICKUP'
  | 'AT_PICKUP'
  | 'IN_PROGRESS'
  | 'NEAR_CLIENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

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

  /// Appelé quand le panneau de détail modifie une commande (paiement ou
  /// réassignation livreur) : on met à jour la ligne correspondante dans la
  /// liste locale sans recharger toute la page.
  onOrderUpdated(updated: Order): void {
    this.orders.set(
      this.orders().map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
    );
    this.selectedOrder.set(updated);
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

  /// Classe de badge unifiée (« Direction A ») — voir shared/status-colors.ts
  /// pour le mapping statut → couleur, partagé avec la sémantique mobile.
  statusBadge(status: string): string {
    return orderStatusPillClass(status);
  }

  /// Libellé FR pour les statuts de commande, y compris les 4 nouveaux
  /// statuts intermédiaires introduits côté backend (suivi temps réel du livreur).
  statusLabel(status: string): string {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'ACCEPTED': return 'Acceptée';
      case 'IN_PROGRESS': return 'En cours';
      case 'COMPLETED': return 'Terminée';
      case 'CANCELLED': return 'Annulée';
      case 'EN_ROUTE_PICKUP': return 'En route (retrait)';
      case 'AT_PICKUP': return 'Au point de retrait';
      case 'NEAR_CLIENT': return 'Proche du client';
      case 'FAILED': return 'Échec';
      default: return status;
    }
  }

  /// Classe de badge unifiée (« Direction A ») pour le statut de paiement.
  paymentBadge(paymentStatus: string | undefined): string {
    return paymentStatusPillClass(paymentStatus);
  }

  /// Libellé FR du statut de paiement.
  paymentLabel(paymentStatus: string | undefined): string {
    switch (paymentStatus) {
      case 'UNPAID': return 'Non payé';
      case 'PAID': return 'Payé';
      case 'PAY_ON_DELIVERY': return 'À la livraison';
      case 'RECEIVED_BY_MERCHANT': return 'Reçu (commerçant)';
      case 'RECEIVED_BY_LIVREUR': return 'Reçu (livreur)';
      case 'CASH_ON_DELIVERY': return 'Espèces à la livraison';
      case 'REFUNDED': return 'Remboursé';
      default: return '—';
    }
  }
}
