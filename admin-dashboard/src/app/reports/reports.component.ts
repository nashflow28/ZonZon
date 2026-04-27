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
  readonly payingIds = signal<Set<string>>(new Set());
  readonly paidIds = signal<Set<string>>(new Set());

  readonly rows = computed<WeeklyReportRow[]>(() => this.report()?.rows ?? []);

  readonly totalRevenue = computed(() =>
    this.rows().reduce((sum, r) => sum + (r.totalRevenue || 0), 0)
  );

  readonly totalCommission = computed(() =>
    this.rows().reduce((sum, r) => sum + (r.commissionDue || 0), 0)
  );

  readonly activeLivreurs = computed(() =>
    this.rows().filter((r) => r.completedCount > 0).length
  );

  ngOnInit(): void {
    this.pageActions.setPage('Comptabilité', 'Rapports hebdomadaires et commissions (35%)');
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

  private load(week: WeekOption): void {
    this.isLoading.set(true);
    this.errored.set(false);
    this.report.set(null);
    this.paidIds.set(new Set());
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

  pay(row: WeeklyReportRow): void {
    if (this.payingIds().has(row.livreurId) || this.paidIds().has(row.livreurId)) {
      return;
    }
    const next = new Set(this.payingIds());
    next.add(row.livreurId);
    this.payingIds.set(next);

    this.reportsService.payCommission(row.livreurId).subscribe({
      next: (res) => {
        const paying = new Set(this.payingIds());
        paying.delete(row.livreurId);
        this.payingIds.set(paying);
        if (res?.success) {
          const paid = new Set(this.paidIds());
          paid.add(row.livreurId);
          this.paidIds.set(paid);
        }
      },
      error: (err) => {
        console.error('Paiement commission echoue', err);
        const paying = new Set(this.payingIds());
        paying.delete(row.livreurId);
        this.payingIds.set(paying);
      }
    });
  }

  isPaying(id: string): boolean {
    return this.payingIds().has(id);
  }

  isPaid(id: string): boolean {
    return this.paidIds().has(id);
  }

  selectedWeekLabel(): string {
    const w = this.weeks().find((w) => this.keyOf(w) === this.selectedWeekKey());
    return w?.label ?? '';
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
