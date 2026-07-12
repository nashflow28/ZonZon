import { Injectable, signal } from '@angular/core';

export interface PendingPickup {
  address: string;
  lat: number;
  lng: number;
}

/**
 * Petit registre partagé entre l'onglet Boutiques et l'onglet Accueil :
 * « commander depuis cette boutique » pré-remplit le point de retrait avec
 * l'adresse de la boutique puis bascule vers l'Accueil (même principe que
 * `ClientServices.pendingShopSelection` côté Flutter).
 */
@Injectable({ providedIn: 'root' })
export class ClientOrderDraftService {
  readonly pendingPickup = signal<PendingPickup | null>(null);

  setPendingPickup(pickup: PendingPickup): void {
    this.pendingPickup.set(pickup);
  }

  consumePendingPickup(): PendingPickup | null {
    const value = this.pendingPickup();
    this.pendingPickup.set(null);
    return value;
  }
}
