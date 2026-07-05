import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Pricing {
  id: string;
  pricePerKm: number;
  minPriceFcfa: number;
  updatedAt: string;
}

export interface UpdatePricingDto {
  pricePerKm?: number;
  minPriceFcfa?: number;
}

@Injectable({ providedIn: 'root' })
export class PricingService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}${environment.apiPrefix}/admin/pricing`;

  getPricing(): Observable<Pricing> {
    return this.http.get<Pricing>(this.base);
  }

  updatePricing(dto: UpdatePricingDto): Observable<Pricing> {
    return this.http.patch<Pricing>(this.base, dto);
  }
}
