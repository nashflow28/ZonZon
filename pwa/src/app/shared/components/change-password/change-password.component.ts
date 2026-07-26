import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../auth/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.css',
})
export class ChangePasswordComponent {
  private authService = inject(AuthService);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  currentPassword = '';
  newPassword = '';
  confirmation = '';

  open(): void {
    this.editing.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  cancel(): void {
    this.editing.set(false);
    this.reset();
  }

  save(): void {
    if (this.saving()) return;
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (!this.currentPassword || !this.newPassword || !this.confirmation) {
      this.errorMessage.set('Tous les champs sont obligatoires.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.errorMessage.set('Le nouveau mot de passe doit contenir 8 caractères minimum.');
      return;
    }
    if (this.newPassword !== this.confirmation) {
      this.errorMessage.set('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    this.saving.set(true);
    this.authService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set('Mot de passe modifié.');
        this.editing.set(false);
        this.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  private reset(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmation = '';
  }

  private extractMessage(err: HttpErrorResponse): string {
    const message = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return 'Impossible de modifier le mot de passe.';
  }
}
