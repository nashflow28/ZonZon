import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type CommissionStatus = 'DUE' | 'PAID';

export interface WeeklyReportRow {
  livreurId: string;
  livreurName: string;
  completedCount: number;
  totalRevenue: number;
  commissionRate: number;
  commissionDue: number;
  commissionId: string | null;
  status: CommissionStatus;
}

export interface WeeklyReport {
  periodStart: string;
  periodEnd: string;
  commissionRate: number;
  totalRevenue: number;
  totalCommission: number;
  activeDrivers: number;
  rows: WeeklyReportRow[];
}

export interface SnapshotResponse {
  count?: number;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}${environment.apiPrefix}/reports`;

  getWeekly(from: string, to: string): Observable<WeeklyReport> {
    const params = new URLSearchParams({ from, to }).toString();
    return this.http.get<WeeklyReport>(`${this.baseUrl}/weekly?${params}`);
  }

  /**
   * Marque une commission persistée comme payée.
   * Le commissionId provient de la ligne du rapport (champ `commissionId`).
   */
  markCommissionPaid(commissionId: string): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/commissions/${commissionId}/mark-paid`,
      {}
    );
  }

  /**
   * Génère/maj le snapshot des commissions de la semaine
   * (afin que chaque ligne du rapport ait un commissionId).
   */
  snapshotWeek(from?: string): Observable<SnapshotResponse> {
    const body = from ? { from } : {};
    return this.http.post<SnapshotResponse>(`${this.baseUrl}/snapshot`, body);
  }
}
