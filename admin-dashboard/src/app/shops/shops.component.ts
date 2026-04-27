import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { Shop, ShopsService, ShopStatus } from './shops.service';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';
import { environment } from '../../environments/environment';

const CATEGORY_LABELS: Record<string, string> = {
  RESTAURANT: 'Restauration',
  SUPERMARKET: 'Supérette / alimentation',
  BAKERY: 'Boulangerie / pâtisserie',
  PHARMACY: 'Pharmacie',
  FASHION: 'Mode et accessoires',
  ELECTRONICS: 'Téléphonie / électronique',
  BEAUTY: 'Cosmétiques / beauté',
  HARDWARE: 'Quincaillerie / matériaux',
  BOOKS: 'Librairie / fournitures',
  OTHER: 'Autre'
};

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, SkeletonRowComponent],
  templateUrl: './shops.component.html',
  styleUrl: './shops.component.css'
})
export class ShopsComponent implements OnInit, OnDestroy {
  private shopsService = inject(ShopsService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly shops = signal<Shop[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);
  readonly statusFilter = signal<ShopStatus | 'ALL'>('PENDING');
  readonly selectedShop = signal<Shop | null>(null);
  readonly rejectionReason = signal<string>('');

  readonly counts = computed(() => {
    const all = this.shops();
    return {
      pending: all.filter((s) => s.status === 'PENDING').length,
      approved: all.filter((s) => s.status === 'APPROVED').length,
      rejected: all.filter((s) => s.status === 'REJECTED').length,
      suspended: all.filter((s) => s.status === 'SUSPENDED').length
    };
  });

  readonly filtered = computed<Shop[]>(() => {
    const filter = this.statusFilter();
    if (filter === 'ALL') return this.shops();
    return this.shops().filter((s) => s.status === filter);
  });

  ngOnInit(): void {
    this.pageActions.setPage('Boutiques', 'Modération des commerçants');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.shopsService.list().subscribe({
      next: (data) => {
        this.shops.set(data ?? []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement boutiques', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value as ShopStatus | 'ALL');
  }

  open(shop: Shop): void {
    this.selectedShop.set(shop);
    this.rejectionReason.set('');
  }

  close(): void {
    this.selectedShop.set(null);
  }

  approve(shop: Shop): void {
    this.shopsService.approve(shop.id).subscribe({
      next: (updated) => {
        this.replaceLocal(updated);
        this.close();
      }
    });
  }

  reject(shop: Shop): void {
    const reason = this.rejectionReason().trim();
    this.shopsService.reject(shop.id, reason || undefined).subscribe({
      next: (updated) => {
        this.replaceLocal(updated);
        this.close();
      }
    });
  }

  suspend(shop: Shop): void {
    this.shopsService.suspend(shop.id).subscribe({
      next: (updated) => {
        this.replaceLocal(updated);
        this.close();
      }
    });
  }

  private replaceLocal(updated: Shop): void {
    this.shops.set(
      this.shops().map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
    );
  }

  shortId(id: string | undefined): string {
    return (id ?? '').slice(0, 8);
  }

  categoryLabel(c: string): string {
    return CATEGORY_LABELS[c] ?? c;
  }

  logoSrc(shop: Shop): string | null {
    if (!shop.logoUrl) return null;
    return shop.logoUrl.startsWith('http')
      ? shop.logoUrl
      : `${environment.apiUrl}${shop.logoUrl}`;
  }

  statusBadgeClass(status: ShopStatus): string {
    switch (status) {
      case 'PENDING': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'APPROVED': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'REJECTED': return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'SUSPENDED': return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    }
  }

  statusLabel(status: ShopStatus): string {
    return ({
      PENDING: 'En attente',
      APPROVED: 'Approuvée',
      REJECTED: 'Rejetée',
      SUSPENDED: 'Suspendue'
    } as Record<ShopStatus, string>)[status];
  }

  ownerName(shop: Shop): string {
    if (!shop.owner) return '—';
    return `${shop.owner.firstName ?? ''} ${shop.owner.lastName ?? ''}`.trim() || 'Anonyme';
  }
}
