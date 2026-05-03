import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import {
  AuditAction,
  AuditActionFilter,
  AuditLog,
  AuditLogsService,
  PagedAuditLogs
} from './audit-logs.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

const PAGE_LIMIT = 20;

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    EmptyStateComponent,
    SkeletonRowComponent
  ],
  templateUrl: './audit-logs.component.html',
  styleUrls: ['./audit-logs.component.css']
})
export class AuditLogsComponent implements OnInit, OnDestroy {
  private auditLogs = inject(AuditLogsService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly logs = signal<AuditLog[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly actionFilter = signal<AuditActionFilter>('ALL');

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

  /// Liste des actions affichées dans le sélecteur.
  readonly actionOptions: Array<{ value: AuditActionFilter; label: string }> = [
    { value: 'ALL', label: 'Toutes' },
    { value: 'SHOP_APPROVE', label: 'Boutique approuvée' },
    { value: 'SHOP_REJECT', label: 'Boutique rejetée' },
    { value: 'SHOP_SUSPEND', label: 'Boutique suspendue' },
    { value: 'COMMISSION_MARK_PAID', label: 'Commission payée' },
    { value: 'USER_DELETE', label: 'Utilisateur supprimé' },
    { value: 'USER_RESTORE', label: 'Utilisateur restauré' }
  ];

  ngOnInit(): void {
    this.pageActions.setPage(
      'Journal d\'audit',
      'Historique des actions admin (modération, comptabilité, comptes)'
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
    this.auditLogs
      .list({
        page: this.page(),
        limit: this.limit,
        action: this.actionFilter(),
        from: this.fromDate() || undefined,
        to: this.toDate() || undefined
      })
      .subscribe({
        next: (res: PagedAuditLogs) => {
          this.logs.set(res.items ?? []);
          this.total.set(res.total ?? 0);
          this.hasMore.set(res.hasMore ?? false);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur audit logs', err);
          this.errored.set(true);
          this.isLoading.set(false);
        }
      });
  }

  private reloadFromFirstPage(): void {
    this.page.set(1);
    this.fetch();
  }

  onFromChange(value: string): void {
    this.fromDate.set(value);
    this.reloadFromFirstPage();
  }

  onToChange(value: string): void {
    this.toDate.set(value);
    this.reloadFromFirstPage();
  }

  onActionChange(value: string): void {
    this.actionFilter.set(value as AuditActionFilter);
    this.reloadFromFirstPage();
  }

  resetFilters(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.actionFilter.set('ALL');
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

  /// Retourne la classe Tailwind du badge selon l'action.
  actionBadge(action: AuditAction): string {
    switch (action) {
      case 'SHOP_APPROVE':
      case 'USER_RESTORE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'SHOP_REJECT':
      case 'USER_DELETE':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'SHOP_SUSPEND':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'COMMISSION_MARK_PAID':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  }

  /// Libellé court de l'action pour l'affichage du badge.
  actionLabel(action: AuditAction): string {
    switch (action) {
      case 'SHOP_APPROVE': return 'Boutique approuvée';
      case 'SHOP_REJECT': return 'Boutique rejetée';
      case 'SHOP_SUSPEND': return 'Boutique suspendue';
      case 'COMMISSION_MARK_PAID': return 'Commission payée';
      case 'USER_DELETE': return 'Utilisateur supprimé';
      case 'USER_RESTORE': return 'Utilisateur restauré';
      default: return action;
    }
  }

  /// Sérialise les métadonnées en JSON formaté pour affichage <pre>.
  formatMetadata(metadata: Record<string, unknown> | null | undefined): string {
    if (!metadata || Object.keys(metadata).length === 0) return '';
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  }

  hasMetadata(log: AuditLog): boolean {
    return !!log.metadata && Object.keys(log.metadata).length > 0;
  }

  /// ID raccourci (8 premiers caractères) pour l'affichage.
  shortId(id: string | null | undefined): string {
    if (!id) return '-';
    return id.slice(0, 8);
  }
}
