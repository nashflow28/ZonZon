import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Service partage entre le header du layout et les ecrans.
 *
 * - `refresh$` : chaque ecran (dashboard, reports, users, archives) s'y abonne
 *   dans son `ngOnInit` et rappelle son propre `fetch()`. Le bouton
 *   "Rafraichir" du header appelle `triggerRefresh()`.
 * - `title` / `subtitle` : signals que chaque ecran met a jour pour afficher
 *   un titre contextuel dans le header partage.
 */
@Injectable({ providedIn: 'root' })
export class PageActionsService {
  readonly refresh$ = new Subject<void>();

  readonly title = signal<string>('');
  readonly subtitle = signal<string>('');

  triggerRefresh(): void {
    this.refresh$.next();
  }

  setPage(title: string, subtitle = ''): void {
    this.title.set(title);
    this.subtitle.set(subtitle);
  }
}
