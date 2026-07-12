import { ApplicationRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { first } from 'rxjs/operators';

/**
 * Gère la mise à jour du service worker Angular : détecte une nouvelle version
 * prête (`VERSION_READY`) et expose un signal consommé par `UpdateToastComponent`
 * (« Nouvelle version disponible — Recharger »). N'active/recharge JAMAIS
 * automatiquement — toujours à l'initiative de l'utilisateur (évite de perdre
 * un formulaire en cours de saisie).
 *
 * Vérifie aussi périodiquement s'il existe une nouvelle version (le SW ne
 * revérifie nativement qu'au prochain rechargement de page), utile pour une
 * PWA installée qui reste ouverte longtemps.
 */
@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  private swUpdate = inject(SwUpdate);
  private zone = inject(NgZone);
  private appRef = inject(ApplicationRef);

  readonly updateAvailable = signal(false);

  init(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        this.zone.run(() => this.updateAvailable.set(true));
      }
    });

    // Vérifie une fois l'app stabilisée, puis toutes les 6h tant qu'elle reste ouverte.
    this.appRef.isStable.pipe(first((stable) => stable)).subscribe(() => {
      this.checkForUpdate();
      setInterval(() => this.checkForUpdate(), 6 * 60 * 60 * 1000);
    });
  }

  private checkForUpdate(): void {
    this.swUpdate.checkForUpdate().catch(() => {
      /* pas de réseau / backend indisponible — on retentera au prochain cycle */
    });
  }

  /** Active la version en attente puis recharge la page (à l'appui du toast). */
  reload(): void {
    this.swUpdate
      .activateUpdate()
      .catch(() => undefined)
      .finally(() => {
        window.location.reload();
      });
  }

  dismiss(): void {
    this.updateAvailable.set(false);
  }
}
