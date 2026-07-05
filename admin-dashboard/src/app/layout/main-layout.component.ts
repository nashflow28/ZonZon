import { Component, computed, inject, signal, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LucideAngularModule } from 'lucide-angular';
import { LiveStatusService } from '../shared/live-status.service';
import { PageActionsService } from '../shared/page-actions.service';

interface NavLink {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly liveStatus = inject(LiveStatusService);
  readonly pageActions = inject(PageActionsService);

  user = computed(() => this.authService.currentUser());

  readonly sidebarOpen = signal(false);
  readonly userMenuOpen = signal(false);

  readonly navLinks: NavLink[] = [
    { path: 'dashboard', label: 'Tableau de bord', icon: 'zap' },
    { path: 'shops', label: 'Boutiques', icon: 'store' },
    { path: 'reports', label: 'Comptabilité', icon: 'banknote' },
    { path: 'users', label: 'Utilisateurs', icon: 'users-icon' },
    { path: 'driver-validation', label: 'Validation livreurs', icon: 'user-check' },
    { path: 'archives', label: 'Archives', icon: 'archive' },
    { path: 'audit-logs', label: 'Journal d\'audit', icon: 'clipboard-list' }
  ];

  private routerSub?: Subscription;

  ngOnInit(): void {
    this.liveStatus.connect();
    // Ferme le drawer a chaque navigation (UX mobile).
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.sidebarOpen.set(false));
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  refresh(): void {
    this.pageActions.triggerRefresh();
  }

  logout(): void {
    this.userMenuOpen.set(false);
    this.authService.logout();
  }

  initials(): string {
    const u = this.user();
    if (!u) return '';
    return `${(u.firstName?.[0] ?? '').toUpperCase()}${(u.lastName?.[0] ?? '').toUpperCase()}`;
  }

  liveDotClass(): string {
    const s = this.liveStatus.status();
    if (s === 'connected') return 'bg-emerald-500';
    if (s === 'error') return 'bg-red-500';
    return 'bg-slate-500';
  }

  liveLabel(): string {
    const s = this.liveStatus.status();
    if (s === 'connected') return 'En ligne';
    if (s === 'error') return 'Erreur';
    return 'Hors ligne';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.sidebarOpen()) this.sidebarOpen.set(false);
    if (this.userMenuOpen()) this.userMenuOpen.set(false);
  }
}
