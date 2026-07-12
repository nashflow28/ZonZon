import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, timeout, TimeoutError } from 'rxjs';
import { AuthService } from './auth.service';

/** Aucune requête ne doit rester suspendue indéfiniment (ex. Fly.io machine qui se réveille). */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Intercepteur HTTP fonctionnel :
 * - ajoute le Bearer token s'il existe,
 * - applique un timeout global,
 * - purge la session et redirige vers /login sur 401 (token expiré/invalide).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    timeout(REQUEST_TIMEOUT_MS),
    catchError((err) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        authService.clearSession();
        router.navigate(['/login']);
      }
      if (err instanceof TimeoutError) {
        return throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Timeout', error: 'Délai dépassé, réessayez.' }));
      }
      return throwError(() => err);
    })
  );
};
