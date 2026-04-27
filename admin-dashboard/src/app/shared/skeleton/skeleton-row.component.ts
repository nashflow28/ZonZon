import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Skeleton UI reutilisable pour tableaux et cartes.
 *
 * Exemples :
 *  <app-skeleton-row [rows]="5" [cols]="4" />              // table
 *  <app-skeleton-row [rows]="3" variant="card" />          // cartes stats
 */
@Component({
  selector: 'app-skeleton-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="variant === 'card'; else tableTpl">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          *ngFor="let r of rowsArray()"
          class="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-6 animate-pulse space-y-4">
          <div class="h-3 w-24 bg-slate-700/40 rounded"></div>
          <div class="h-9 w-40 bg-slate-700/40 rounded"></div>
          <div class="h-3 w-32 bg-slate-700/30 rounded"></div>
        </div>
      </div>
    </ng-container>

    <ng-template #tableTpl>
      <div class="bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div class="divide-y divide-slate-700/40">
          <div
            *ngFor="let r of rowsArray()"
            class="flex items-center gap-4 p-5 animate-pulse">
            <div
              *ngFor="let c of colsArray()"
              class="h-4 bg-slate-700/30 rounded flex-1"></div>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class SkeletonRowComponent {
  @Input() set rows(value: number) { this._rows.set(value); }
  @Input() set cols(value: number) { this._cols.set(value); }
  @Input() variant: 'table' | 'card' = 'table';

  private _rows = signal(5);
  private _cols = signal(4);

  rowsArray = computed(() => Array.from({ length: this._rows() }));
  colsArray = computed(() => Array.from({ length: this._cols() }));
}
