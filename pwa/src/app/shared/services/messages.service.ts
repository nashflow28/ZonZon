import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatMessage } from '../models/order.model';

/** Messagerie par livraison — réutilisable client/livreur/commerçant. */
@Injectable({ providedIn: 'root' })
export class MessagesService {
  private http = inject(HttpClient);

  private base(orderId: string): string {
    return `${environment.apiUrl}${environment.apiPrefix}/orders/${orderId}/messages`;
  }

  list(orderId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(this.base(orderId));
  }

  send(orderId: string, content: string, type?: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(this.base(orderId), { content, type });
  }

  markRead(orderId: string): Observable<unknown> {
    return this.http.patch(`${this.base(orderId)}/read`, {});
  }
}
