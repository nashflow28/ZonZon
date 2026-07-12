import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Shop, ShopCategory, ShopCategoryOption } from '../models/shop.model';

const BASE = `${environment.apiUrl}${environment.apiPrefix}/shops`;

@Injectable({ providedIn: 'root' })
export class ShopsService {
  private http = inject(HttpClient);

  list(category?: ShopCategory | null): Observable<Shop[]> {
    let url = BASE;
    if (category) url += `?category=${encodeURIComponent(category)}`;
    return this.http.get<Shop[]>(url);
  }

  categories(): Observable<ShopCategoryOption[]> {
    return this.http.get<ShopCategoryOption[]>(`${BASE}/categories`);
  }

  getOne(id: string): Observable<Shop> {
    return this.http.get<Shop>(`${BASE}/${id}`);
  }
}
