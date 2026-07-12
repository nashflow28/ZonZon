import { Injectable, NgZone, inject, signal } from '@angular/core';

const DISMISS_KEY = 'zonzon_install_guide_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Détection et pilotage de « Ajouter à l'écran d'accueil ».
 *
 * - iOS/Safari : PAS de `beforeinstallprompt` (API absente de WebKit). La seule
 *   voie est manuelle (Partager → Sur l'écran d'accueil) — ce service détecte
 *   juste si on doit montrer le petit guide (iOS + Safari + pas déjà installé)
 *   et mémorise le "dismiss" en localStorage pour ne pas être intrusif.
 * - Android/Chrome : capture `beforeinstallprompt` pour proposer un vrai
 *   bouton « Installer » (bonus demandé dans la consigne).
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private zone = inject(NgZone);

  /** true si l'app tourne déjà en mode standalone (installée), tous OS confondus. */
  readonly isStandalone = signal(this.detectStandalone());

  /** true si on doit proposer le guide manuel iOS (Safari, pas installé, pas dismiss). */
  readonly showIosGuide = signal(false);

  /** Événement Android/Chrome capturé, prêt à être déclenché par `promptAndroidInstall()`. */
  readonly canPromptAndroid = signal(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (typeof window === 'undefined') return;

    if (this.isStandalone()) return; // déjà installée : rien à proposer

    if (this.isIosSafari() && !this.wasDismissed()) {
      this.showIosGuide.set(true);
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.zone.run(() => this.canPromptAndroid.set(true));
    });

    window.addEventListener('appinstalled', () => {
      this.zone.run(() => {
        this.canPromptAndroid.set(false);
        this.isStandalone.set(true);
      });
    });
  }

  dismissIosGuide(): void {
    this.showIosGuide.set(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* localStorage indisponible (navigation privée stricte) — non bloquant */
    }
  }

  async promptAndroidInstall(): Promise<void> {
    if (!this.deferredPrompt) return;
    await this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canPromptAndroid.set(false);
  }

  private wasDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  private detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    return iosStandalone || mediaStandalone;
  }

  private isIosSafari(): boolean {
    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (
      /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1 // iPadOS 13+ se déclare "Mac"
    );
    if (!isIos) return false;
    // Exclut les navigateurs tiers sur iOS (tous basés WebKit mais sans le pattern Safari
    // "Version/x.x Safari/" — Chrome iOS ajoute "CriOS", Firefox iOS "FxiOS", etc.).
    const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
    return !isOtherBrowser;
  }
}
