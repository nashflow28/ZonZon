import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AvailableDriver } from '../../shared/models/order.model';

function vehicleLabel(type: string | undefined | null): string {
  switch (type) {
    case 'MOTO':
      return 'Moto';
    case 'VOITURE':
      return 'Voiture';
    case 'TRICYCLE':
      return 'Tricycle';
    default:
      return 'Véhicule';
  }
}

/**
 * Sélecteur de livreur réutilisable (écran Créer + réassignation dans le
 * suivi). Première option toujours "laisser la plateforme choisir" (aucun
 * `preferredLivreurId`) ; les affiliés du commerçant sont mis en avant
 * (triés en tête par le backend, badge dédié ici).
 */
@Component({
  selector: 'app-driver-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      @if (loading()) {
        <p class="hint">Recherche de livreurs…</p>
      } @else {
        <button
          type="button"
          class="row"
          [class.row--selected]="selectedId() === null"
          (click)="select.emit(null)"
        >
          <span class="row-title">Laisser la plateforme choisir</span>
          <span class="row-check">{{ selectedId() === null ? '✓' : '' }}</span>
        </button>

        @if (drivers().length === 0) {
          <p class="hint">Aucun livreur disponible pour le moment.</p>
        } @else {
          @for (driver of drivers(); track driver.id) {
            <button
              type="button"
              class="row"
              [class.row--selected]="selectedId() === driver.id"
              (click)="select.emit(driver.id)"
            >
              <span class="row-main">
                <span class="row-title">
                  {{ driver.firstName }} {{ driver.lastName }}
                  @if (driver.isAffiliated) {
                    <span class="badge">Affilié</span>
                  }
                </span>
                <span class="row-sub">
                  {{ vehicleLabel(driver.vehicle?.type) }}
                  @if (driver.distanceKm != null) {
                    · {{ driver.distanceKm }} km
                  }
                </span>
              </span>
              <span class="row-check">{{ selectedId() === driver.id ? '✓' : '' }}</span>
            </button>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .picker {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .hint {
        margin: 0;
        font-size: 13px;
        color: var(--zz-text-mut);
        text-align: center;
        padding: 8px 0;
      }

      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: var(--zz-card);
        border: 1px solid var(--zz-line);
        border-radius: 14px;
        padding: 12px 14px;
        cursor: pointer;
        color: inherit;
        font: inherit;
        text-align: left;
      }

      .row--selected {
        border-color: var(--zz-go);
        background: color-mix(in srgb, var(--zz-go) 10%, var(--zz-card));
      }

      .row-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .row-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--zz-text-hi);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .row-sub {
        font-size: 12px;
        color: var(--zz-text-mut);
      }

      .badge {
        font-size: 10px;
        font-weight: 700;
        color: var(--zz-go);
        background: color-mix(in srgb, var(--zz-go) 16%, transparent);
        border: 1px solid color-mix(in srgb, var(--zz-go) 40%, transparent);
        border-radius: 999px;
        padding: 1px 7px;
      }

      .row-check {
        flex: 0 0 auto;
        width: 18px;
        text-align: center;
        color: var(--zz-go);
        font-weight: 700;
      }
    `,
  ],
})
export class DriverPickerComponent {
  readonly drivers = input.required<AvailableDriver[]>();
  readonly loading = input<boolean>(false);
  readonly selectedId = input<string | null>(null);

  readonly select = output<string | null>();

  readonly vehicleLabel = vehicleLabel;
}
