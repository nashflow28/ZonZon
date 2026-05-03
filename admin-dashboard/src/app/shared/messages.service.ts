import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string | null;
  sender?: { firstName?: string; lastName?: string; role?: string } | null;
  type: 'TEXT' | 'QUICK_REPLY' | 'SYSTEM';
  content: string;
  createdAt: string;
  readAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class MessagesService {
  private http = inject(HttpClient);

  list(orderId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(
      `${environment.apiUrl}${environment.apiPrefix}/orders/${orderId}/messages`,
    );
  }
}
