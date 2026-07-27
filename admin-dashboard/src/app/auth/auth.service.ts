import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  profilePhotoUrl?: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

const TOKEN_KEY = 'zonzon_token';
const USER_KEY = 'zonzon_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  // Signal reactif pour suivre l'utilisateur courant (utile pour le layout)
  readonly currentUser = signal<User | null>(this.readUserFromStorage());

  login(phone: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}${environment.apiPrefix}/auth/login`, { phone, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.access_token);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.currentUser.set(res.user);
        })
      );
  }

  /**
   * Reset de mot de passe self-service (ADMIN uniquement, via WhatsApp OTP).
   * Réponse `{ sent: true }` que le compte existe ou non — anti-énumération,
   * cf. `AuthService.requestPasswordReset` côté backend.
   */
  requestPasswordReset(phone: string): Observable<{ sent: boolean }> {
    return this.http.post<{ sent: boolean }>(
      `${environment.apiUrl}${environment.apiPrefix}/auth/forgot-password/request`,
      { phone }
    );
  }

  resetPassword(phone: string, code: string, newPassword: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${environment.apiUrl}${environment.apiPrefix}/auth/forgot-password/reset`,
      { phone, code, newPassword }
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getCurrentUser(): User | null {
    return this.currentUser() ?? this.readUserFromStorage();
  }

  isAuthenticated(): boolean {
    return !!this.getToken() && !!this.getCurrentUser();
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'ADMIN';
  }

  private readUserFromStorage(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
