import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WeeklyReportRow {
  livreurId: string;
  livreurName: string;
  completedCount: number;
  totalRevenue: number;
  commissionDue: number;
  commissionRate: number;
}

export interface WeeklyReport {
  periodStart: string;
  periodEnd: string;
  rows: WeeklyReportRow[];
}

export interface PayCommissionResponse {
  success: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/reports`;

  getWeekly(from: string, to: string): Observable<WeeklyReport> {
    const params = new URLSearchParams({ from, to }).toString();
    return this.http.get<WeeklyReport>(`${this.baseUrl}/weekly?${params}`);
  }

  payCommission(livreurId: string): Observable<PayCommissionResponse> {
    return this.http.post<PayCommissionResponse>(
      `${this.baseUrl}/commissions/${livreurId}/pay`,
      {}
    );
  }
}
