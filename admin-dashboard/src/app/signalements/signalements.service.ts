import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/// Types de cible signalable (cf. backend/src/entities/signalement.entity.ts).
export type SignalementTargetType = 'DELIVERY' | 'USER' | 'DRIVER' | 'MERCHANT';

/// Filtre client pour `ALL` (afficher tous les types de cible).
export type SignalementTargetTypeFilter = SignalementTargetType | 'ALL';

export type SignalementStatus = 'OPEN' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED';

/// Filtre client pour `ALL` (afficher tous les statuts).
export type SignalementStatusFilter = SignalementStatus | 'ALL';

export interface Signalement {
  id: string;
  reporterId: string;
  targetType: SignalementTargetType;
  targetId: string;
  reason: string;
  status: SignalementStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string; // ISO
}

export interface SignalementsFilter {
  page?: number;
  limit?: number;
  status?: SignalementStatusFilter;
  targetType?: SignalementTargetTypeFilter;
}

export interface PagedSignalements {
  items: Signalement[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UpdateSignalementDto {
  status: SignalementStatus;
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class SignalementsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}${environment.apiPrefix}/signalements`;

  list(filter: SignalementsFilter = {}): Observable<PagedSignalements> {
    let params = new HttpParams();
    if (filter.page) params = params.set('page', String(filter.page));
    if (filter.limit) params = params.set('limit', String(filter.limit));
    if (filter.status && filter.status !== 'ALL') {
      params = params.set('status', filter.status);
    }
    if (filter.targetType && filter.targetType !== 'ALL') {
      params = params.set('targetType', filter.targetType);
    }
    return this.http.get<PagedSignalements>(this.baseUrl, { params });
  }

  updateStatus(id: string, status: SignalementStatus, note?: string): Observable<Signalement> {
    const dto: UpdateSignalementDto = { status };
    if (note) dto.note = note;
    return this.http.patch<Signalement>(`${this.baseUrl}/${id}`, dto);
  }
}
