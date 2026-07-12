import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Écran "Bientôt" générique utilisé pour chaque onglet le temps que l'écran
 * métier correspondant soit développé. Le titre est fourni via `data.title`
 * de la route (bindé automatiquement grâce à withComponentInputBinding()).
 */
@Component({
  selector: 'app-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="placeholder">
      <h2>{{ title() }}</h2>
      <p>Bientôt disponible.</p>
    </div>
  `,
  styles: [
    `
      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 60vh;
        text-align: center;
        padding: 24px;
        color: var(--zz-text-mut);
      }

      h2 {
        margin: 0;
        color: var(--zz-text-hi);
        font-size: 20px;
        font-weight: 700;
      }

      p {
        margin: 0;
        font-size: 15px;
      }
    `,
  ],
})
export class PlaceholderComponent {
  readonly title = input<string>('');
}
