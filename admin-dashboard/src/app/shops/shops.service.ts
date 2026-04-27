import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ShopStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface ShopOwner {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface Shop {
  id: string;
  ownerId: string;
  owner?: ShopOwner;
  name: string;
  category: string;
  status: ShopStatus;
  description?: string | null;
  address: string;
  lat: number;
  lng: number;
  logoUrl?: string | null;
  phone?: string | null;
  hours?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ShopsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/shops`;

  list(status?: ShopStatus): Observable<Shop[]> {
    const params = status ? `?status=${status}` : '';
    return this.http.get<Shop[]>(`${this.base}/admin${params}`);
  }

  approve(id: string): Observable<Shop> {
    return this.http.patch<Shop>(`${this.base}/admin/${id}/approve`, {});
  }

  reject(id: string, reason?: string): Observable<Shop> {
    return this.http.patch<Shop>(`${this.base}/admin/${id}/reject`, {
      reason,
    });
  }

  suspend(id: string): Observable<Shop> {
    return this.http.patch<Shop>(`${this.base}/admin/${id}/suspend`, {});
  }
}
