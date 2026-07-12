import { Injectable, NgZone, inject, signal } from '@angular/core';

export type WebPushState =
  | 'unsupported' // API Notification/ServiceWorker/PushManager absente du navigateur
  | 'requires-install' // supporté mais PWA pas installée (Safari iOS < standalone)
  | 'not-requested' // supporté + installée, permission jamais demandée
  | 'denied' // utilisateur a refusé la permission
  | 'granted'; // permission accordée

/**
 * Service de notifications « push » — VOLONTAIREMENT limité et honnête sur ce
 * qu'il fait réellement. Lire avant de modifier :
 *
 * ⚠️ CE QUI FONCTIONNE VRAIMENT ICI :
 *  - Gestion de la permission `Notification` du navigateur.
 *  - Affichage de notifications LOCALES pendant que l'app/onglet est ouvert(e)
 *    (via `notifyLocal()`), déclenchées par les événements Socket.IO déjà
 *    reçus en temps réel (voir `RealtimeNotificationsBridge` appelé depuis
 *    `App`). Cela fonctionne tant que la page JS tourne (foreground, ou
 *    quelques secondes/minutes en arrière-plan selon l'OS) — PAS quand l'app
 *    est complètement fermée ou l'iPhone verrouillé longtemps.
 *
 * ⚠️ CE QUI NE FONCTIONNE PAS (et ne doit jamais être présenté comme actif) :
 *  - Le vrai Web Push standard (`PushManager.subscribe()` + clé VAPID) qui
 *    réveille le service worker même app fermée : NON implémenté ici, car
 *    (a) le backend actuel n'expose aucun endpoint pour enregistrer un
 *    abonnement Web Push standard (il envoie via Firebase Cloud Messaging —
 *    tokens FCM natifs mobile — pas via VAPID/Web Push), et
 *    (b) sur iOS, même le Web Push standard exige iOS ≥ 16.4 ET l'app
 *    installée sur l'écran d'accueil (jamais dans l'onglet Safari classique).
 *  - Pour livrer du vrai push iOS/web de bout en bout, il faudra dans un
 *    round backend ultérieur soit (a) intégrer le SDK Firebase JS Web
 *    (`firebase/messaging`, `getToken()` avec clé VAPID côté Firebase) et un
 *    envoi FCM Web depuis le backend, soit (b) ajouter un vrai endpoint
 *    Web Push VAPID (`web-push` npm côté NestJS) + `PushManager.subscribe()`
 *    ici. Aucune des deux n'est faite dans ce round.
 *
 * En attendant, le canal fiable pour l'utilisateur reste le centre de
 * notifications in-app (`GET /notifications`, déjà livré).
 */
@Injectable({ providedIn: 'root' })
export class WebPushService {
  private zone = inject(NgZone);

  readonly state = signal<WebPushState>(this.computeState());

  private isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  private isStandalone(): boolean {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    return iosStandalone || mediaStandalone;
  }

  private computeState(): WebPushState {
    if (typeof window === 'undefined' || !this.isSupported()) return 'unsupported';
    // Sur iOS/Safari, Notification.permission existe même hors standalone mais
    // requestPermission() y échoue silencieusement — on bloque donc l'action
    // tant que l'app n'est pas installée, pour ne pas promettre une case qui
    // ne se cochera jamais.
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIos && !this.isStandalone()) return 'requires-install';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'not-requested';
  }

  refresh(): void {
    this.state.set(this.computeState());
  }

  async requestPermission(): Promise<void> {
    if (!this.isSupported()) return;
    if (this.state() === 'requires-install') return;
    try {
      const result = await Notification.requestPermission();
      this.zone.run(() => this.state.set(result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'not-requested'));
    } catch {
      /* refus silencieux (ex. contexte non sécurisé) — l'état reste inchangé */
    }
  }

  /**
   * Affiche une notification locale si la permission est accordée. Utilisée
   * par `RealtimeNotificationsBridge` pour traduire un événement Socket.IO en
   * notification visible, uniquement si l'onglet n'est pas déjà au premier
   * plan actif (évite le doublon avec ce que l'écran affiche déjà).
   */
  notifyLocal(title: string, body: string): void {
    if (this.state() !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    try {
      const reg = navigator.serviceWorker?.controller ? navigator.serviceWorker : null;
      if (reg) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body,
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
          });
        });
      } else {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
      }
    } catch {
      /* API Notification capricieuse selon contexte — non bloquant */
    }
  }
}
