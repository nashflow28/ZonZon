import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { RegisterPayload, Role, VehicleType } from '../models/user.model';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input.component';

interface RoleOption {
  value: Exclude<Role, 'ADMIN'>;
  label: string;
}

interface VehicleOption {
  value: VehicleType;
  label: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'LIVREUR', label: 'Livreur' },
  { value: 'COMMERCANT', label: 'Commerçant' },
];

const VEHICLE_OPTIONS: VehicleOption[] = [
  { value: 'MOTO', label: 'Moto' },
  { value: 'VOITURE', label: 'Voiture' },
  { value: 'TRICYCLE', label: 'Tricycle' },
];

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.component.html',
  styleUrl: '../auth-form.css',
})
export class RegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly roleOptions = ROLE_OPTIONS;
  readonly vehicleOptions = VEHICLE_OPTIONS;

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedRole = signal<RoleOption['value']>('CLIENT');
  readonly selectedVehicle = signal<VehicleType>('MOTO');

  /**
   * Validation du numéro par OTP WhatsApp. Activée côté serveur uniquement
   * (`WHATSAPP_OTP_ENABLED`) : tant qu'elle est désactivée, le parcours reste
   * strictement identique à avant. Une fois activée, le backend refuse toute
   * inscription sans `verificationToken`.
   */
  readonly otpEnabled = signal(false);
  readonly otpStep = signal<'idle' | 'code-sent' | 'verified'>('idle');
  readonly otpSending = signal(false);
  readonly otpVerifying = signal(false);
  readonly otpCode = signal('');
  private verificationToken: string | null = null;

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    phone: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.authService.isWhatsappOtpEnabled().subscribe((enabled) => {
      this.otpEnabled.set(enabled);
    });
    // Si le numéro change après validation, la preuve ne correspond plus : le
    // backend lie le token au numéro exact et rejetterait l'inscription.
    this.form.controls.phone.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onPhoneChanged());
  }

  chooseRole(role: RoleOption['value']): void {
    this.selectedRole.set(role);
  }

  chooseVehicle(vehicle: VehicleType): void {
    this.selectedVehicle.set(vehicle);
  }

  /** Le numéro validé doit rester celui qui sera envoyé à l'inscription. */
  onPhoneChanged(): void {
    if (this.otpStep() === 'idle') return;
    this.otpStep.set('idle');
    this.verificationToken = null;
    this.otpCode.set('');
  }

  requestOtp(): void {
    const phone = this.form.controls.phone.value;
    if (!phone || this.otpSending()) {
      this.form.controls.phone.markAsTouched();
      return;
    }
    this.otpSending.set(true);
    this.errorMessage.set(null);
    this.authService.requestWhatsappOtp(phone).subscribe({
      next: () => {
        this.otpSending.set(false);
        this.otpStep.set('code-sent');
      },
      error: (err: HttpErrorResponse) => {
        this.otpSending.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  verifyOtp(): void {
    const phone = this.form.controls.phone.value;
    const code = this.otpCode().trim();
    if (!phone || code.length < 4 || this.otpVerifying()) return;
    this.otpVerifying.set(true);
    this.errorMessage.set(null);
    this.authService.verifyWhatsappOtp(phone, code).subscribe({
      next: (token) => {
        this.otpVerifying.set(false);
        this.verificationToken = token;
        this.otpStep.set('verified');
      },
      error: (err: HttpErrorResponse) => {
        this.otpVerifying.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.otpEnabled() && !this.verificationToken) {
      this.errorMessage.set(
        'Validez d’abord votre numéro avec le code reçu sur WhatsApp.',
      );
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { firstName, lastName, phone, password } = this.form.getRawValue();
    const role = this.selectedRole();

    const payload: RegisterPayload = {
      firstName,
      lastName,
      phone,
      password,
      role,
      ...(role === 'LIVREUR' ? { vehicleType: this.selectedVehicle() } : {}),
      ...(this.verificationToken
        ? { verificationToken: this.verificationToken }
        : {}),
    };

    this.authService.register(payload).subscribe({
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
