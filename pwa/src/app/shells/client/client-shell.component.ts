import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { InstallGuideComponent } from '../../shared/components/install-guide/install-guide.component';
import { ConnectivityService } from '../../shared/services/connectivity.service';
import { TabBarComponent, ZzTab } from '../../shared/tab-bar/tab-bar.component';

const TABS: ZzTab[] = [
  { label: 'Accueil', icon: 'home', path: 'home' },
  { label: 'Commandes', icon: 'orders', path: 'orders' },
  { label: 'Boutiques', icon: 'shops', path: 'shops' },
  { label: 'Profil', icon: 'profile', path: 'profile' },
];

/** Shell de l'espace Client : header large-title + contenu + tab bar iOS. */
@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet, TabBarComponent, InstallGuideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './client-shell.component.html',
  styleUrl: '../shell.css',
})
export class ClientShellComponent {
  protected connectivity = inject(ConnectivityService);
  readonly tabs = TABS;
  readonly title = signal('ZonZon');

  constructor(private router: Router) {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.title.set(this.currentTitle());
    });
  }

  private currentTitle(): string {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return (route.data['title'] as string) ?? 'ZonZon';
  }
}
