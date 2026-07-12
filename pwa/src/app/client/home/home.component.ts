import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { OrderMapComponent, MapLatLng } from '../../shared/components/map/map.component';
import { EstimateResult } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { ClientOrderDraftService } from '../client-order-draft.service';

type PointMode = 'pickup' | 'delivery';

/**
 * Accueil client : création de course directe (Type 2, CDC).
 * Carte tappable pour poser les points de retrait/livraison, champs
 * d'adresse texte, estimation en debounce, puis création + redirection vers
 * le suivi.
 */
@Component({
  selector: 'app-client-home',
  imports: [FormsModule, OrderMapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class ClientHomeComponent implements OnInit, OnDestroy {
  private ordersService = inject(OrdersService);
  private draftService = inject(ClientOrderDraftService);
  private router = inject(Router);

  readonly mode = signal<PointMode>('pickup');

  pickupAddress = '';
  pickup = signal<MapLatLng | null>(null);

  deliveryAddress = '';
  delivery = signal<MapLatLng | null>(null);

  description = '';

  readonly estimate = signal<EstimateResult | null>(null);
  readonly estimating = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly estimateTrigger$ = new Subject<void>();

  ngOnInit(): void {
    const pending = this.draftService.consumePendingPickup();
    if (pending) {
      this.pickupAddress = pending.address;
      this.pickup.set({ lat: pending.lat, lng: pending.lng });
      this.mode.set('delivery');
      this.requestEstimate();
    }

    this.estimateTrigger$.pipe(debounceTime(500)).subscribe(() => this.fetchEstimate());
  }

  ngOnDestroy(): void {
    this.estimateTrigger$.complete();
  }

  selectMode(mode: PointMode): void {
    this.mode.set(mode);
  }

  onMapTap(point: MapLatLng): void {
    if (this.mode() === 'pickup') {
      this.pickup.set(point);
    } else {
      this.delivery.set(point);
    }
    this.requestEstimate();
  }

  private requestEstimate(): void {
    this.estimate.set(null);
    if (this.pickup() && this.delivery()) {
      this.estimateTrigger$.next();
    }
  }

  private fetchEstimate(): void {
    const pickup = this.pickup();
    const delivery = this.delivery();
    if (!pickup || !delivery) return;

    this.estimating.set(true);
    this.ordersService
      .estimate({
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        deliveryLat: delivery.lat,
        deliveryLng: delivery.lng,
      })
      .subscribe({
        next: (res) => {
          this.estimate.set(res);
          this.estimating.set(false);
        },
        error: () => this.estimating.set(false),
      });
  }

  get canSubmit(): boolean {
    return (
      !!this.pickup() &&
      !!this.delivery() &&
      this.pickupAddress.trim().length > 0 &&
      this.deliveryAddress.trim().length > 0 &&
      this.description.trim().length > 0 &&
      !this.submitting()
    );
  }

  submit(): void {
    const pickup = this.pickup();
    const delivery = this.delivery();
    if (!pickup || !delivery || !this.canSubmit) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.ordersService
      .create({
        pickupAddress: this.pickupAddress.trim(),
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        deliveryAddress: this.deliveryAddress.trim(),
        deliveryLat: delivery.lat,
        deliveryLng: delivery.lng,
        description: this.description.trim(),
      })
      .subscribe({
        next: (order) => {
          this.submitting.set(false);
          this.resetForm();
          this.router.navigate(['/client/orders', order.id]);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(this.extractMessage(err));
        },
      });
  }

  private resetForm(): void {
    this.pickupAddress = '';
    this.deliveryAddress = '';
    this.description = '';
    this.pickup.set(null);
    this.delivery.set(null);
    this.estimate.set(null);
    this.mode.set('pickup');
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    if (err.status === 0) return 'Connexion impossible. Vérifiez votre réseau.';
    return 'Une erreur est survenue. Réessayez.';
  }
}
