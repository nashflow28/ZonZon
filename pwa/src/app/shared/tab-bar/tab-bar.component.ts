import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ZzIconComponent, ZzIconName } from '../icon/zz-icon.component';

export interface ZzTab {
  label: string;
  icon: ZzIconName;
  path: string;
}

/**
 * Tab bar iOS (HIG) : fond `--zz-card`, bordure haute `--zz-line`,
 * hauteur ~50px + respect du home indicator via safe-area-inset-bottom.
 * Teinte active `--zz-go`, inactive `--zz-text-mut`.
 */
@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, RouterLinkActive, ZzIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tab-bar zz-safe-bottom zz-safe-x">
      @for (tab of tabs(); track tab.path) {
        <a
          class="tab-item"
          [routerLink]="tab.path"
          routerLinkActive="tab-item--active"
          [routerLinkActiveOptions]="{ exact: false }"
        >
          <zz-icon [name]="tab.icon" [size]="24" />
          <span>{{ tab.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: [
    `
      /* La safe-area doit s'AJOUTER à la hauteur, pas s'y soustraire :
         box-sizing border-box est global, donc une hauteur fixe de 50px
         incluait le padding-bottom de la classe .zz-safe-bottom.
         Sur un iPhone à home indicator (34px), il ne restait que 15px de
         contenu — icônes et libellés débordaient sur la barre d'accueil et la
         cible tactile tombait très en dessous des 44px des HIG. */
      .tab-bar {
        display: flex;
        align-items: stretch;
        min-height: 50px;
        height: calc(50px + var(--zz-safe-bottom));
        background: var(--zz-card);
        border-top: 1px solid var(--zz-line);
      }

      .tab-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        /* Garantit la cible tactile même sans safe-area (49px + 1px de bordure). */
        min-height: 49px;
        gap: 2px;
        text-decoration: none;
        color: var(--zz-text-mut);
        font-size: 10px;
        font-weight: 600;
      }

      .tab-item--active {
        color: var(--zz-go);
      }
    `,
  ],
})
export class TabBarComponent {
  readonly tabs = input.required<ZzTab[]>();
}
