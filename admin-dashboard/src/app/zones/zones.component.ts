import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { UpdateZoneDto, Zone, ZonesService } from './zones.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

@Component({
  selector: 'app-zones',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, EmptyStateComponent, SkeletonRowComponent],
  templateUrl: './zones.component.html',
  styleUrl: './zones.component.css'
})
export class ZonesComponent implements OnInit, OnDestroy {
  private zonesService = inject(ZonesService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly zones = signal<Zone[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  // Ajout
  readonly newZoneName = signal<string>('');
  readonly newZoneDescription = signal<string>('');
  readonly newZoneBasePrice = signal<string>('');
  readonly newZonePricePerKm = signal<string>('');
  readonly isCreating = signal<boolean>(false);
  readonly createError = signal<string>('');

  // Édition inline (renommage + enrichissement tarifaire)
  readonly editingId = signal<string | null>(null);
  readonly editingName = signal<string>('');
  readonly editingDescription = signal<string>('');
  readonly editingBasePrice = signal<string>('');
  readonly editingPricePerKm = signal<string>('');
  readonly editError = signal<string>('');

  // Suppression (confirmation)
  readonly pendingDeleteId = signal<string | null>(null);

  ngOnInit(): void {
    this.pageActions.setPage('Zones', 'Gestion des zones de livraison');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.fetch());
    this.fetch();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  /// ⚠️ GET /zones ne renvoie que les zones ACTIVES (contrat backend). Une
  /// zone désactivée ne réapparaîtra donc plus dans cette liste après un
  /// rechargement — c'est un choix assumé pour la V1 (cf. zones.service.ts).
  fetch(): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.zonesService.getZones().subscribe({
      next: (data) => {
        this.zones.set(data ?? []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement zones', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  /// Parse un champ prix (string du formulaire) en entier ≥0, ou undefined si vide/invalide.
  private parsePrice(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n);
  }

  createZone(): void {
    const name = this.newZoneName().trim();
    if (!name) return;

    this.isCreating.set(true);
    this.createError.set('');

    const description = this.newZoneDescription().trim();
    const basePrice = this.parsePrice(this.newZoneBasePrice());
    const pricePerKmOverride = this.parsePrice(this.newZonePricePerKm());

    this.zonesService.createZone(name, {
      description: description || undefined,
      basePrice,
      pricePerKmOverride
    }).subscribe({
      next: (zone) => {
        this.zones.update((list) => [...list, zone]);
        this.newZoneName.set('');
        this.newZoneDescription.set('');
        this.newZoneBasePrice.set('');
        this.newZonePricePerKm.set('');
        this.isCreating.set(false);
      },
      error: (err) => {
        this.isCreating.set(false);
        if (err?.status === 409) {
          this.createError.set('Une zone porte déjà ce nom.');
        } else {
          this.createError.set(err?.error?.message || "Impossible de créer la zone.");
        }
      }
    });
  }

  startEdit(zone: Zone): void {
    this.editingId.set(zone.id);
    this.editingName.set(zone.name);
    this.editingDescription.set(zone.description ?? '');
    this.editingBasePrice.set(zone.basePrice != null ? String(zone.basePrice) : '');
    this.editingPricePerKm.set(zone.pricePerKmOverride != null ? String(zone.pricePerKmOverride) : '');
    this.editError.set('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editingName.set('');
    this.editingDescription.set('');
    this.editingBasePrice.set('');
    this.editingPricePerKm.set('');
    this.editError.set('');
  }

  saveEdit(zone: Zone): void {
    const name = this.editingName().trim();
    if (!name) {
      this.cancelEdit();
      return;
    }

    const description = this.editingDescription().trim();
    const basePrice = this.parsePrice(this.editingBasePrice());
    const pricePerKmOverride = this.parsePrice(this.editingPricePerKm());

    const dto: UpdateZoneDto = {
      name,
      description,
      basePrice,
      pricePerKmOverride
    };

    this.zonesService.updateZone(zone.id, dto).subscribe({
      next: (updated) => {
        this.replaceLocal(updated);
        this.cancelEdit();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.editError.set('Une zone porte déjà ce nom.');
        } else {
          this.editError.set(err?.error?.message || 'Impossible de mettre à jour la zone.');
        }
      }
    });
  }

  toggleActive(zone: Zone): void {
    this.zonesService.updateZone(zone.id, { active: !zone.active }).subscribe({
      next: (updated) => {
        // Si on vient de désactiver, la zone disparaîtra du prochain fetch
        // (cf. limite documentée dans zones.service.ts) — on la retire
        // immédiatement de la liste locale pour rester cohérent avec l'API.
        if (!updated.active) {
          this.zones.update((list) => list.filter((z) => z.id !== updated.id));
        } else {
          this.replaceLocal(updated);
        }
      },
      error: (err) => {
        console.error('Erreur toggle zone', err);
      }
    });
  }

  askDelete(zone: Zone): void {
    this.pendingDeleteId.set(zone.id);
  }

  cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  confirmDelete(zone: Zone): void {
    this.zonesService.deleteZone(zone.id).subscribe({
      next: () => {
        this.zones.update((list) => list.filter((z) => z.id !== zone.id));
        this.pendingDeleteId.set(null);
      },
      error: (err) => {
        console.error('Erreur suppression zone', err);
        this.pendingDeleteId.set(null);
      }
    });
  }

  private replaceLocal(updated: Zone): void {
    this.zones.set(this.zones().map((z) => (z.id === updated.id ? { ...z, ...updated } : z)));
  }

  /// Résumé tarifaire affiché dans la liste (ex. « base 500 FCFA · 250 FCFA/km »).
  /// Retourne '' si aucune des deux valeurs n'est définie.
  pricingSummary(zone: Zone): string {
    const parts: string[] = [];
    if (zone.basePrice != null) parts.push(`base ${zone.basePrice} FCFA`);
    if (zone.pricePerKmOverride != null) parts.push(`${zone.pricePerKmOverride} FCFA/km`);
    return parts.join(' · ');
  }
}
