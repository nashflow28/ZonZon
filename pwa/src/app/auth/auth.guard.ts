import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models/user.model';

/** Bloque l'accès aux routes protégées si l'utilisateur n'est pas authentifié. */
export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.parseUrl('/login');
};

/**
 * Fabrique de guard : autorise l'accès uniquement si le rôle courant correspond.
 * Sinon, redirige vers le shell du VRAI rôle de l'utilisateur (ou /login s'il n'est pas connecté).
 */
export function roleGuard(expectedRole: Role): CanActivateFn {
  return (): boolean | UrlTree => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return router.parseUrl('/login');
    }

    if (authService.role() === expectedRole) {
      return true;
    }

    return router.parseUrl(authService.homePathForRole(authService.role()));
  };
}

/**
 * Guard de redirection "intelligente" pour la route racine et le wildcard :
 * envoie vers le shell du rôle courant si connecté, sinon vers /login.
 */
export const smartRedirectGuard: CanActivateFn = (): UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const target = authService.isAuthenticated()
    ? authService.homePathForRole(authService.role())
    : '/login';

  return router.parseUrl(target);
};
