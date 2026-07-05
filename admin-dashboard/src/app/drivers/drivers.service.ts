import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DriverVehicle {
  type: string;
  licensePlate?: string;
  description?: string;
}

export interface PendingDriver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  driverApprovalStatus: DriverApprovalStatus;
  isAvailable: boolean;
  driverRejectionReason?: string | null;
  vehicle?: DriverVehicle | null;
  profilePhotoUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DriversService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}${environment.apiPrefix}/users`;

  getPendingDrivers(): Observable<PendingDriver[]> {
    return this.http.get<PendingDriver[]>(`${this.baseUrl}/drivers/pending`);
  }

  approveDriver(id: string): Observable<PendingDriver> {
    return this.http.patch<PendingDriver>(`${this.baseUrl}/${id}/driver-approval`, {
      status: 'APPROVED'
    });
  }

  rejectDriver(id: string, reason?: string): Observable<PendingDriver> {
    return this.http.patch<PendingDriver>(`${this.baseUrl}/${id}/driver-approval`, {
      status: 'REJECTED',
      reason
    });
  }
}
