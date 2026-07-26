import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, map, of, switchMap } from 'rxjs';
import { OrderMapComponent, MapLatLng } from '../../shared/components/map/map.component';
import { AvailableDriver, EstimateResult } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { DriverPickerComponent } from '../driver-picker/driver-picker.component';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input.component';

type PointMode = 'pickup' | 'delivery';

/** Format international simple, aligné sur le backend (`^\+?[0-9]{8,15}$`). */
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

/**
 * Création d'une livraison Type 1 (commerçant → client) : client par
 * téléphone, points retrait/livraison (carte tappable), description,
 * estimation avec prix manuel optionnel, choix du livreur (ou plateforme).
 */
@Component({
  selector: 'app-merchant-create',
  imports: [FormsModule, OrderMapComponent, DriverPickerComponent, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class MerchantCreateComponent implements OnInit, OnDestroy {
  private ordersService = inject(OrdersService);
  private router = inject(Router);

  readonly mode = signal<PointMode>('pickup');

  pickupAddress = '';
  pickup = signal<MapLatLng | null>(null);

  deliveryAddress = '';
  delivery = signal<MapLatLng | null>(null);

  description = '';

  clientPhone = '';
  clientName = '';

  readonly manualPriceEnabled = signal(false);
  manualPrice: number | null = null;
  priceReason = '';

  readonly estimate = signal<EstimateResult | null>(null);
  readonly estimating = signal(false);

  readonly drivers = signal<AvailableDriver[]>([]);
  readonly driversLoading = signal(false);
  readonly selectedDriverId = signal<string | null>(null);
  readonly batchMode = signal(false);
  readonly activeRunId = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly estimateTrigger$ = new Subject<void>();

  readonly phoneValid = computed(() => PHONE_PATTERN.test(this.clientPhone.trim()));

  readonly effectivePrice = computed(() =>
    this.manualPriceEnabled() ? this.manualPrice : (this.estimate()?.priceFcfa ?? null),
  );

  ngOnInit(): void {
    this.estimateTrigger$.pipe(debounceTime(500)).subscribe(() => {
      this.fetchEstimate();
      this.fetchDrivers();
    });
    // Liste initiale (sans coordonnées) pour ne pas laisser l'écran vide.
    this.fetchDrivers();
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
    } else if (this.pickup()) {
      // Retrait seul déjà connu : rafraîchit la distance des livreurs.
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

  private fetchDrivers(): void {
    const pickup = this.pickup();
    this.driversLoading.set(true);
    this.ordersService.findAvailableDrivers(pickup?.lat, pickup?.lng).subscribe({
      next: (drivers) => {
        this.driversLoading.set(false);
        this.drivers.set(drivers);
        // Le livreur sélectionné n'est peut-être plus dans la liste (indisponible entre-temps).
        if (this.selectedDriverId() && !drivers.some((d) => d.id === this.selectedDriverId())) {
          this.selectedDriverId.set(null);
          this.activeRunId.set(null);
          this.batchMode.set(false);
        }
      },
      error: () => this.driversLoading.set(false),
    });
  }

  selectDriver(driverId: string | null): void {
    if (driverId !== this.selectedDriverId()) {
      this.activeRunId.set(null);
    }
    this.selectedDriverId.set(driverId);
    if (driverId == null) this.batchMode.set(false);
  }

  toggleBatchMode(): void {
    if (!this.selectedDriverId()) return;
    this.batchMode.update((enabled) => !enabled);
    if (!this.batchMode()) this.activeRunId.set(null);
  }

  toggleManualPrice(): void {
    this.manualPriceEnabled.update((v) => !v);
    if (this.manualPriceEnabled() && this.manualPrice == null) {
      this.manualPrice = this.estimate()?.priceFcfa ?? 0;
    }
  }

  get canSubmit(): boolean {
    return (
      !!this.pickup() &&
      !!this.delivery() &&
      this.pickupAddress.trim().length > 0 &&
      this.deliveryAddress.trim().length > 0 &&
      this.description.trim().length > 0 &&
      this.phoneValid() &&
      (!this.manualPriceEnabled() || (this.manualPrice != null && this.manualPrice >= 0)) &&
      (!this.batchMode() || !!this.selectedDriverId()) &&
      !this.submitting()
    );
  }

  submit(): void {
    const pickup = this.pickup();
    const delivery = this.delivery();
    if (!pickup || !delivery || !this.canSubmit) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const selectedDriverId = this.selectedDriverId();
    const runId$ =
      this.batchMode() && selectedDriverId
        ? this.activeRunId()
          ? of(this.activeRunId()!)
          : this.ordersService.createRun(selectedDriverId).pipe(
              map((run) => {
                this.activeRunId.set(run.id);
                return run.id;
              }),
            )
        : of<string | undefined>(undefined);

    runId$
      .pipe(
        switchMap((runId) =>
          this.ordersService.createMerchant({
            pickupAddress: this.pickupAddress.trim(),
            pickupLat: pickup.lat,
            pickupLng: pickup.lng,
            deliveryAddress: this.deliveryAddress.trim(),
            deliveryLat: delivery.lat,
            deliveryLng: delivery.lng,
            description: this.description.trim(),
            clientPhone: this.clientPhone.trim(),
            clientName: this.clientName.trim() || undefined,
            priceFcfa: this.manualPriceEnabled() ? (this.manualPrice ?? undefined) : undefined,
            priceReason:
              this.manualPriceEnabled() && this.priceReason.trim()
                ? this.priceReason.trim()
                : undefined,
            preferredLivreurId: this.selectedDriverId() ?? undefined,
            runId,
          }),
        ),
      )
      .subscribe({
        next: (order) => {
          this.submitting.set(false);
          if (this.batchMode()) {
            this.successMessage.set('Colis ajouté à la tournée. Vous pouvez saisir le suivant.');
            this.resetPackageForm();
            return;
          }
          this.resetForm();
          this.router.navigate(['/merchant/deliveries', order.id]);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(this.extractMessage(err));
        },
      });
  }

  finishRun(): void {
    this.resetForm();
    this.router.navigate(['/merchant/deliveries']);
  }

  private resetPackageForm(): void {
    this.deliveryAddress = '';
    this.description = '';
    this.clientPhone = '';
    this.clientName = '';
    this.manualPrice = null;
    this.priceReason = '';
    this.manualPriceEnabled.set(false);
    this.delivery.set(null);
    this.estimate.set(null);
    this.mode.set('delivery');
  }

  private resetForm(): void {
    this.pickupAddress = '';
    this.deliveryAddress = '';
    this.description = '';
    this.clientPhone = '';
    this.clientName = '';
    this.manualPrice = null;
    this.priceReason = '';
    this.manualPriceEnabled.set(false);
    this.pickup.set(null);
    this.delivery.set(null);
    this.estimate.set(null);
    this.selectedDriverId.set(null);
    this.batchMode.set(false);
    this.activeRunId.set(null);
    this.successMessage.set(null);
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
