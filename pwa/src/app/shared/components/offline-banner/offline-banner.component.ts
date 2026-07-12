import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectivityService } from '../../services/connectivity.service';

/**
 * Bannière discrète affichée pleine largeur en haut de l'écran quand la
 * connexion réseau tombe (`navigator.onLine` → false). Se masque
 * automatiquement au retour en ligne. N'importe quel écran actif garde son
 * état déjà chargé — cette bannière ne fait qu'informer, sans bloquer l'UI.
 */
@Component({
  selector: 'app-offline-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!connectivity.online()) {
      <div class="offline-banner" role="status" aria-live="polite">
        <span class="dot"></span>
        Hors ligne — certaines actions sont indisponibles
      </div>
    }
  `,
  styles: [
    `
      .offline-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 60;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 16px;
        padding-top: calc(8px + var(--zz-safe-top));
        background: var(--zz-coral);
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
      }

      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #fff;
        flex: 0 0 auto;
      }
    `,
  ],
})
export class OfflineBannerComponent {
  protected connectivity = inject(ConnectivityService);
}
