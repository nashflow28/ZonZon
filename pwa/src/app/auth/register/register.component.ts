import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly roleOptions = ROLE_OPTIONS;
  readonly vehicleOptions = VEHICLE_OPTIONS;

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedRole = signal<RoleOption['value']>('CLIENT');
  readonly selectedVehicle = signal<VehicleType>('MOTO');

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    phone: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  chooseRole(role: RoleOption['value']): void {
    this.selectedRole.set(role);
  }

  chooseVehicle(vehicle: VehicleType): void {
    this.selectedVehicle.set(vehicle);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
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
