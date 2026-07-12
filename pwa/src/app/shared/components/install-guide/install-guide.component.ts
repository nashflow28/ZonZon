import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PwaInstallService } from '../../services/pwa-install.service';

/**
 * Guide d'installation « Ajouter à l'écran d'accueil ».
 *
 * - iOS/Safari : pas de `beforeinstallprompt` côté WebKit — on affiche donc un
 *   petit encart non intrusif expliquant les 3 étapes manuelles (Partager →
 *   Sur l'écran d'accueil → Ajouter). Fermable, mémorisé en localStorage
 *   (ne réapparaît plus une fois fermé).
 * - Android/Chrome : si `beforeinstallprompt` a été capturé, un vrai bouton
 *   « Installer » déclenche le prompt natif (bonus).
 */
@Component({
  selector: 'app-install-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.showIosGuide()) {
      <div class="install-card" role="complementary">
        <button type="button" class="close" (click)="install.dismissIosGuide()" aria-label="Fermer">✕</button>
        <div class="header">
          <span class="app-badge">Z</span>
          <div>
            <p class="title">Installer ZonZon</p>
            <p class="subtitle">Ajoutez l'app à votre écran d'accueil pour un accès rapide.</p>
          </div>
        </div>
        <ol class="steps">
          <li><span class="icon">⬆︎</span> Appuyez sur <strong>Partager</strong> dans Safari</li>
          <li><span class="icon">＋</span> Choisissez <strong>Sur l'écran d'accueil</strong></li>
          <li><span class="icon">✓</span> Appuyez sur <strong>Ajouter</strong></li>
        </ol>
      </div>
    }

    @if (install.canPromptAndroid()) {
      <div class="install-card install-card--compact" role="complementary">
        <div class="header">
          <span class="app-badge">Z</span>
          <div>
            <p class="title">Installer ZonZon</p>
            <p class="subtitle">Accédez à l'app directement depuis votre écran d'accueil.</p>
          </div>
        </div>
        <button type="button" class="btn-install" (click)="install.promptAndroidInstall()">
          Installer
        </button>
      </div>
    }
  `,
  styles: [
    `
      .install-card {
        position: relative;
        margin: 12px 16px;
        padding: 16px;
        border-radius: 16px;
        background: var(--zz-card);
        border: 1px solid var(--zz-line);
        color: var(--zz-text-hi);
      }

      .close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        min-width: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: -8px -8px 0 0;
        border: none;
        background: transparent;
        color: var(--zz-text-mut);
        font-size: 14px;
        cursor: pointer;
      }

      .header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
        padding-right: 28px;
      }

      .app-badge {
        flex: 0 0 auto;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--zz-go);
        color: #06251b;
        font-weight: 800;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .title {
        margin: 0 0 2px;
        font-weight: 700;
        font-size: 15px;
      }

      .subtitle {
        margin: 0;
        font-size: 13px;
        color: var(--zz-text-mut);
        line-height: 1.4;
      }

      .steps {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .steps li {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        color: var(--zz-text-hi);
      }

      .steps .icon {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: var(--zz-bg);
        border: 1px solid var(--zz-line);
        font-size: 13px;
      }

      .btn-install {
        width: 100%;
        min-height: 44px;
        border: none;
        border-radius: 10px;
        background: var(--zz-go);
        color: #06251b;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
      }
    `,
  ],
})
export class InstallGuideComponent {
  protected install = inject(PwaInstallService);
}
