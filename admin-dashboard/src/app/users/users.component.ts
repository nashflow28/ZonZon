import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { User, UserExtendedStats, UsersService } from './users.service';
import { LucideAngularModule } from 'lucide-angular';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';
import { AuthService } from '../auth/auth.service';

type RoleFilter = 'ALL' | 'CLIENT' | 'LIVREUR' | 'ADMIN';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, SkeletonRowComponent],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit, OnDestroy {
  private usersService = inject(UsersService);
  private pageActions = inject(PageActionsService);
  private authService = inject(AuthService);
  private refreshSub?: Subscription;

  readonly users = signal<User[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly roleFilter = signal<RoleFilter>('ALL');
  readonly search = signal<string>('');

  /// Ids en cours de traitement (suspension/réactivation) pour désactiver
  /// les boutons pendant l'appel réseau.
  readonly pendingActionIds = signal<Set<string>>(new Set());

  /// Utilisateur dont le panneau "motif de suspension" est ouvert (null = aucun).
  readonly suspendingId = signal<string | null>(null);
  readonly suspensionReason = signal<string>('');

  /// Utilisateur ADMIN dont le panneau "réinitialiser le mot de passe" est
  /// ouvert (null = aucun). Filet de sécurité utilisable dès aujourd'hui,
  /// indépendant du reset self-service par WhatsApp OTP (encore inactif).
  readonly resettingId = signal<string | null>(null);
  readonly resetPasswordValue = signal<string>('');
  readonly resetError = signal<string | null>(null);

  /// Cache des stats étendues par userId (chargées à la volée pour les livreurs).
  /// Pour les autres rôles on ne stocke que rating average/count via le même format.
  readonly extendedStats = signal<Record<string, UserExtendedStats>>({});

  readonly filteredUsers = computed<User[]>(() => {
    const role = this.roleFilter();
    const term = this.search().trim().toLowerCase();
    return this.users().filter((u) => {
      const roleOk = role === 'ALL' || u.role === role;
      if (!roleOk) return false;
      if (!term) return true;
      const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
      return fullName.includes(term) || (u.phone ?? '').toLowerCase().includes(term);
    });
  });

  ngOnInit(): void {
    this.pageActions.setPage('Utilisateurs', 'Annuaire des clients, livreurs et admins');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.usersService.getUsers().subscribe({
      next: (data) => {
        this.users.set(data ?? []);
        this.isLoading.set(false);
        this.loadDriverStats();
      },
      error: (err) => {
        console.error('Erreur chargement utilisateurs', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  /// Charge en parallèle les stats étendues pour chaque livreur. Si l'endpoint
  /// `/users/:id/stats` n'est pas encore disponible (404/500 le temps que le
  /// backend soit redéployé), on retombe sur l'ancien `/ratings/stats` pour
  /// au moins afficher la note moyenne, et les colonnes "courses", "temps
  /// moyen" et "taux d'annulation" affichent "—".
  private loadDriverStats(): void {
    const drivers = this.users().filter((u) => u.role === 'LIVREUR');
    for (const driver of drivers) {
      if (!driver.id) continue;
      this.usersService
        .getUserExtendedStats(driver.id)
        .pipe(
          catchError(() => {
            // Fallback : ancien endpoint rating-only.
            return this.usersService.getRatingStats(driver.id).pipe(
              // map du RatingStats vers UserExtendedStats pour homogénéité
              // tout en marquant les nouvelles données comme indisponibles.
              catchError(() =>
                of<UserExtendedStats>({
                  ratingAverage: 0,
                  ratingCount: 0,
                  completedCount: 0,
                  averageDurationMinutes: null,
                  cancellationRate: 0,
                }),
              ),
            );
          }),
        )
        .subscribe((stats) => {
          // Si on a reçu un RatingStats (legacy), on le convertit en
          // UserExtendedStats minimal sans les nouvelles métriques.
          const normalized: UserExtendedStats = this.normalizeStats(stats);
          // Marqueur : si les nouvelles métriques étaient absentes du payload,
          // on garde `averageDurationMinutes = null` et on flag implicitement
          // l'absence via `_extended = false`.
          this.extendedStats.update((current) => ({
            ...current,
            [driver.id]: normalized,
          }));
        });
    }
  }

  /// Normalise une réponse potentielle. Si le payload contient les anciens
  /// champs `average`/`count` (RatingStats) au lieu des nouveaux, on map.
  private normalizeStats(raw: unknown): UserExtendedStats {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const num = (v: unknown, def = 0): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : def;

    // Détecter le format legacy (average/count au lieu de ratingAverage/ratingCount).
    const hasNewFormat = 'ratingAverage' in obj || 'completedCount' in obj;
    if (!hasNewFormat) {
      return {
        ratingAverage: num(obj['average']),
        ratingCount: num(obj['count']),
        completedCount: 0,
        averageDurationMinutes: null,
        cancellationRate: 0,
      };
    }

    const avgDur = obj['averageDurationMinutes'];
    return {
      ratingAverage: num(obj['ratingAverage']),
      ratingCount: num(obj['ratingCount']),
      completedCount: num(obj['completedCount']),
      averageDurationMinutes:
        avgDur === null || avgDur === undefined ? null : num(avgDur, 0),
      cancellationRate: num(obj['cancellationRate']),
    };
  }

  /// Récupère les stats d'un livreur (helper pour le template).
  statsFor(u: User): UserExtendedStats | undefined {
    if (u.role !== 'LIVREUR') return undefined;
    return this.extendedStats()[u.id];
  }

  /// Texte affiché dans la colonne "Note moyenne".
  ratingLabel(u: User): string {
    if (u.role !== 'LIVREUR') return '—';
    const stats = this.extendedStats()[u.id];
    if (!stats || stats.ratingCount === 0) return '—';
    const avg = stats.ratingAverage.toFixed(1);
    return `${avg} ★ (${stats.ratingCount})`;
  }

  /// Nombre de courses terminées (livreur uniquement).
  completedLabel(u: User): string {
    if (u.role !== 'LIVREUR') return '—';
    const stats = this.extendedStats()[u.id];
    if (!stats) return '—';
    return `${stats.completedCount}`;
  }

  /// Formate `averageDurationMinutes` :
  ///   - null/undefined → "—"
  ///   - < 60 min → "X min"
  ///   - >= 60 min → "Yh" ou "Yh Zmin"
  formatDuration(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';
    if (!Number.isFinite(minutes)) return '—';
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}min`;
  }

  /// Texte de la colonne "Temps moyen" pour un user.
  durationLabel(u: User): string {
    if (u.role !== 'LIVREUR') return '—';
    const stats = this.extendedStats()[u.id];
    if (!stats) return '—';
    return this.formatDuration(stats.averageDurationMinutes);
  }

  /// Texte de la colonne "Taux d'annulation".
  cancellationLabel(u: User): string {
    if (u.role !== 'LIVREUR') return '—';
    const stats = this.extendedStats()[u.id];
    if (!stats) return '—';
    const rate = stats.cancellationRate ?? 0;
    return `${(rate * 100).toFixed(1)}%`;
  }

  /// Couleur Tailwind du badge taux d'annulation :
  ///   - < 5%  → vert (`text-emerald-300`)
  ///   - 5-15% → jaune (`text-yellow-300`)
  ///   - > 15% → rouge (`text-red-300`)
  cancellationRateColor(rate: number): string {
    if (rate < 0.05) return 'text-emerald-300';
    if (rate < 0.15) return 'text-yellow-300';
    return 'text-red-300';
  }

  /// Classes du badge "taux d'annulation" (fond + texte).
  cancellationBadge(u: User): string {
    if (u.role !== 'LIVREUR') return 'text-slate-600';
    const stats = this.extendedStats()[u.id];
    if (!stats) return 'text-slate-600';
    const rate = stats.cancellationRate ?? 0;
    if (rate < 0.05) return 'bg-emerald-500/20 text-emerald-300';
    if (rate < 0.15) return 'bg-yellow-500/20 text-yellow-300';
    return 'bg-red-500/20 text-red-300';
  }

  initials(u: User): string {
    return `${(u.firstName?.[0] ?? '').toUpperCase()}${(u.lastName?.[0] ?? '').toUpperCase()}`;
  }

  shortId(id: string | undefined): string {
    return (id ?? '').slice(0, 8);
  }

  roleBadge(role: string): string {
    switch (role) {
      case 'ADMIN': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'LIVREUR': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'CLIENT': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  }

  onRoleChange(value: string): void {
    this.roleFilter.set(value as RoleFilter);
  }

  onSearch(value: string): void {
    this.search.set(value);
  }

  /// `true` si le compte est suspendu. Par défaut (champ absent → anciennes
  /// réponses backend) on considère le compte actif.
  isSuspended(u: User): boolean {
    return u.status === 'SUSPENDED';
  }

  /// Classes du badge de statut de compte.
  statusBadge(u: User): string {
    return this.isSuspended(u)
      ? 'bg-red-500/20 text-red-300 border-red-500/40'
      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  }

  statusLabel(u: User): string {
    return this.isSuspended(u) ? 'Suspendu' : 'Actif';
  }

  /// Empêche un admin de se suspendre lui-même.
  isSelf(u: User): boolean {
    const current = this.authService.getCurrentUser();
    return !!current && current.id === u.id;
  }

  isBusy(id: string): boolean {
    return this.pendingActionIds().has(id);
  }

  private setBusy(id: string, busy: boolean): void {
    this.pendingActionIds.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private replaceLocal(updated: User): void {
    this.users.set(
      this.users().map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
    );
  }

  openSuspend(u: User): void {
    this.suspendingId.set(u.id);
    this.suspensionReason.set('');
  }

  closeSuspend(): void {
    this.suspendingId.set(null);
    this.suspensionReason.set('');
  }

  confirmSuspend(u: User): void {
    if (this.isBusy(u.id)) return;
    if (!confirm(`Suspendre le compte de ${u.firstName} ${u.lastName} ?`)) return;
    const reason = this.suspensionReason().trim();
    this.setBusy(u.id, true);
    this.usersService.suspendUser(u.id, reason || undefined).subscribe({
      next: (updated) => {
        this.setBusy(u.id, false);
        this.closeSuspend();
        this.replaceLocal({ ...u, ...updated, status: 'SUSPENDED' });
      },
      error: (err) => {
        console.error('Erreur suspension utilisateur', err);
        this.setBusy(u.id, false);
        alert("Impossible de suspendre ce compte. Réessayez.");
      }
    });
  }

  reactivate(u: User): void {
    if (this.isBusy(u.id)) return;
    if (!confirm(`Réactiver le compte de ${u.firstName} ${u.lastName} ?`)) return;
    this.setBusy(u.id, true);
    this.usersService.reactivateUser(u.id).subscribe({
      next: (updated) => {
        this.setBusy(u.id, false);
        this.replaceLocal({ ...u, ...updated, status: 'ACTIVE' });
      },
      error: (err) => {
        console.error('Erreur réactivation utilisateur', err);
        this.setBusy(u.id, false);
        alert("Impossible de réactiver ce compte. Réessayez.");
      }
    });
  }

  openReset(u: User): void {
    this.resettingId.set(u.id);
    this.resetPasswordValue.set('');
    this.resetError.set(null);
  }

  closeReset(): void {
    this.resettingId.set(null);
    this.resetPasswordValue.set('');
    this.resetError.set(null);
  }

  confirmReset(u: User): void {
    if (this.isBusy(u.id)) return;
    const newPassword = this.resetPasswordValue().trim();
    if (newPassword.length < 8) {
      this.resetError.set('8 caractères minimum.');
      return;
    }
    if (!confirm(`Réinitialiser le mot de passe de ${u.firstName} ${u.lastName} ?`)) return;

    this.setBusy(u.id, true);
    this.resetError.set(null);
    this.usersService.resetAdminPassword(u.id, newPassword).subscribe({
      next: () => {
        this.setBusy(u.id, false);
        this.closeReset();
        alert(`Mot de passe réinitialisé pour ${u.firstName} ${u.lastName}. Communiquez-le-lui directement.`);
      },
      error: (err) => {
        console.error('Erreur réinitialisation mot de passe', err);
        this.setBusy(u.id, false);
        const msg = err?.error?.message;
        this.resetError.set(
          typeof msg === 'string' ? msg : 'Impossible de réinitialiser ce mot de passe.'
        );
      }
    });
  }
}
