import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
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
  VAN: 'Camionnette'
};

@Component({
  selector: 'app-driver-validation',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, EmptyStateComponent, SkeletonRowComponent],
  templateUrl: './driver-validation.component.html',
  styleUrl: './driver-validation.component.css'
})
export class DriverValidationComponent implements OnInit, OnDestroy {
  private driversService = inject(DriversService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly drivers = signal<PendingDriver[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

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
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.driversService.getPendingDrivers().subscribe({
      next: (data) => {
        this.drivers.set(data ?? []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement livreurs en attente', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
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
      }
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
        alert("Impossible de refuser ce livreur. Réessayez.");
      }
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
    return driver.profilePhotoUrl.startsWith('http')
      ? driver.profilePhotoUrl
      : `${environment.apiUrl}${driver.profilePhotoUrl}`;
  }

  idCardPhotoSrc(driver: PendingDriver): string | null {
    if (!driver.idCardPhotoUrl) return null;
    return driver.idCardPhotoUrl.startsWith('http')
      ? driver.idCardPhotoUrl
      : `${environment.apiUrl}${driver.idCardPhotoUrl}`;
  }

  usualZoneLabel(driver: PendingDriver): string | null {
    return driver.vehicle?.usualZone?.name ?? null;
  }

  initials(driver: PendingDriver): string {
    return `${(driver.firstName?.[0] ?? '').toUpperCase()}${(driver.lastName?.[0] ?? '').toUpperCase()}`;
  }
}
