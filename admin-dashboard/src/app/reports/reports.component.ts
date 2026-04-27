import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ReportsService,
  WeeklyReport,
  WeeklyReportRow
} from './reports.service';
import { LucideAngularModule } from 'lucide-angular';
import { SkeletonRowComponent } from '../shared/skeleton/skeleton-row.component';
import { PageActionsService } from '../shared/page-actions.service';

interface WeekOption {
  label: string;
  year: number;
  week: number;
  from: string; // YYYY-MM-DD (lundi)
  to: string;   // YYYY-MM-DD (dimanche)
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, SkeletonRowComponent],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css']
})
export class ReportsComponent implements OnInit, OnDestroy {
  private reportsService = inject(ReportsService);
  private pageActions = inject(PageActionsService);
  private refreshSub?: Subscription;

  readonly weeks = signal<WeekOption[]>([]);
  readonly selectedWeekKey = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly errored = signal<boolean>(false);
  readonly report = signal<WeeklyReport | null>(null);

  // Suivi des paiements en cours, indexé par commissionId
  readonly payingCommissionIds = signal<Set<string>>(new Set());
  readonly snapshotting = signal<boolean>(false);

  readonly rows = computed<WeeklyReportRow[]>(() => this.report()?.rows ?? []);

  // Si le backend renvoie totalRevenue / totalCommission, on les utilise.
  // Sinon on retombe sur la somme des lignes.
  readonly totalRevenue = computed(() => {
    const r = this.report();
    if (r && typeof r.totalRevenue === 'number') return r.totalRevenue;
    return this.rows().reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
  });

  readonly totalCommission = computed(() => {
    const r = this.report();
    if (r && typeof r.totalCommission === 'number') return r.totalCommission;
    return this.rows().reduce((sum, r) => sum + (r.commissionDue || 0), 0);
  });

  readonly activeLivreurs = computed(() => {
    const r = this.report();
    if (r && typeof r.activeDrivers === 'number') return r.activeDrivers;
    return this.rows().filter((r) => r.completedCount > 0).length;
  });

  readonly commissionRatePercent = computed(() => {
    const r = this.report();
    const rate = r?.commissionRate ?? 0.35;
    return Math.round(rate * 100);
  });

  // Y a-t-il au moins une ligne sans commissionId ? -> propose snapshot
  readonly needsSnapshot = computed(() =>
    this.rows().some((r) => !r.commissionId)
  );

  ngOnInit(): void {
    this.pageActions.setPage('Comptabilité', 'Rapports hebdomadaires et commissions');
    this.refreshSub = this.pageActions.refresh$.subscribe(() => this.reloadCurrent());
    this.weeks.set(this.buildRecentWeeks());
    const current = this.weeks()[0];
    if (current) {
      this.selectedWeekKey.set(this.keyOf(current));
      this.load(current);
    }
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  private reloadCurrent(): void {
    const w = this.weeks().find((x) => this.keyOf(x) === this.selectedWeekKey());
    if (w) this.load(w);
  }

  onWeekChange(value: string): void {
    this.selectedWeekKey.set(value);
    const week = this.weeks().find((w) => this.keyOf(w) === value);
    if (week) {
      this.load(week);
    }
  }

  currentWeek(): WeekOption | undefined {
    return this.weeks().find((w) => this.keyOf(w) === this.selectedWeekKey());
  }

  private load(week: WeekOption): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.report.set(null);
    this.payingCommissionIds.set(new Set());
    this.reportsService.getWeekly(week.from, week.to).subscribe({
      next: (data) => {
        this.report.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur rapport hebdo', err);
        this.errored.set(true);
        this.isLoading.set(false);
      }
    });
  }

  /** POST /reports/snapshot pour générer/maj les commissionId de la semaine. */
  snapshot(): void {
    if (this.snapshotting()) return;
    const week = this.currentWeek();
    this.snapshotting.set(true);
    this.reportsService.snapshotWeek(week?.from).subscribe({
      next: () => {
        this.snapshotting.set(false);
        if (week) this.load(week);
      },
      error: (err) => {
        console.error('Snapshot semaine echoue', err);
        this.snapshotting.set(false);
      }
    });
  }

  /** Marque une commission comme payée. */
  pay(row: WeeklyReportRow): void {
    if (!row.commissionId) return;
    if (this.payingCommissionIds().has(row.commissionId)) return;

    const next = new Set(this.payingCommissionIds());
    next.add(row.commissionId);
    this.payingCommissionIds.set(next);

    this.reportsService.markCommissionPaid(row.commissionId).subscribe({
      next: () => {
        const paying = new Set(this.payingCommissionIds());
        if (row.commissionId) paying.delete(row.commissionId);
        this.payingCommissionIds.set(paying);
        // Recharge la liste pour refléter le nouveau status renvoyé par le backend
        const week = this.currentWeek();
        if (week) this.load(week);
      },
      error: (err) => {
        console.error('Paiement commission echoue', err);
        const paying = new Set(this.payingCommissionIds());
        if (row.commissionId) paying.delete(row.commissionId);
        this.payingCommissionIds.set(paying);
      }
    });
  }

  isPaying(commissionId: string | null): boolean {
    if (!commissionId) return false;
    return this.payingCommissionIds().has(commissionId);
  }

  isPaid(row: WeeklyReportRow): boolean {
    return row.status === 'PAID';
  }

  selectedWeekLabel(): string {
    return this.currentWeek()?.label ?? '';
  }

  private keyOf(w: WeekOption): string {
    return `${w.year}-W${String(w.week).padStart(2, '0')}`;
  }

  private buildRecentWeeks(): WeekOption[] {
    const out: WeekOption[] = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i * 7);
      const { monday, sunday } = this.weekBounds(d);
      const { year, week } = this.isoWeek(d);
      out.push({
        label: `Semaine ${week} - ${year}`,
        year,
        week,
        from: this.fmt(monday),
        to: this.fmt(sunday)
      });
    }
    return out;
  }

  private weekBounds(date: Date): { monday: Date; sunday: Date } {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=dim .. 6=sam
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
  }

  private isoWeek(date: Date): { year: number; week: number } {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { year: tmp.getUTCFullYear(), week };
  }

  private fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
