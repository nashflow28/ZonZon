import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { Pricing, PricingService } from './pricing.service';
import { PageActionsService } from '../shared/page-actions.service';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.css'
})
export class PricingComponent implements OnInit, OnDestroy {
  private pricingService = inject(PricingService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly pricing = signal<Pricing | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  // Champs du formulaire d'édition
  readonly pricePerKmInput = signal<number | null>(null);
  readonly minPriceFcfaInput = signal<number | null>(null);

  readonly isSaving = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);
  readonly saveError = signal<string>('');

  ngOnInit(): void {
    this.pageActions.setPage('Tarifs', 'Configuration du prix au kilomètre et du prix minimum');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.pricingService.getPricing().subscribe({
      next: (data) => {
        this.pricing.set(data);
        this.pricePerKmInput.set(data.pricePerKm);
        this.minPriceFcfaInput.set(data.minPriceFcfa);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement tarifs', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  save(): void {
    const pricePerKm = this.pricePerKmInput();
    const minPriceFcfa = this.minPriceFcfaInput();

    if (pricePerKm === null || pricePerKm < 0 || minPriceFcfa === null || minPriceFcfa < 0) {
      this.saveError.set('Merci de saisir des valeurs numériques positives.');
      this.saveSuccess.set(false);
      return;
    }

    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set(false);

    this.pricingService.updatePricing({ pricePerKm, minPriceFcfa }).subscribe({
      next: (updated) => {
        this.pricing.set(updated);
        this.pricePerKmInput.set(updated.pricePerKm);
        this.minPriceFcfaInput.set(updated.minPriceFcfa);
        this.isSaving.set(false);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        console.error('Erreur mise à jour tarifs', err);
        this.isSaving.set(false);
        this.saveError.set(
          err?.error?.message || "Impossible d'enregistrer les tarifs. Réessayez."
        );
      }
    });
  }

  onPricePerKmChange(value: string): void {
    this.pricePerKmInput.set(value === '' ? null : Number(value));
  }

  onMinPriceChange(value: string): void {
    this.minPriceFcfaInput.set(value === '' ? null : Number(value));
  }
}
