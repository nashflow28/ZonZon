import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Affiliation, UpsertVehiclePayload, Vehicle } from './driver.model';

const USERS_BASE = `${environment.apiUrl}${environment.apiPrefix}/users`;
const VEHICLES_BASE = `${environment.apiUrl}${environment.apiPrefix}/vehicles`;
const AFFILIATIONS_BASE = `${environment.apiUrl}${environment.apiPrefix}/drivers/me/affiliations`;

/**
 * Appels HTTP spécifiques au rôle Livreur : disponibilité, visibilité,
 * véhicule, affiliations commerçant, pièce d'identité. Les endpoints
 * `/orders/*` partagés (courses disponibles, accepter) restent dans
 * `OrdersService` (shared/services) — cohérent avec le domaine "commande".
 */
@Injectable({ providedIn: 'root' })
export class DriverService {
  private http = inject(HttpClient);

  setAvailability(available: boolean): Observable<{ isAvailable: boolean }> {
    return this.http.patch<{ isAvailable: boolean }>(`${USERS_BASE}/me/availability`, {
      available,
    });
  }

  setVisibility(isPublic: boolean): Observable<{ isPublic: boolean }> {
    return this.http.patch<{ isPublic: boolean }>(`${USERS_BASE}/me/visibility`, {
      isPublic,
    });
  }

  getVehicle(): Observable<Vehicle | null> {
    return this.http.get<Vehicle | null>(`${VEHICLES_BASE}/me`);
  }

  upsertVehicle(payload: UpsertVehiclePayload): Observable<Vehicle> {
    return this.http.put<Vehicle>(`${VEHICLES_BASE}/me`, payload);
  }

  listAffiliations(): Observable<Affiliation[]> {
    return this.http.get<Affiliation[]>(AFFILIATIONS_BASE);
  }

  respondAffiliation(merchantId: string, action: 'accept' | 'reject'): Observable<Affiliation> {
    return this.http.patch<Affiliation>(`${AFFILIATIONS_BASE}/${merchantId}`, { action });
  }

  /** Upload de la pièce d'identité (le backend ne renvoie pas d'URL exploitable, juste `{ok:true}`). */
  uploadIdCardPhoto(file: File): Observable<{ ok: boolean }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ ok: boolean }>(`${USERS_BASE}/me/id-card-photo`, form);
  }

  /** Stream authentifié de la pièce d'identité (bucket privé) — à convertir en object URL côté appelant. */
  getIdCardPhotoBlob(userId: string): Observable<Blob> {
    return this.http.get(`${USERS_BASE}/${userId}/id-card-photo`, { responseType: 'blob' });
  }
}
