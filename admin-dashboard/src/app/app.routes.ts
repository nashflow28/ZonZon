import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./layout/main-layout.component').then(m => m.MainLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'archives',
        loadComponent: () => import('./archives/archives.component').then(m => m.ArchivesComponent)
      },
      {
        path: 'shops',
        loadComponent: () => import('./shops/shops.component').then(m => m.ShopsComponent)
      },
      {
        path: 'audit-logs',
        loadComponent: () => import('./audit-logs/audit-logs.component').then(m => m.AuditLogsComponent)
      },
      {
        path: 'driver-validation',
        loadComponent: () => import('./drivers/driver-validation/driver-validation.component').then(m => m.DriverValidationComponent)
      },
      {
        path: 'pricing',
        loadComponent: () => import('./pricing/pricing.component').then(m => m.PricingComponent)
      },
      {
        path: 'zones',
        loadComponent: () => import('./zones/zones.component').then(m => m.ZonesComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
