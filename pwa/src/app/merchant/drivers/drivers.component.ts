import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MerchantDriver, MerchantDriverStatus } from '../merchant.model';
import { MerchantService } from '../merchant.service';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input.component';

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

/**
 * Livreurs affiliés au commerçant : invitation par téléphone (statut réel
 * PENDING/ACTIVE/REJECTED/REMOVED — jamais "affilié avec succès" avant
 * acceptation par le livreur) et retrait (soft, conservé pour historique).
 */
@Component({
  selector: 'app-merchant-drivers',
  imports: [FormsModule, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drivers.component.html',
  styleUrl: './drivers.component.css',
})
export class MerchantDriversComponent implements OnInit {
  private merchantService = inject(MerchantService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly drivers = signal<MerchantDriver[]>([]);

  readonly showInvite = signal(false);
  invitePhone = '';
  readonly inviting = signal(false);
  readonly inviteError = signal<string | null>(null);
  readonly inviteSuccess = signal<string | null>(null);

  readonly removingDriverId = signal<string | null>(null);
  readonly confirmRemoveId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.merchantService.listDrivers().subscribe({
      next: (drivers) => {
        this.loading.set(false);
        this.drivers.set(drivers);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger vos livreurs.');
      },
    });
  }

  openInvite(): void {
    this.showInvite.set(true);
    this.invitePhone = '';
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
  }

  closeInvite(): void {
    this.showInvite.set(false);
  }

  get invitePhoneValid(): boolean {
    return PHONE_PATTERN.test(this.invitePhone.trim());
  }

  sendInvite(): void {
    if (this.inviting() || !this.invitePhoneValid) return;
    this.inviting.set(true);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    this.merchantService.inviteDriver({ driverPhone: this.invitePhone.trim() }).subscribe({
      next: (driver) => {
        this.inviting.set(false);
        // Toujours refléter le statut réel — l'invitation ne devient active
        // qu'après acceptation par le livreur.
        this.inviteSuccess.set(
          driver.status === 'PENDING'
            ? 'Invitation envoyée. En attente de réponse du livreur.'
            : 'Livreur déjà affilié.'
        );
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.inviting.set(false);
        this.inviteError.set(this.extractMessage(err));
      },
    });
  }

  requestRemove(driverId: string): void {
    this.confirmRemoveId.set(driverId);
  }

  cancelRemove(): void {
    this.confirmRemoveId.set(null);
  }

  confirmRemove(driverId: string): void {
    if (this.removingDriverId()) return;
    this.removingDriverId.set(driverId);
    this.merchantService.removeDriver(driverId).subscribe({
      next: () => {
        this.removingDriverId.set(null);
        this.confirmRemoveId.set(null);
        this.load();
      },
      error: () => {
        this.removingDriverId.set(null);
        this.confirmRemoveId.set(null);
        this.errorMessage.set('Impossible de retirer ce livreur.');
      },
    });
  }

  vehicleTypeLabel(type: string | undefined | null): string {
    switch (type) {
      case 'MOTO':
        return 'Moto';
      case 'VOITURE':
        return 'Voiture';
      case 'TRICYCLE':
        return 'Tricycle';
      default:
        return type ?? '';
    }
  }

  statusLabel(status: MerchantDriverStatus): string {
    switch (status) {
      case 'PENDING':
        return 'Invitation en attente';
      case 'ACTIVE':
        return 'Affiliation active';
      case 'REJECTED':
        return 'Refusée';
      case 'REMOVED':
        return 'Retirée';
      default:
        return status;
    }
  }

  statusPillClass(status: MerchantDriverStatus): string {
    switch (status) {
      case 'ACTIVE':
        return 'zz-pill zz-pill--go';
      case 'PENDING':
        return 'zz-pill zz-pill--mango';
      case 'REJECTED':
        return 'zz-pill zz-pill--coral';
      default:
        return 'zz-pill zz-pill--mut';
    }
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    return 'Une erreur est survenue. Réessayez.';
  }
}
