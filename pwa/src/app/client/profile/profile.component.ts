import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { User } from '../../auth/models/user.model';
import { PushSettingsRowComponent } from '../../shared/components/push-settings-row/push-settings-row.component';
import { mediaUrl } from '../../shared/media-url';
import { NotificationsService } from '../../shared/services/notifications.service';
import { ChangePasswordComponent } from '../../shared/components/change-password/change-password.component';
import { formatPhone } from '../../shared/phone-input/phone-display';

/** Profil client : infos, édition, photo, accès notifications, déconnexion. */
@Component({
  selector: 'app-client-profile',
  imports: [FormsModule, PushSettingsRowComponent, ChangePasswordComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ClientProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private notificationsService = inject(NotificationsService);
  private router = inject(Router);

  readonly user = this.authService.currentUser;
  readonly unreadCount = this.notificationsService.unreadCount;

  readonly editing = signal(false);
  firstName = '';
  lastName = '';

  readonly saving = signal(false);
  readonly uploadingPhoto = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showLogoutConfirm = signal(false);

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
  }

  private syncForm(): void {
    const u = this.user();
    this.firstName = u?.firstName ?? '';
    this.lastName = u?.lastName ?? '';
  }

  photoSrc(): string | null {
    return mediaUrl(this.user()?.profilePhotoUrl);
  }

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

  openNotifications(): void {
    this.router.navigate(['/client/notifications']);
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

  displayName(u: User | null): string {
    if (!u) return '';
    return `${u.firstName} ${u.lastName}`.trim();
  }

  displayPhone(phone: string | null | undefined): string {
    return formatPhone(phone);
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    return 'Une erreur est survenue. Réessayez.';
  }
}
