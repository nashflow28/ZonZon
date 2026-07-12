import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Milestone {
  status: string;
  label: string;
}

const MILESTONES: Milestone[] = [
  { status: 'ACCEPTED', label: 'Acceptée' },
  { status: 'EN_ROUTE_PICKUP', label: 'Vers retrait' },
  { status: 'AT_PICKUP', label: 'Au retrait' },
  { status: 'IN_PROGRESS', label: 'Récupéré' },
  { status: 'NEAR_CLIENT', label: 'Proche' },
  { status: 'COMPLETED', label: 'Livré' },
];

type StepState = 'done' | 'now' | 'upcoming';

/**
 * Frise de progression d'une course — pièce signature « Direction A ».
 * Portée depuis mobile_app/lib/widgets/status_timeline.dart : même sémantique
 * de couleurs (fait=vert, en cours=mangue, à venir=gris), bandeau corail pour
 * les états terminaux d'exception (CANCELLED/FAILED).
 */
@Component({
  selector: 'app-status-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isCancelled() || isFailed()) {
      <div class="terminal-banner">
        <span>{{ isCancelled() ? 'Course annulée' : 'Livraison échouée' }}</span>
      </div>
    } @else {
      <div class="timeline">
        @for (m of milestones; track m.status; let i = $index) {
          <div class="step">
            <div class="bar-row">
              <div class="bar" [class.bar--filled]="i > 0 && stepState(i - 1) !== 'upcoming'"></div>
              <div class="bar" [class.bar--filled]="i < milestones.length - 1 && stepState(i) === 'done'"></div>
            </div>
            <div
              class="dot"
              [class.dot--done]="stepState(i) === 'done'"
              [class.dot--now]="stepState(i) === 'now'"
            ></div>
            <span
              class="label"
              [class.label--now]="stepState(i) === 'now'"
              [class.label--done]="stepState(i) === 'done'"
              >{{ m.label }}</span
            >
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .timeline {
        display: flex;
        align-items: flex-start;
        gap: 2px;
      }

      .step {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }

      .bar-row {
        display: flex;
        width: 100%;
        height: 4px;
      }

      .bar {
        flex: 1;
        height: 4px;
        margin: 0 1px;
        border-radius: 100px;
        background: transparent;
      }

      .bar--filled {
        background: var(--zz-line);
      }

      .dot {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        margin-top: 6px;
        background: color-mix(in srgb, var(--zz-line) 60%, transparent);
      }

      .dot--done {
        background: color-mix(in srgb, var(--zz-go) 20%, transparent);
        border: 2px solid var(--zz-go);
      }

      .dot--now {
        background: var(--zz-mango);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--zz-mango) 25%, transparent);
      }

      .label {
        margin-top: 4px;
        font-size: 9px;
        font-weight: 600;
        text-align: center;
        color: var(--zz-text-mut);
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .label--done {
        color: color-mix(in srgb, var(--zz-text-hi) 80%, transparent);
      }

      .label--now {
        color: var(--zz-text-hi);
        font-weight: 700;
      }

      .terminal-banner {
        display: flex;
        align-items: center;
        padding: 12px 14px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--zz-coral) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--zz-coral) 40%, transparent);
        color: var(--zz-coral);
        font-weight: 700;
        font-size: 13px;
      }
    `,
  ],
})
export class StatusTimelineComponent {
  readonly status = input<string | null | undefined>(null);

  readonly milestones = MILESTONES;

  readonly isCancelled = computed(() => this.status() === 'CANCELLED');
  readonly isFailed = computed(() => this.status() === 'FAILED');

  private readonly currentIndex = computed(() =>
    this.milestones.findIndex((m) => m.status === this.status())
  );

  stepState(i: number): StepState {
    const current = this.currentIndex();
    if (i < current) return 'done';
    if (i === current) return 'now';
    return 'upcoming';
  }
}
