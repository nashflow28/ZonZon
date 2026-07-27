import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input.component';

type Step = 'phone' | 'code' | 'success';

/**
 * Reset de mot de passe self-service pour les comptes ADMIN, via WhatsApp
 * OTP (`POST /auth/forgot-password/*`).
 *
 * ⚠️ Inactif tant que `WHATSAPP_OTP_ENABLED` n'est pas configuré côté
 * backend (cf. PROGRESS.md, session 88) : l'étape 1 renvoie alors un 503
 * explicite, affiché tel quel — ce composant n'invente pas un faux succès.
 * En attendant, un admin bloqué peut être dépanné par un autre admin via
 * l'écran Utilisateurs (reset direct, sans OTP).
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PhoneInputComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../login/login.component.css'
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly step = signal<Step>('phone');
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);

  private phoneValue = '';

  phoneForm = this.fb.nonNullable.group({
    phone: ['', [Validators.required]]
  });

  resetForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  });

  submitPhone(): void {
    if (this.phoneForm.invalid || this.isLoading()) {
      this.phoneForm.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { phone } = this.phoneForm.getRawValue();
    this.phoneValue = phone;

    this.authService.requestPasswordReset(phone).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.infoMessage.set(
          "Si ce numéro est associé à un compte administrateur, un code de vérification vient d'être envoyé par WhatsApp."
        );
        this.step.set('code');
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err?.status === 503) {
          // Cas honnête et attendu tant que WhatsApp n'est pas configuré :
          // on ne prétend pas qu'un code a été envoyé.
          this.errorMessage.set(
            "La validation WhatsApp n'est pas encore activée sur cette plateforme. " +
            "Demandez à un autre administrateur de réinitialiser votre mot de passe " +
            "depuis l'écran Utilisateurs."
          );
          return;
        }
        this.errorMessage.set(
          "Impossible d'envoyer le code pour le moment. Réessayez plus tard."
        );
      }
    });
  }

  submitReset(): void {
    if (this.resetForm.invalid || this.isLoading()) {
      this.resetForm.markAllAsTouched();
      return;
    }
    const { code, newPassword, confirmPassword } = this.resetForm.getRawValue();
    if (newPassword !== confirmPassword) {
      this.errorMessage.set('Les deux mots de passe ne correspondent pas.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.resetPassword(this.phoneValue, code, newPassword).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.step.set('success');
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err?.error?.message;
        this.errorMessage.set(
          typeof msg === 'string' ? msg : 'Code invalide ou expiré.'
        );
      }
    });
  }

  backToPhone(): void {
    this.step.set('phone');
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    this.resetForm.reset();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
