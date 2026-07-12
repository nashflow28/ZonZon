import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../../shared/models/order.model';
import { NotificationsService } from '../../shared/services/notifications.service';

/** Centre de notifications : liste paginée + marquer lu + navigation vers une course liée. */
@Component({
  selector: 'app-client-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
})
export class ClientNotificationsComponent implements OnInit {
  private notificationsService = inject(NotificationsService);
  private router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly notifications = signal<AppNotification[]>([]);
  readonly hasMore = signal(false);
  private page = 1;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.page = 1;
    this.notificationsService.list(this.page, 20).subscribe({
      next: (res) => {
        this.notifications.set(res.items);
        this.hasMore.set(res.hasMore);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les notifications.');
      },
    });
  }

  loadMore(): void {
    this.page += 1;
    this.notificationsService.list(this.page, 20).subscribe({
      next: (res) => {
        this.notifications.update((list) => [...list, ...res.items]);
        this.hasMore.set(res.hasMore);
      },
    });
  }

  markAllRead(): void {
    this.notificationsService.markAllRead().subscribe(() => {
      this.notifications.update((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    });
  }

  open(notification: AppNotification): void {
    if (!notification.readAt) {
      this.notificationsService.markRead(notification.id).subscribe(() => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
      });
    }
    if (notification.deliveryId) {
      this.router.navigate(['/client/orders', notification.deliveryId]);
    }
  }
}
