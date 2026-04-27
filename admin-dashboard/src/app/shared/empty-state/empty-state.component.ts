import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * État vide générique avec icône illustrée.
 * - icon : nom d'icône (pour usage futur Lucide) — fallback SVG package inline.
 * - title / description / actionLabel / action.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.css'
})
export class EmptyStateComponent {
  @Input() icon?: string;
  @Input() title = '';
  @Input() description?: string;
  @Input() actionLabel?: string;
  @Output() action = new EventEmitter<void>();

  onAction(): void {
    this.action.emit();
  }
}
