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
          import('./client/home/home.component').then((m) => m.ClientHomeComponent),
      },
      {
        path: 'orders',
        data: { title: 'Commandes' },
        loadComponent: () =>
          import('./client/orders/orders.component').then((m) => m.ClientOrdersComponent),
      },
      {
        path: 'orders/:id',
        data: { title: 'Suivi' },
        loadComponent: () =>
          import('./client/order-tracking/order-tracking.component').then(
            (m) => m.ClientOrderTrackingComponent
          ),
      },
      {
        path: 'shops',
        data: { title: 'Boutiques' },
        loadComponent: () =>
          import('./client/shops/shops-list.component').then((m) => m.ClientShopsListComponent),
      },
      {
        path: 'shops/:id',
        data: { title: 'Boutique' },
        loadComponent: () =>
          import('./client/shops/shop-detail.component').then((m) => m.ClientShopDetailComponent),
      },
      {
        path: 'profile',
        data: { title: 'Profil' },
        loadComponent: () =>
          import('./client/profile/profile.component').then((m) => m.ClientProfileComponent),
      },
      {
        path: 'notifications',
        data: { title: 'Notifications' },
        loadComponent: () =>
          import('./client/notifications/notifications.component').then(
            (m) => m.ClientNotificationsComponent
          ),
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
          import('./driver/radar/radar.component').then((m) => m.DriverRadarComponent),
      },
      {
        path: 'my-deliveries',
        data: { title: 'Mes courses' },
        loadComponent: () =>
          import('./driver/my-deliveries/my-deliveries.component').then(
            (m) => m.DriverMyDeliveriesComponent
          ),
      },
      {
        path: 'my-deliveries/:id',
        data: { title: 'Course' },
        loadComponent: () =>
          import('./driver/delivery-detail/delivery-detail.component').then(
            (m) => m.DriverDeliveryDetailComponent
          ),
      },
      {
        path: 'profile',
        data: { title: 'Profil' },
        loadComponent: () =>
          import('./driver/profile/profile.component').then((m) => m.DriverProfileComponent),
      },
      {
        path: 'notifications',
        data: { title: 'Notifications' },
        loadComponent: () =>
          import('./driver/notifications/notifications.component').then(
            (m) => m.DriverNotificationsComponent
          ),
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
