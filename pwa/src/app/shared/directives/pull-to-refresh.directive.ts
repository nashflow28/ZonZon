import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  Renderer2,
  inject,
  output,
} from '@angular/core';

const THRESHOLD = 64; // px de tirage avant déclenchement
const MAX_PULL = 96; // px max affiché (résistance au-delà)
const DRAG_RATIO = 0.5; // "résistance" du tirage (façon iOS, pas 1:1 avec le doigt)
const AUTO_HIDE_MS = 700; // masque l'indicateur peu après déclenchement (pull "léger")

/**
 * Pull-to-refresh léger façon iOS pour les listes principales (Commandes
 * client, Mes courses livreur, Livraisons commerçant). À poser sur le
 * conteneur scrollable de la liste (ex. `<div class="orders zz-scroll"
 * zzPullToRefresh (zzRefresh)="load()">`).
 *
 * Implémentation volontairement simple : un indicateur est inséré en tout
 * premier enfant du conteneur (flux normal, pas de position absolue) dont la
 * hauteur suit le tirage tactile — évite tout souci de clipping avec
 * `overflow-y: auto` sur le conteneur. Ne déclenche que si le conteneur est
 * déjà tout en haut (`scrollTop === 0`), pour ne jamais interférer avec le
 * scroll normal du reste de la liste.
 */
@Directive({
  selector: '[zzPullToRefresh]',
  standalone: true,
})
export class PullToRefreshDirective implements AfterViewInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);

  readonly zzRefresh = output<void>();

  private indicator!: HTMLElement;
  private startY = 0;
  private pulling = false;
  private currentPull = 0;
  private touchMoveHandler = (e: TouchEvent) => this.onTouchMove(e);

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    this.indicator = this.renderer.createElement('div');
    this.renderer.setStyle(this.indicator, 'height', '0px');
    this.renderer.setStyle(this.indicator, 'overflow', 'hidden');
    this.renderer.setStyle(this.indicator, 'display', 'flex');
    this.renderer.setStyle(this.indicator, 'align-items', 'center');
    this.renderer.setStyle(this.indicator, 'justify-content', 'center');
    this.renderer.setStyle(this.indicator, 'color', 'var(--zz-text-mut)');
    this.renderer.setStyle(this.indicator, 'font-size', '12px');
    this.renderer.setStyle(this.indicator, 'font-weight', '600');
    this.renderer.setStyle(this.indicator, 'transition', 'height 0.15s ease');
    this.renderer.setProperty(this.indicator, 'textContent', '↓ Tirer pour actualiser');
    host.insertBefore(this.indicator, host.firstChild);

    // touchmove doit pouvoir preventDefault() (bloquer le rebond natif du
    // scroll) — Angular attache les listeners tactiles en `passive: true`
    // par défaut, on utilise donc l'API native directement.
    host.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('touchmove', this.touchMoveHandler);
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (this.el.nativeElement.scrollTop > 0) {
      this.pulling = false;
      return;
    }
    this.startY = event.touches[0].clientY;
    this.pulling = true;
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this.pulling) return;
    const deltaY = event.touches[0].clientY - this.startY;
    if (deltaY <= 0 || this.el.nativeElement.scrollTop > 0) {
      this.currentPull = 0;
      this.renderer.setStyle(this.indicator, 'height', '0px');
      return;
    }
    event.preventDefault();
    this.currentPull = Math.min(deltaY * DRAG_RATIO, MAX_PULL);
    this.renderer.setStyle(this.indicator, 'height', `${this.currentPull}px`);
    this.renderer.setProperty(
      this.indicator,
      'textContent',
      this.currentPull >= THRESHOLD ? '↑ Relâcher pour actualiser' : '↓ Tirer pour actualiser'
    );
  }

  @HostListener('touchend')
  @HostListener('touchcancel')
  onTouchEnd(): void {
    if (!this.pulling) return;
    this.pulling = false;
    const shouldRefresh = this.currentPull >= THRESHOLD;
    if (shouldRefresh) {
      this.renderer.setProperty(this.indicator, 'textContent', 'Actualisation…');
      this.zzRefresh.emit();
      setTimeout(() => this.renderer.setStyle(this.indicator, 'height', '0px'), AUTO_HIDE_MS);
    } else {
      this.renderer.setStyle(this.indicator, 'height', '0px');
    }
    this.currentPull = 0;
  }
}
