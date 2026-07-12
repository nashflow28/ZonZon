import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Zone } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class ZonesService {
  private http = inject(HttpClient);

  findActive(): Observable<Zone[]> {
    return this.http.get<Zone[]>(`${environment.apiUrl}${environment.apiPrefix}/zones`);
  }
}
