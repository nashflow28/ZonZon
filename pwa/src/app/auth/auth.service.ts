import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { RealtimeNotificationsBridge } from '../shared/services/realtime-notifications-bridge.service';
import { SocketService } from '../shared/services/socket.service';
import { LoginPayload, LoginResponse, RegisterPayload, Role, User } from './models/user.model';

const TOKEN_KEY = 'zonzon_token';
const USER_KEY = 'zonzon_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private socketService = inject(SocketService);
  private realtimeBridge = inject(RealtimeNotificationsBridge);

  /** Signal réactif pour suivre l'utilisateur courant (layout, guards, shells). */
  readonly currentUser = signal<User | null>(this.readUserFromStorage());

  /** Rôle courant, dérivé de l'utilisateur courant. */
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);

  constructor() {
    // Session déjà persistée (reload de page) : reconnecte le temps réel.
    const token = this.getToken();
    if (token && this.currentUser()) {
      this.socketService.connect(token);
      this.realtimeBridge.start();
    }
  }

  login(phone: string, password: string): Observable<LoginResponse> {
    const payload: LoginPayload = { phone, password };
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}${environment.apiPrefix}/auth/login`, payload)
      .pipe(tap((res) => this.persistSession(res)));
  }

  register(payload: RegisterPayload): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}${environment.apiPrefix}/auth/register`, payload)
      .pipe(tap((res) => this.persistSession(res)));
  }

  /** Récupère l'utilisateur courant depuis l'API (utile après reload / refresh du profil). */
  fetchMe(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}${environment.apiPrefix}/users/me`).pipe(
      tap((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.socketService.disconnect();
    this.realtimeBridge.reset();
    this.router.navigate(['/login']);
  }

  /** Purge silencieuse de la session (appelée par l'intercepteur sur 401), sans navigation forcée en double. */
  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.socketService.disconnect();
    this.realtimeBridge.reset();
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

  /** Chemin du shell correspondant au rôle courant (utilisé pour les redirections). */
  homePathForRole(role: Role | null | undefined): string {
    switch (role) {
      case 'CLIENT':
        return '/client';
      case 'LIVREUR':
        return '/driver';
      case 'COMMERCANT':
        return '/merchant';
      default:
        // ADMIN (ou inconnu) : la PWA ne gère pas le back-office, retour au login.
        return '/login';
    }
  }

  /** Édition du profil courant (prénom/nom). */
  updateMe(payload: { firstName?: string; lastName?: string }): Observable<User> {
    return this.http
      .patch<User>(`${environment.apiUrl}${environment.apiPrefix}/users/me`, payload)
      .pipe(
        tap((user) => {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this.currentUser.set(user);
        })
      );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(
      `${environment.apiUrl}${environment.apiPrefix}/auth/password`,
      { currentPassword, newPassword }
    );
  }

  /**
   * Upload de la photo de profil (multipart). Le backend ne renvoie QUE
   * `{ profilePhotoUrl }` (pas l'utilisateur complet) — on fusionne dans
   * l'utilisateur courant plutôt que de le remplacer intégralement.
   */
  uploadPhoto(file: File): Observable<{ profilePhotoUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<{ profilePhotoUrl: string }>(
        `${environment.apiUrl}${environment.apiPrefix}/users/me/photo`,
        form
      )
      .pipe(tap((res) => this.patchCurrentUser({ profilePhotoUrl: res.profilePhotoUrl })));
  }

  /**
   * Fusionne un correctif partiel dans l'utilisateur courant — utile après
   * un PATCH qui ne renvoie qu'un sous-ensemble de champs (ex.
   * `{isAvailable}` ou `{isPublic}`) au lieu de l'objet `User` complet.
   */
  patchCurrentUser(partial: Partial<User>): void {
    const current = this.currentUser();
    if (!current) return;
    const merged: User = { ...current, ...partial };
    localStorage.setItem(USER_KEY, JSON.stringify(merged));
    this.currentUser.set(merged);
  }

  private persistSession(res: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.currentUser.set(res.user);
    this.socketService.connect(res.access_token);
    this.realtimeBridge.start();
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
