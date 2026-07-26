import { CommonModule } from '@angular/common';
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

interface CountryOption {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
}

const COUNTRIES: CountryOption[] = [
  { name: 'Togo', code: 'TG', dialCode: '+228', flag: '🇹🇬' },
  { name: 'Bénin', code: 'BJ', dialCode: '+229', flag: '🇧🇯' },
  { name: 'Ghana', code: 'GH', dialCode: '+233', flag: '🇬🇭' },
  { name: "Côte d'Ivoire", code: 'CI', dialCode: '+225', flag: '🇨🇮' },
  { name: 'Burkina Faso', code: 'BF', dialCode: '+226', flag: '🇧🇫' },
  { name: 'Niger', code: 'NE', dialCode: '+227', flag: '🇳🇪' },
  { name: 'Nigeria', code: 'NG', dialCode: '+234', flag: '🇳🇬' },
  { name: 'Sénégal', code: 'SN', dialCode: '+221', flag: '🇸🇳' },
  { name: 'France', code: 'FR', dialCode: '+33', flag: '🇫🇷' },
];

@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './phone-input.component.html',
  styleUrl: './phone-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneInputComponent),
      multi: true,
    },
  ],
})
export class PhoneInputComponent implements ControlValueAccessor {
  @Input() inputId?: string;
  @Input() placeholder = '90 00 00 00';

  readonly countries = COUNTRIES;
  selectedCountry = COUNTRIES[0];
  localNumber = '';
  disabled = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    const raw = (value ?? '').trim();
    if (!raw) {
      this.selectedCountry = COUNTRIES[0];
      this.localNumber = '';
      return;
    }
    const match = [...COUNTRIES]
      .sort((a, b) => b.dialCode.length - a.dialCode.length)
      .find((country) => raw.startsWith(country.dialCode));
    this.selectedCountry = match ?? COUNTRIES[0];
    this.localNumber = (match ? raw.slice(match.dialCode.length) : raw.replace(/^\+/, ''))
      .replace(/\D/g, '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onCountryChange(dialCode: string): void {
    this.selectedCountry = COUNTRIES.find((country) => country.dialCode === dialCode) ?? COUNTRIES[0];
    this.emit();
  }

  onLocalChange(value: string): void {
    this.localNumber = (value ?? '').replace(/\D/g, '');
    this.emit();
  }

  onBlur(): void {
    this.onTouched();
  }

  private emit(): void {
    this.onChange(this.localNumber ? `${this.selectedCountry.dialCode}${this.localNumber}` : '');
  }
}
