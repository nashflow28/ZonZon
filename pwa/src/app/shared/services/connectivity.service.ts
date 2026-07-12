import { Injectable, NgZone, inject, signal } from '@angular/core';

/**
 * Suivi de la connectivité réseau (`navigator.onLine` + events `online`/`offline`).
 * Sert à afficher une bannière discrète « Hors ligne » (voir `OfflineBannerComponent`)
 * et, potentiellement, à adapter le comportement des écrans (pas de nouvel appel HTTP
 * inutile pendant la coupure).
 *
 * Limite connue : `navigator.onLine` détecte surtout l'absence totale de réseau
 * (avion, wifi coupé) — une coupure applicative (backend down, DNS) sans coupure
 * réseau locale ne sera pas détectée ici (les écrans gèrent déjà ce cas via leurs
 * propres `errorMessage` sur échec HTTP).
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private zone = inject(NgZone);

  readonly online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.zone.run(() => this.online.set(true)));
    window.addEventListener('offline', () => this.zone.run(() => this.online.set(false)));
  }
}
