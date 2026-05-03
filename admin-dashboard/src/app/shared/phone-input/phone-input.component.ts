import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  computed,
  forwardRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  COUNTRIES,
  Country,
  DEFAULT_COUNTRY,
  findCountryByDialCode,
  splitInternationalNumber,
} from './countries';

/**
 * Composant standalone de saisie de numéro de téléphone international.
 *
 * - Affiche un bouton avec drapeau + indicatif et un input numérique.
 * - Au clic, ouvre un dropdown filtrable (recherche par nom ou code).
 * - Implémente `ControlValueAccessor` → utilisable avec `formControlName`,
 *   `[(ngModel)]` ou `formControl`.
 * - Émet la valeur sous forme internationale concaténée et nettoyée
 *   (`+22890123456`, sans espaces ni séparateurs).
 *
 * Référence design : `mobile_app/lib/widgets/phone_field.dart`.
 */
@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './phone-input.component.html',
  styleUrl: './phone-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      useExisting: forwardRef(() => PhoneInputComponent),
      multi: true,
    },
  ],
})
export class PhoneInputComponent implements ControlValueAccessor {
  /** Indicatif par défaut (Togo +228). */
  @Input() defaultCountryCode = '+228';
  /** Placeholder de l'input local. */
  @Input() placeholder = '90 11 22 33';
  /** ID HTML pour relier un `<label for=…>`. */
  @Input() inputId?: string;
  /** Activer/désactiver complètement le champ. */
  @Input() set disabled(value: boolean) {
    this.isDisabled.set(!!value);
  }

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  readonly countries = COUNTRIES;
  readonly isDisabled = signal(false);
  readonly isOpen = signal(false);
  readonly searchTerm = signal('');
  readonly selectedCountry = signal<Country>(DEFAULT_COUNTRY);
  /** Partie locale du numéro (sans l'indicatif), digits uniquement. */
  readonly localNumber = signal('');

  /** Liste filtrée par le champ de recherche (nom ou code). */
  readonly filteredCountries = computed<Country[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.countries;
    return this.countries.filter((c) => {
      const haystack = `${c.name.toLowerCase()} ${c.dialCode}`;
      return haystack.includes(term);
    });
  });

  /** Soft warning : `true` si la longueur ne respecte pas min/max du pays. */
  readonly hasLengthWarning = computed<boolean>(() => {
    const c = this.selectedCountry();
    const len = this.localNumber().length;
    if (len === 0) return false;
    if (c.minLength != null && len < c.minLength) return true;
    if (c.maxLength != null && len > c.maxLength) return true;
    return false;
  });

  // ===== ControlValueAccessor =====
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngOnInit(): void {
    const fallback =
      findCountryByDialCode(this.defaultCountryCode) ?? DEFAULT_COUNTRY;
    this.selectedCountry.set(fallback);
  }

  writeValue(value: string | null | undefined): void {
    if (!value) {
      this.localNumber.set('');
      const fallback =
        findCountryByDialCode(this.defaultCountryCode) ?? DEFAULT_COUNTRY;
      this.selectedCountry.set(fallback);
      return;
    }
    const { country, local } = splitInternationalNumber(value);
    this.selectedCountry.set(country);
    this.localNumber.set(local);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // ===== Interactions UI =====

  toggleDropdown(): void {
    if (this.isDisabled()) return;
    const willOpen = !this.isOpen();
    this.isOpen.set(willOpen);
    if (willOpen) {
      this.searchTerm.set('');
      // Focus le champ de recherche après le rendu.
      setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
    }
  }

  selectCountry(country: Country): void {
    this.selectedCountry.set(country);
    this.isOpen.set(false);
    this.searchTerm.set('');
    this.emit();
  }

  onLocalInput(value: string): void {
    // On garde uniquement les chiffres pour rester aligné avec le format
    // attendu côté backend (numéro international "+228xxxxxxxx").
    const digits = (value ?? '').replace(/\D/g, '');
    this.localNumber.set(digits);
    this.emit();
  }

  onBlur(): void {
    this.onTouched();
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  /** Ferme le dropdown si on clique en dehors du composant. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const host = (event.currentTarget as Document).querySelector('app-phone-input');
    // On utilise un attribut data-* pour repérer notre wrapper sans
    // manipuler le DOM via ElementRef (plus simple côté SSR-friendly).
    if (target.closest('[data-phone-input-root]')) return;
    this.isOpen.set(false);
  }

  /** Ferme le dropdown sur Escape. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.isOpen.set(false);
  }

  // ===== Helpers =====

  /** Concatène l'indicatif et la partie locale puis émet via CVA. */
  private emit(): void {
    const dial = this.selectedCountry().dialCode;
    const local = this.localNumber();
    const full = local ? `${dial}${local}` : '';
    this.onChange(full);
  }

  /** trackBy pour la liste de pays (perf). */
  trackByCode(_: number, c: Country): string {
    return c.code + c.dialCode;
  }
}
