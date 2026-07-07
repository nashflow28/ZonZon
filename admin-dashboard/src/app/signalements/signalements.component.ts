import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import {
  PagedSignalements,
  Signalement,
  SignalementsFilter,
  SignalementsService,
  SignalementStatus,
  SignalementStatusFilter,
  SignalementTargetType,
  SignalementTargetTypeFilter
} from './signalements.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

const PAGE_LIMIT = 20;

@Component({
  selector: 'app-signalements',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    EmptyStateComponent,
    SkeletonRowComponent
  ],
  templateUrl: './signalements.component.html',
  styleUrl: './signalements.component.css'
})
export class SignalementsComponent implements OnInit, OnDestroy {
  private signalements = inject(SignalementsService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly items = signal<Signalement[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly statusFilter = signal<SignalementStatusFilter>('ALL');
  readonly targetTypeFilter = signal<SignalementTargetTypeFilter>('ALL');

  /// id du signalement en cours de mise à jour (désactive ses boutons le temps de l'appel).
  readonly updatingId = signal<string | null>(null);

  readonly page = signal<number>(1);
  readonly total = signal<number>(0);
  readonly hasMore = signal<boolean>(false);
  readonly limit = PAGE_LIMIT;

  readonly totalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.total() / this.limit))
  );

  readonly canPrev = computed<boolean>(() => this.page() > 1);
  readonly canNext = computed<boolean>(
    () => this.hasMore() || this.page() < this.totalPages()
  );

  readonly statusOptions: Array<{ value: SignalementStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Tous' },
    { value: 'OPEN', label: 'Ouvert' },
    { value: 'REVIEWED', label: 'Examiné' },
    { value: 'RESOLVED', label: 'Résolu' },
    { value: 'DISMISSED', label: 'Rejeté' }
  ];

  readonly targetTypeOptions: Array<{ value: SignalementTargetTypeFilter; label: string }> = [
    { value: 'ALL', label: 'Toutes les cibles' },
    { value: 'DELIVERY', label: 'Livraison' },
    { value: 'USER', label: 'Utilisateur' },
    { value: 'DRIVER', label: 'Livreur' },
    { value: 'MERCHANT', label: 'Commerçant' }
  ];

  ngOnInit(): void {
    this.pageActions.setPage(
      'Signalements',
      'Signalements des utilisateurs (livraisons, comptes, livreurs, commerçants)'
    );
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    const query: SignalementsFilter = {
      page: this.page(),
      limit: this.limit,
      status: this.statusFilter(),
      targetType: this.targetTypeFilter()
    };
    this.signalements.list(query).subscribe({
      next: (res: PagedSignalements) => {
        this.items.set(res.items ?? []);
        this.total.set(res.total ?? 0);
        this.hasMore.set(res.hasMore ?? false);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur signalements', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  private reloadFromFirstPage(): void {
    this.page.set(1);
    this.fetch();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter.set(value as SignalementStatusFilter);
    this.reloadFromFirstPage();
  }

  onTargetTypeFilterChange(value: string): void {
    this.targetTypeFilter.set(value as SignalementTargetTypeFilter);
    this.reloadFromFirstPage();
  }

  resetFilters(): void {
    this.statusFilter.set('ALL');
    this.targetTypeFilter.set('ALL');
    this.reloadFromFirstPage();
  }

  prevPage(): void {
    if (!this.canPrev()) return;
    this.page.update((p) => p - 1);
    this.fetch();
  }

  nextPage(): void {
    if (!this.canNext()) return;
    this.page.update((p) => p + 1);
    this.fetch();
  }

  /// Change le statut d'un signalement et met à jour la liste locale (pas de refetch complet).
  changeStatus(item: Signalement, status: SignalementStatus): void {
    if (item.status === status || this.updatingId()) return;
    this.updatingId.set(item.id);
    this.signalements.updateStatus(item.id, status).subscribe({
      next: (updated) => {
        this.items.update((list) =>
          list.map((s) => (s.id === updated.id ? updated : s))
        );
        this.updatingId.set(null);
      },
      error: (err) => {
        console.error('Erreur changement de statut signalement', err);
        this.updatingId.set(null);
      }
    });
  }

  /// Classe Tailwind du badge selon le statut.
  statusBadge(status: SignalementStatus): string {
    switch (status) {
      case 'OPEN':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'REVIEWED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'RESOLVED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'DISMISSED':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  }

  /// Libellé lisible du statut.
  statusLabel(status: SignalementStatus): string {
    switch (status) {
      case 'OPEN': return 'Ouvert';
      case 'REVIEWED': return 'Examiné';
      case 'RESOLVED': return 'Résolu';
      case 'DISMISSED': return 'Rejeté';
      default: return status;
    }
  }

  /// Libellé lisible du type de cible.
  targetTypeLabel(type: SignalementTargetType): string {
    switch (type) {
      case 'DELIVERY': return 'Livraison';
      case 'USER': return 'Utilisateur';
      case 'DRIVER': return 'Livreur';
      case 'MERCHANT': return 'Commerçant';
      default: return type;
    }
  }

  /// Classe Tailwind du badge selon le type de cible.
  targetTypeBadge(type: SignalementTargetType): string {
    switch (type) {
      case 'DELIVERY':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'USER':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'DRIVER':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'MERCHANT':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  }

  /// ID raccourci (8 premiers caractères) pour l'affichage.
  shortId(id: string | null | undefined): string {
    if (!id) return '-';
    return id.slice(0, 8);
  }
}
