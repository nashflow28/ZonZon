import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err) => {
      // Ne déclencher la déconnexion que si la requête portait un token :
      // un 401 sur un appel non authentifié (login, mot de passe oublié) est
      // un échec applicatif normal, pas une session expirée. Sans ce garde,
      // un code de reset invalide sur /auth/forgot-password/reset renvoyait
      // vers /login avant même que le message d'erreur soit visible.
      if (err?.status === 401 && token) {
        authService.logout();
      }
      return throwError(() => err);
    })
  );
};
