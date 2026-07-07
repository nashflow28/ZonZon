import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Zone {
  id: string;
  name: string;
  active: boolean;
  description?: string | null;
  basePrice?: number | null;
  pricePerKmOverride?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateZoneDto {
  name?: string;
  active?: boolean;
  description?: string;
  basePrice?: number;
  pricePerKmOverride?: number;
}

export interface CreateZoneDto {
  name: string;
  description?: string;
  basePrice?: number;
  pricePerKmOverride?: number;
}

@Injectable({ providedIn: 'root' })
export class ZonesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}${environment.apiPrefix}/zones`;

  /// ⚠️ NOTE : le backend ne renvoie que les zones ACTIVES sur ce endpoint.
  /// Conséquence en V1 : une zone désactivée disparaît de la liste affichée
  /// (elle n'est pas supprimée côté serveur, juste invisible ici). Acceptable
  /// pour cette version — à revisiter si on a besoin de réactiver une zone
  /// désactivée depuis l'admin (il faudrait alors un endpoint dédié incluant
  /// les zones inactives).
  getZones(): Observable<Zone[]> {
    return this.http.get<Zone[]>(this.base);
  }

  createZone(name: string, extra?: Omit<CreateZoneDto, 'name'>): Observable<Zone> {
    const dto: CreateZoneDto = { name, ...extra };
    return this.http.post<Zone>(this.base, dto);
  }

  updateZone(id: string, dto: UpdateZoneDto): Observable<Zone> {
    return this.http.patch<Zone>(`${this.base}/${id}`, dto);
  }

  deleteZone(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
