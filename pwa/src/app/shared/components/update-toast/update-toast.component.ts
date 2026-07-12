import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SwUpdateService } from '../../services/sw-update.service';

/**
 * Petit toast en bas d'écran quand `SwUpdate` détecte une nouvelle version du
 * service worker (`VERSION_READY`). Recharge uniquement à l'appui de
 * l'utilisateur (jamais automatique — évite de perdre une saisie en cours).
 */
@Component({
  selector: 'app-update-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (swUpdate.updateAvailable()) {
      <div class="update-toast zz-safe-bottom" role="status">
        <span>Nouvelle version disponible</span>
        <div class="actions">
          <button type="button" class="btn-dismiss" (click)="swUpdate.dismiss()">Plus tard</button>
          <button type="button" class="btn-reload" (click)="swUpdate.reload()">Recharger</button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .update-toast {
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: calc(16px + var(--zz-safe-bottom));
        z-index: 70;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--zz-card);
        border: 1px solid var(--zz-line);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        color: var(--zz-text-hi);
        font-size: 14px;
        font-weight: 600;
      }

      .actions {
        display: flex;
        gap: 8px;
        flex: 0 0 auto;
      }

      button {
        border: none;
        border-radius: 10px;
        padding: 8px 14px;
        min-height: 44px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .btn-dismiss {
        background: transparent;
        color: var(--zz-text-mut);
      }

      .btn-reload {
        background: var(--zz-go);
        color: #06251b;
      }
    `,
  ],
})
export class UpdateToastComponent {
  protected swUpdate = inject(SwUpdateService);
}
