import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { User } from '../../auth/models/user.model';
import { PushSettingsRowComponent } from '../../shared/components/push-settings-row/push-settings-row.component';
import { mediaUrl } from '../../shared/media-url';
import { Zone } from '../../shared/models/order.model';
import { NotificationsService } from '../../shared/services/notifications.service';
import { OrdersService } from '../../shared/services/orders.service';
import { ZonesService } from '../../shared/services/zones.service';
import { Affiliation, UpsertVehiclePayload, VehicleType } from '../driver.model';
import { DriverService } from '../driver.service';
import { ChangePasswordComponent } from '../../shared/components/change-password/change-password.component';
import { formatPhone } from '../../shared/phone-input/phone-display';

/**
 * Profil livreur : infos + statut de validation, dispo/visibilité, véhicule +
 * zone habituelle, photo de profil + pièce d'identité, invitations
 * d'affiliation commerçant, notifications, déconnexion.
 */
@Component({
  selector: 'app-driver-profile',
  imports: [FormsModule, PushSettingsRowComponent, ChangePasswordComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class DriverProfileComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private driverService = inject(DriverService);
  private notificationsService = inject(NotificationsService);
  private ordersService = inject(OrdersService);
  private zonesService = inject(ZonesService);
  private router = inject(Router);

  readonly user = this.authService.currentUser;
  readonly unreadCount = this.notificationsService.unreadCount;

  readonly approvalStatus = computed(() => this.user()?.driverApprovalStatus ?? 'PENDING');
  readonly isApproved = computed(() => this.approvalStatus() === 'APPROVED');
  readonly approvalMessage = computed(() => {
    if (this.approvalStatus() === 'REJECTED') {
      const reason = this.user()?.driverRejectionReason;
      return reason ? `Compte refusé — Motif : ${reason}` : 'Compte refusé par un administrateur.';
    }
    if (this.approvalStatus() === 'APPROVED') return 'Compte validé.';
    return 'En attente de validation par un administrateur.';
  });

  readonly totalEarnings = computed(() =>
    this.ordersService
      .pastOrders()
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + (o.priceFcfa ?? 0), 0)
  );

  // ---- Infos / édition ----
  readonly editing = signal(false);
  firstName = '';
  lastName = '';
  readonly saving = signal(false);
  readonly uploadingPhoto = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showLogoutConfirm = signal(false);

  // ---- Disponibilité / visibilité ----
  readonly isAvailable = signal(false);
  readonly isPublic = signal(true);
  readonly togglingAvailability = signal(false);
  readonly togglingVisibility = signal(false);

  // ---- Véhicule ----
  readonly vehicleLoading = signal(true);
  readonly vehicleSaving = signal(false);
  readonly vehicleSaved = signal(false);
  readonly vehicleError = signal<string | null>(null);
  vehicleType: VehicleType = 'MOTO';
  licensePlate = '';
  vehicleDescription = '';
  usualZoneId: string | null = null;
  readonly zones = signal<Zone[]>([]);

  // ---- Pièce d'identité ----
  readonly uploadingIdCard = signal(false);
  readonly idCardError = signal<string | null>(null);
  readonly idCardPreviewUrl = signal<string | null>(null);
  readonly loadingIdCardPreview = signal(false);
  private idCardObjectUrl: string | null = null;

  // ---- Affiliations ----
  readonly affiliations = signal<Affiliation[]>([]);
  readonly affiliationsLoading = signal(true);
  readonly affiliationsError = signal<string | null>(null);
  readonly respondingMerchantId = signal<string | null>(null);

  ngOnInit(): void {
    this.authService.fetchMe().subscribe({
      next: () => this.syncForm(),
      error: () => {
        /* on garde les données locales si l'appel échoue (offline) */
      },
    });
    this.syncForm();

    this.notificationsService.list(1, 20).subscribe({
      error: () => {
        /* badge non-lu non bloquant */
      },
    });
    this.ordersService.refresh().subscribe({
      error: () => {
        /* gains estimés non bloquants */
      },
    });

    this.loadVehicle();
    this.loadZones();
    this.loadAffiliations();
    this.loadIdCardPreview();
  }

  ngOnDestroy(): void {
    if (this.idCardObjectUrl) URL.revokeObjectURL(this.idCardObjectUrl);
  }

  private syncForm(): void {
    const u = this.user();
    this.firstName = u?.firstName ?? '';
    this.lastName = u?.lastName ?? '';
    this.isAvailable.set(!!u?.isAvailable);
    this.isPublic.set(u?.isPublic !== false);
  }

  photoSrc(): string | null {
    return mediaUrl(this.user()?.profilePhotoUrl);
  }

  displayName(u: User | null): string {
    if (!u) return '';
    return `${u.firstName} ${u.lastName}`.trim();
  }

  displayPhone(phone: string | null | undefined): string {
    return formatPhone(phone);
  }

  // ---- Édition infos ----
  startEditing(): void {
    this.syncForm();
    this.editing.set(true);
    this.errorMessage.set(null);
  }

  cancelEditing(): void {
    this.editing.set(false);
    this.syncForm();
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.authService
      .updateMe({ firstName: this.firstName.trim(), lastName: this.lastName.trim() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.errorMessage.set(this.extractMessage(err));
        },
      });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingPhoto.set(true);
    this.errorMessage.set(null);
    this.authService.uploadPhoto(file).subscribe({
      next: () => {
        this.uploadingPhoto.set(false);
        input.value = '';
      },
      error: (err: HttpErrorResponse) => {
        this.uploadingPhoto.set(false);
        this.errorMessage.set(this.extractMessage(err));
        input.value = '';
      },
    });
  }

  // ---- Disponibilité / visibilité ----
  toggleAvailability(): void {
    if (this.togglingAvailability() || !this.isApproved()) return;
    const next = !this.isAvailable();
    this.togglingAvailability.set(true);
    this.errorMessage.set(null);
    this.driverService.setAvailability(next).subscribe({
      next: (res) => {
        this.togglingAvailability.set(false);
        this.isAvailable.set(res.isAvailable);
        this.authService.patchCurrentUser({ isAvailable: res.isAvailable });
      },
      error: (err: HttpErrorResponse) => {
        this.togglingAvailability.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  toggleVisibility(): void {
    if (this.togglingVisibility()) return;
    const next = !this.isPublic();
    this.togglingVisibility.set(true);
    this.errorMessage.set(null);
    this.driverService.setVisibility(next).subscribe({
      next: (res) => {
        this.togglingVisibility.set(false);
        this.isPublic.set(res.isPublic);
        this.authService.patchCurrentUser({ isPublic: res.isPublic });
      },
      error: (err: HttpErrorResponse) => {
        this.togglingVisibility.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  // ---- Véhicule ----
  private loadVehicle(): void {
    this.vehicleLoading.set(true);
    this.driverService.getVehicle().subscribe({
      next: (vehicle) => {
        this.vehicleLoading.set(false);
        if (vehicle) {
          this.vehicleType = vehicle.type;
          this.licensePlate = vehicle.licensePlate ?? '';
          this.vehicleDescription = vehicle.description ?? '';
          this.usualZoneId = vehicle.usualZone?.id ?? null;
        }
      },
      error: () => {
        this.vehicleLoading.set(false);
      },
    });
  }

  private loadZones(): void {
    this.zonesService.findActive().subscribe({
      next: (zones) => this.zones.set(zones),
      error: () => {
        /* liste des zones non bloquante */
      },
    });
  }

  saveVehicle(): void {
    if (this.vehicleSaving()) return;
    this.vehicleSaving.set(true);
    this.vehicleSaved.set(false);
    this.vehicleError.set(null);
    const payload: UpsertVehiclePayload = {
      type: this.vehicleType,
      licensePlate: this.licensePlate.trim() || undefined,
      description: this.vehicleDescription.trim() || undefined,
      usualZoneId: this.usualZoneId,
    };
    this.driverService.upsertVehicle(payload).subscribe({
      next: () => {
        this.vehicleSaving.set(false);
        this.vehicleSaved.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.vehicleSaving.set(false);
        this.vehicleError.set(this.extractMessage(err));
      },
    });
  }

  // ---- Pièce d'identité ----
  private loadIdCardPreview(): void {
    const userId = this.user()?.id;
    if (!userId) return;
    this.loadingIdCardPreview.set(true);
    this.driverService.getIdCardPhotoBlob(userId).subscribe({
      next: (blob) => {
        this.loadingIdCardPreview.set(false);
        if (!blob || blob.size === 0) return;
        if (this.idCardObjectUrl) URL.revokeObjectURL(this.idCardObjectUrl);
        this.idCardObjectUrl = URL.createObjectURL(blob);
        this.idCardPreviewUrl.set(this.idCardObjectUrl);
      },
      error: () => {
        // Pas encore de pièce d'identité téléversée — non bloquant.
        this.loadingIdCardPreview.set(false);
      },
    });
  }

  onIdCardSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingIdCard.set(true);
    this.idCardError.set(null);
    this.driverService.uploadIdCardPhoto(file).subscribe({
      next: () => {
        this.uploadingIdCard.set(false);
        input.value = '';
        this.loadIdCardPreview();
      },
      error: (err: HttpErrorResponse) => {
        this.uploadingIdCard.set(false);
        this.idCardError.set(this.extractMessage(err));
        input.value = '';
      },
    });
  }

  // ---- Affiliations ----
  private loadAffiliations(): void {
    this.affiliationsLoading.set(true);
    this.affiliationsError.set(null);
    this.driverService.listAffiliations().subscribe({
      next: (list) => {
        this.affiliationsLoading.set(false);
        this.affiliations.set(list);
      },
      error: (err: HttpErrorResponse) => {
        this.affiliationsLoading.set(false);
        this.affiliationsError.set(this.extractMessage(err));
      },
    });
  }

  respondAffiliation(affiliation: Affiliation, action: 'accept' | 'reject'): void {
    if (this.respondingMerchantId()) return;
    this.respondingMerchantId.set(affiliation.merchantId);
    this.affiliationsError.set(null);
    this.driverService.respondAffiliation(affiliation.merchantId, action).subscribe({
      next: (updated) => {
        this.respondingMerchantId.set(null);
        this.affiliations.update((list) =>
          list.map((a) => (a.merchantId === updated.merchantId ? { ...a, ...updated } : a))
        );
      },
      error: (err: HttpErrorResponse) => {
        this.respondingMerchantId.set(null);
        this.affiliationsError.set(this.extractMessage(err));
      },
    });
  }

  affiliationStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'ACTIVE':
        return 'Actif';
      case 'REJECTED':
        return 'Refusé';
      case 'REMOVED':
        return 'Retiré';
      default:
        return status;
    }
  }

  merchantName(affiliation: Affiliation): string {
    if (!affiliation.merchant) return 'Commerçant';
    return `${affiliation.merchant.firstName} ${affiliation.merchant.lastName}`.trim();
  }

  // ---- Notifications / déconnexion ----
  openNotifications(): void {
    this.router.navigate(['/driver/notifications']);
  }

  requestLogout(): void {
    this.showLogoutConfirm.set(true);
  }

  cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }

  confirmLogout(): void {
    this.authService.logout();
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    return 'Une erreur est survenue. Réessayez.';
  }
}
