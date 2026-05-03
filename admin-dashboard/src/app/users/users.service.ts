import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserVehicle {
  type: string;
  licensePlate?: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  profilePhotoUrl?: string;
  vehicle?: UserVehicle;
  createdAt: string;
}

export interface RatingStats {
  average: number;
  count: number;
}

/// Stats étendues d'un utilisateur (côté livreur principalement).
/// Renvoyé par `GET /users/:id/stats` (endpoint backend déployé séparément).
export interface UserExtendedStats {
  ratingAverage: number;
  ratingCount: number;
  completedCount: number;
  averageDurationMinutes: number | null;
  cancellationRate: number;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}${environment.apiPrefix}/users`;

  /// Compat ascendante avec le nom utilisé en interne par le composant.
  private apiUrl = this.baseUrl;

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.baseUrl);
  }

  /// @deprecated Utiliser `getUserExtendedStats` qui inclut désormais ces données.
  /// Conservée pour rétro-compatibilité et comme fallback si l'endpoint
  /// `/users/:id/stats` n'est pas encore disponible (backend pas redéployé).
  getRatingStats(userId: string): Observable<RatingStats> {
    return this.http.get<RatingStats>(`${this.baseUrl}/${userId}/ratings/stats`);
  }

  /// Alias explicite, conforme à la spec côté task.
  getUserRatingStats(userId: string): Observable<RatingStats> {
    return this.getRatingStats(userId);
  }

  /// Charge les stats étendues d'un utilisateur. Pour les livreurs,
  /// inclut le nombre de courses, le temps moyen et le taux d'annulation.
  getUserExtendedStats(userId: string): Observable<UserExtendedStats> {
    return this.http.get<UserExtendedStats>(`${this.baseUrl}/${userId}/stats`);
  }
}
