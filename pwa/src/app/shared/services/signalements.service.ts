import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SignalementsService {
  private http = inject(HttpClient);

  create(payload: {
    targetType: 'DELIVERY' | 'USER';
    targetId: string;
    reason: string;
  }): Observable<unknown> {
    return this.http.post(
      `${environment.apiUrl}${environment.apiPrefix}/signalements`,
      payload
    );
  }
}
