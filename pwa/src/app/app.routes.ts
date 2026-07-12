import { Routes } from '@angular/router';
import { authGuard, roleGuard, smartRedirectGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'client',
    canActivate: [authGuard, roleGuard('CLIENT')],
    loadComponent: () =>
      import('./shells/client/client-shell.component').then((m) => m.ClientShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        data: { title: 'Accueil' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'orders',
        data: { title: 'Commandes' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'shops',
        data: { title: 'Boutiques' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'profile',
        data: { title: 'Profil' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
    ],
  },
  {
    path: 'driver',
    canActivate: [authGuard, roleGuard('LIVREUR')],
    loadComponent: () =>
      import('./shells/driver/driver-shell.component').then((m) => m.DriverShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'radar' },
      {
        path: 'radar',
        data: { title: 'Radar' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'my-deliveries',
        data: { title: 'Mes courses' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'profile',
        data: { title: 'Profil' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
    ],
  },
  {
    path: 'merchant',
    canActivate: [authGuard, roleGuard('COMMERCANT')],
    loadComponent: () =>
      import('./shells/merchant/merchant-shell.component').then((m) => m.MerchantShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'deliveries' },
      {
        path: 'deliveries',
        data: { title: 'Livraisons' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'create',
        data: { title: 'Créer' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'drivers',
        data: { title: 'Livreurs' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
      {
        path: 'profile',
        data: { title: 'Profil' },
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
    ],
  },
  { path: '', pathMatch: 'full', canActivate: [smartRedirectGuard], children: [] },
  { path: '**', canActivate: [smartRedirectGuard], children: [] },
];
