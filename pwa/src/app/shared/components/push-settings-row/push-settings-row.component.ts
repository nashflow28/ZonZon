import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WebPushService } from '../../services/web-push.service';

/**
 * Ligne « Notifications push » pour les écrans Profil (client/livreur/
 * commerçant). Affiche honnêtement l'état réel — jamais « activées » si ce
 * n'est pas vrai. Sur iOS, le push n'est possible qu'à partir d'iOS 16.4 ET
 * seulement app installée sur l'écran d'accueil (voir `WebPushService` pour
 * le détail des limites : pas de vrai Web Push VAPID côté backend pour
 * l'instant, seulement des notifications locales pendant que l'app tourne).
 */
@Component({
  selector: 'app-push-settings-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="row-btn"
      [class.row-btn--disabled]="state() === 'unsupported'"
      (click)="onClick()"
    >
      <span>Notifications push</span>
      <span class="row-right">
        <span class="status" [class]="'status--' + state()">{{ statusLabel() }}</span>
        @if (state() === 'not-requested') {
          <span class="chevron">›</span>
        }
      </span>
    </button>
    @if (state() === 'requires-install') {
      <p class="hint">Installez ZonZon sur l'écran d'accueil pour activer les notifications.</p>
    }
    @if (state() === 'unsupported') {
      <p class="hint">Votre navigateur ne prend pas en charge les notifications.</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .row-btn {
        width: 100%;
        min-height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--zz-card);
        border: 1px solid var(--zz-line);
        border-radius: 14px;
        padding: 14px 16px;
        font-size: 15px;
        font-weight: 600;
        color: var(--zz-text-hi);
        text-align: left;
        cursor: pointer;
      }

      .row-btn--disabled {
        cursor: default;
        color: var(--zz-text-mut);
      }

      .row-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .status {
        font-size: 13px;
        font-weight: 600;
        color: var(--zz-text-mut);
      }

      .status--granted {
        color: var(--zz-go);
      }

      .status--denied {
        color: var(--zz-coral);
      }

      .chevron {
        color: var(--zz-text-mut);
        font-size: 18px;
      }

      .hint {
        margin: 6px 0 0;
        padding: 0 4px;
        font-size: 12px;
        color: var(--zz-text-mut);
        line-height: 1.4;
      }
    `,
  ],
})
export class PushSettingsRowComponent {
  private webPush = inject(WebPushService);

  readonly state = this.webPush.state;

  readonly statusLabel = computed(() => {
    switch (this.state()) {
      case 'granted':
        return 'Activées';
      case 'denied':
        return 'Refusées';
      case 'requires-install':
        return 'À installer';
      case 'unsupported':
        return 'Non supportées';
      default:
        return 'Désactivées';
    }
  });

  onClick(): void {
    if (this.state() === 'not-requested') {
      this.webPush.requestPermission();
    }
  }
}
