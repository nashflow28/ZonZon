import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RatingStats, User, UsersService } from './users.service';
import { LucideAngularModule } from 'lucide-angular';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

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
  private refreshSub?: Subscription;

  readonly users = signal<User[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly roleFilter = signal<RoleFilter>('ALL');
  readonly search = signal<string>('');

  /// Cache des stats de notation par livreurId (chargées à la volée).
  readonly ratingStats = signal<Record<string, RatingStats>>({});

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
        this.loadDriverRatings();
      },
      error: (err) => {
        console.error('Erreur chargement utilisateurs', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  /// Charge en parallèle les stats de notation pour chaque livreur, en
  /// silence : si un appel échoue on laisse simplement la cellule vide.
  private loadDriverRatings(): void {
    const drivers = this.users().filter((u) => u.role === 'LIVREUR');
    for (const driver of drivers) {
      if (!driver.id) continue;
      this.usersService.getRatingStats(driver.id).subscribe({
        next: (stats) => {
          this.ratingStats.update((current) => ({
            ...current,
            [driver.id]: stats,
          }));
        },
        error: () => {
          // ignore : la cellule reste vide ("—")
        },
      });
    }
  }

  /// Texte affiché dans la colonne "Note moyenne".
  ratingLabel(u: User): string {
    if (u.role !== 'LIVREUR') return '—';
    const stats = this.ratingStats()[u.id];
    if (!stats || stats.count === 0) return '—';
    const avg = stats.average.toFixed(1);
    return `${avg} ★ (${stats.count})`;
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
}
