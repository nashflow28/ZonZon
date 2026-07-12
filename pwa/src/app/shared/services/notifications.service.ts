import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppNotification, Paginated } from '../models/order.model';

const BASE = `${environment.apiUrl}${environment.apiPrefix}/notifications`;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private http = inject(HttpClient);

  /** Nombre de notifications non lues connu depuis le dernier `list()` — sert au badge Profil. */
  readonly unreadCount = signal(0);

  list(page = 1, limit = 20): Observable<Paginated<AppNotification>> {
    return this.http
      .get<Paginated<AppNotification>>(`${BASE}?page=${page}&limit=${limit}`)
      .pipe(
        tap((res) => {
          if (page === 1) {
            this.unreadCount.set(res.items.filter((n) => !n.readAt).length);
          }
        })
      );
  }

  markRead(id: string): Observable<unknown> {
    return this.http.patch(`${BASE}/${id}/read`, {}).pipe(
      tap(() => this.unreadCount.update((n) => Math.max(0, n - 1)))
    );
  }

  markAllRead(): Observable<unknown> {
    return this.http
      .patch(`${BASE}/read-all`, {})
      .pipe(tap(() => this.unreadCount.set(0)));
  }
}
