import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TabBarComponent, ZzTab } from '../../shared/tab-bar/tab-bar.component';

const TABS: ZzTab[] = [
  { label: 'Radar', icon: 'radar', path: 'radar' },
  { label: 'Mes courses', icon: 'deliveries', path: 'my-deliveries' },
  { label: 'Profil', icon: 'profile', path: 'profile' },
];

/** Shell de l'espace Livreur : header large-title + contenu + tab bar iOS. */
@Component({
  selector: 'app-driver-shell',
  imports: [RouterOutlet, TabBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './driver-shell.component.html',
  styleUrl: '../shell.css',
})
export class DriverShellComponent {
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
