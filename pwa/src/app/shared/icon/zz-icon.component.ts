import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ZzIconName =
  | 'home'
  | 'orders'
  | 'shops'
  | 'profile'
  | 'radar'
  | 'deliveries'
  | 'create'
  | 'drivers';

/**
 * Petite bibliothèque d'icônes inline (style trait, cohérent visuellement),
 * pour éviter une dépendance externe supplémentaire dans cette fondation.
 * Pourra être remplacée par lucide-angular (comme admin-dashboard) plus tard
 * sans changer l'API du composant (nom + taille).
 */
@Component({
  selector: 'zz-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
        }
        @case ('orders') {
          <rect x="4" y="4" width="16" height="17" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        }
        @case ('shops') {
          <path d="M4 9l1-5h14l1 5" />
          <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
          <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
          <path d="M10 20v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
        }
        @case ('profile') {
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        }
        @case ('radar') {
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <path d="M12 12 18 7" />
        }
        @case ('deliveries') {
          <rect x="2.5" y="7" width="12" height="9" rx="1.2" />
          <path d="M14.5 10h3.5l3 3v3h-6.5z" />
          <circle cx="7" cy="18" r="1.6" />
          <circle cx="16.5" cy="18" r="1.6" />
        }
        @case ('create') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        }
        @case ('drivers') {
          <circle cx="8" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M2.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M14.5 20a4 4 0 0 1 7 0" />
        }
      }
    </svg>
  `,
})
export class ZzIconComponent {
  readonly name = input.required<ZzIconName>();
  readonly size = input<number>(24);
}
