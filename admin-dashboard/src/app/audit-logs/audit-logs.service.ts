import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/// Actions d'audit supportées par le backend (cf. backend/src/entities/admin-audit-log.entity.ts).
export type AuditAction =
  | 'SHOP_APPROVE'
  | 'SHOP_REJECT'
  | 'SHOP_SUSPEND'
  | 'COMMISSION_MARK_PAID'
  | 'USER_DELETE'
  | 'USER_RESTORE';

/// Filtre client pour `ALL` (afficher tous les types d'actions).
export type AuditActionFilter = AuditAction | 'ALL';

export interface AuditAdminRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AuditLog {
  id: string;
  adminId: string | null;
  admin: AuditAdminRef | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO
}

export interface AuditLogsFilter {
  page?: number;
  limit?: number;
  action?: AuditActionFilter;
  adminId?: string;
  targetType?: string;
  from?: string; // ISO date (yyyy-MM-dd)
  to?: string;   // ISO date (yyyy-MM-dd)
}

export interface PagedAuditLogs {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}${environment.apiPrefix}/admin/audit-logs`;

  list(filter: AuditLogsFilter = {}): Observable<PagedAuditLogs> {
    let params = new HttpParams();
    if (filter.page) params = params.set('page', String(filter.page));
    if (filter.limit) params = params.set('limit', String(filter.limit));
    if (filter.action && filter.action !== 'ALL') {
      params = params.set('action', filter.action);
    }
    if (filter.adminId) params = params.set('adminId', filter.adminId);
    if (filter.targetType) params = params.set('targetType', filter.targetType);
    if (filter.from) params = params.set('from', filter.from);
    if (filter.to) params = params.set('to', filter.to);
    return this.http.get<PagedAuditLogs>(this.baseUrl, { params });
  }
}
