import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserVehicle {
  type: string;
  licensePlate?: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  profilePhotoUrl?: string;
  vehicle?: UserVehicle;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/users`;

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl);
  }
}
