import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: '../auth-form.css',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    phone: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { phone, password } = this.form.getRawValue();

    this.authService.login(phone, password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.authService.homePathForRole(res.user.role));
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    if (err.status === 0) return 'Connexion impossible. Vérifiez votre réseau.';
    return 'Une erreur est survenue. Réessayez.';
  }
}
