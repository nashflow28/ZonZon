import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { DriversService, PendingDriver } from '../drivers.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { SkeletonRowComponent } from '../../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../../shared/page-actions.service';
import { environment } from '../../../environments/environment';

const VEHICLE_LABELS: Record<string, string> = {
  MOTO: 'Moto',
  CAR: 'Voiture',
  BIKE: 'Vélo',
  TRICYCLE: 'Tricycle',
  VAN: 'Camionnette',
};

@Component({
  selector: 'app-driver-validation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    EmptyStateComponent,
    SkeletonRowComponent,
  ],
  templateUrl: './driver-validation.component.html',
  styleUrl: './driver-validation.component.css',
})
export class DriverValidationComponent implements OnInit, OnDestroy {
  private driversService = inject(DriversService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;
  private readonly objectUrls = new Map<string, string>();

  readonly drivers = signal<PendingDriver[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);
  readonly idCardPhotoUrls = signal<Record<string, string>>({});
  readonly loadingIdCardIds = signal<Set<string>>(new Set());
  readonly missingIdCardIds = signal<Set<string>>(new Set());

  /// Driver dont le panneau "motif de refus" est ouvert (null = aucun).
  readonly rejectingId = signal<string | null>(null);
  readonly rejectionReason = signal<string>('');

  /// Ids en cours de traitement (pour désactiver les boutons pendant l'appel réseau).
  readonly pendingActionIds = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.pageActions.setPage('Validation livreurs', 'Approuver ou refuser les livreurs en attente');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.clearIdCardPhotos();
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.driversService.getPendingDrivers().subscribe({
      next: (data) => {
        this.clearIdCardPhotos();
        this.idCardPhotoUrls.set({});
        this.loadingIdCardIds.set(new Set());
        this.missingIdCardIds.set(new Set());
        this.drivers.set(data ?? []);
        this.preloadIdCardPhotos(data ?? []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement livreurs en attente', err);
        this.errored.set(true);
        this.isLoading.set(false);
      },
    });
  }

  isBusy(id: string): boolean {
    return this.pendingActionIds().has(id);
  }

  private setBusy(id: string, busy: boolean): void {
    this.pendingActionIds.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private removeLocal(id: string): void {
    this.forgetIdCardPhoto(id);
    this.drivers.set(this.drivers().filter((d) => d.id !== id));
  }

  approve(driver: PendingDriver): void {
    if (this.isBusy(driver.id)) return;
    if (!confirm(`Approuver ${this.fullName(driver)} comme livreur ?`)) return;
    this.setBusy(driver.id, true);
    this.driversService.approveDriver(driver.id).subscribe({
      next: () => {
        this.setBusy(driver.id, false);
        this.removeLocal(driver.id);
      },
      error: (err) => {
        console.error('Erreur approbation livreur', err);
        this.setBusy(driver.id, false);
        alert("Impossible d'approuver ce livreur. Réessayez.");
      },
    });
  }

  openReject(driver: PendingDriver): void {
    this.rejectingId.set(driver.id);
    this.rejectionReason.set('');
  }

  closeReject(): void {
    this.rejectingId.set(null);
    this.rejectionReason.set('');
  }

  confirmReject(driver: PendingDriver): void {
    if (this.isBusy(driver.id)) return;
    const reason = this.rejectionReason().trim();
    this.setBusy(driver.id, true);
    this.driversService.rejectDriver(driver.id, reason || undefined).subscribe({
      next: () => {
        this.setBusy(driver.id, false);
        this.closeReject();
        this.removeLocal(driver.id);
      },
      error: (err) => {
        console.error('Erreur refus livreur', err);
        this.setBusy(driver.id, false);
        alert('Impossible de refuser ce livreur. Réessayez.');
      },
    });
  }

  fullName(driver: PendingDriver): string {
    return `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || 'Sans nom';
  }

  vehicleLabel(driver: PendingDriver): string {
    if (!driver.vehicle?.type) return 'Véhicule non renseigné';
    return VEHICLE_LABELS[driver.vehicle.type] ?? driver.vehicle.type;
  }

  photoSrc(driver: PendingDriver): string | null {
    if (!driver.profilePhotoUrl) return null;
    return this.mediaUrl(driver.profilePhotoUrl);
  }

  idCardPhotoSrc(driverId: string): string | null {
    return this.idCardPhotoUrls()[driverId] ?? null;
  }

  isIdCardLoading(driverId: string): boolean {
    return this.loadingIdCardIds().has(driverId);
  }

  isIdCardMissing(driverId: string): boolean {
    return this.missingIdCardIds().has(driverId);
  }

  private mediaUrl(path: string): string {
    return /^https?:\/\//i.test(path) ? path : `${environment.apiUrl}${path}`;
  }

  usualZoneLabel(driver: PendingDriver): string | null {
    return driver.vehicle?.usualZone?.name ?? null;
  }

  initials(driver: PendingDriver): string {
    return `${(driver.firstName?.[0] ?? '').toUpperCase()}${(driver.lastName?.[0] ?? '').toUpperCase()}`;
  }

  private preloadIdCardPhotos(drivers: PendingDriver[]): void {
    for (const driver of drivers) {
      void this.loadIdCardPhoto(driver.id);
    }
  }

  private async loadIdCardPhoto(driverId: string): Promise<void> {
    if (this.idCardPhotoUrls()[driverId] || this.isIdCardLoading(driverId)) {
      return;
    }

    this.loadingIdCardIds.update((set) => {
      const next = new Set(set);
      next.add(driverId);
      return next;
    });

    try {
      const blob = await firstValueFrom(this.driversService.getDriverIdCardPhoto(driverId));
      if (!blob || blob.size === 0) {
        this.missingIdCardIds.update((set) => {
          const next = new Set(set);
          next.add(driverId);
          return next;
        });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const previous = this.objectUrls.get(driverId);
      if (previous) URL.revokeObjectURL(previous);
      this.objectUrls.set(driverId, objectUrl);
      this.idCardPhotoUrls.update((map) => ({
        ...map,
        [driverId]: objectUrl,
      }));
      this.missingIdCardIds.update((set) => {
        const next = new Set(set);
        next.delete(driverId);
        return next;
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status !== 404) {
        console.error("Erreur chargement pièce d'identité", err);
      }
      this.missingIdCardIds.update((set) => {
        const next = new Set(set);
        next.add(driverId);
        return next;
      });
    } finally {
      this.loadingIdCardIds.update((set) => {
        const next = new Set(set);
        next.delete(driverId);
        return next;
      });
    }
  }

  private forgetIdCardPhoto(driverId: string): void {
    const previous = this.objectUrls.get(driverId);
    if (previous) {
      URL.revokeObjectURL(previous);
      this.objectUrls.delete(driverId);
    }
    this.idCardPhotoUrls.update((map) => {
      const next = { ...map };
      delete next[driverId];
      return next;
    });
    this.loadingIdCardIds.update((set) => {
      const next = new Set(set);
      next.delete(driverId);
      return next;
    });
    this.missingIdCardIds.update((set) => {
      const next = new Set(set);
      next.delete(driverId);
      return next;
    });
  }

  private clearIdCardPhotos(): void {
    for (const url of this.objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
  }
}
