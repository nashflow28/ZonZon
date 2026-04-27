import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface Order {
  id: string;
  pickupAddress: string;
  deliveryAddress: string;
  description: string;
  distanceKm: number;
  priceFcfa: number;
  status: string;
  createdAt: string;
  client: any;
  livreur?: any;
}

@Injectable({
  providedIn: 'root'
})
export class OrdersService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/orders`;

  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(this.apiUrl);
  }
}
