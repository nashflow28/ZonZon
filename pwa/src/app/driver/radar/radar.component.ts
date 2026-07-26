import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { Order } from '../../shared/models/order.model';
import { OrdersService } from '../../shared/services/orders.service';
import { SocketService } from '../../shared/services/socket.service';
import { DriverService } from '../driver.service';

/**
 * Radar livreur : bandeau de validation (PENDING/REJECTED), toggles
 * disponibilité/visibilité, puis liste des courses PENDING mises à jour en
 * temps réel (`newOrderAvailable` ajoute, `orderAccepted` retire).
 */
@Component({
  selector: 'app-driver-radar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './radar.component.html',
  styleUrl: './radar.component.css',
})
export class DriverRadarComponent implements OnInit, OnDestroy {
  private ordersService = inject(OrdersService);
  private driverService = inject(DriverService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private router = inject(Router);

  readonly user = this.authService.currentUser;

  readonly approvalStatus = computed(() => this.user()?.driverApprovalStatus ?? 'PENDING');
  readonly isApproved = computed(() => this.approvalStatus() === 'APPROVED');
  readonly approvalTitle = computed(() =>
    this.approvalStatus() === 'REJECTED' ? 'Compte refusé' : 'En attente de validation',
  );
  readonly approvalMessage = computed(() => {
    if (this.approvalStatus() === 'REJECTED') {
      const reason = this.user()?.driverRejectionReason;
      return reason
        ? `Votre compte livreur a été refusé. Motif : ${reason}`
        : 'Votre compte livreur a été refusé par un administrateur.';
    }
    return "Votre compte livreur est en attente de validation par un administrateur. Vous pourrez recevoir des courses dès l'approbation.";
  });

  readonly isAvailable = signal(false);
  readonly isPublic = signal(true);
  readonly togglingAvailability = signal(false);
  readonly togglingVisibility = signal(false);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly acceptingId = signal<string | null>(null);
  readonly acceptError = signal<string | null>(null);

  private sub = new Subscription();

  ngOnInit(): void {
    const u = this.user();
    this.isAvailable.set(!!u?.isAvailable);
    this.isPublic.set(u?.isPublic !== false);

    if (this.isApproved()) {
      this.loadIfAvailable();
      this.wireSocket();
    }
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private wireSocket(): void {
    this.sub.add(
      this.socketService.on$<Order>('newOrderAvailable').subscribe((order) => {
        if (!this.isAvailable() || !order?.id) return;
        this.orders.update((list) =>
          list.some((o) => o.id === order.id) ? list : [order, ...list],
        );
      }),
    );
    this.sub.add(
      this.socketService
        .on$<{ orderId: string; livreurId: string }>('orderAccepted')
        .subscribe((evt) => {
          this.orders.update((list) => list.filter((o) => o.id !== evt.orderId));
        }),
    );
    // Resynchronisation HTTP après coupure/reconnexion socket.
    this.sub.add(this.socketService.connected$.subscribe(() => this.loadIfAvailable()));
  }

  private loadIfAvailable(): void {
    if (!this.isAvailable()) {
      this.orders.set([]);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.ordersService.findAvailable().subscribe({
      next: (orders) => {
        this.loading.set(false);
        this.orders.set(orders);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.orders.set([]);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  toggleAvailability(): void {
    if (this.togglingAvailability()) return;
    const next = !this.isAvailable();
    this.togglingAvailability.set(true);
    this.errorMessage.set(null);
    this.driverService.setAvailability(next).subscribe({
      next: (res) => {
        this.togglingAvailability.set(false);
        this.isAvailable.set(res.isAvailable);
        this.authService.patchCurrentUser({ isAvailable: res.isAvailable });
        this.loadIfAvailable();
      },
      error: (err: HttpErrorResponse) => {
        this.togglingAvailability.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  toggleVisibility(): void {
    if (this.togglingVisibility()) return;
    const next = !this.isPublic();
    this.togglingVisibility.set(true);
    this.errorMessage.set(null);
    this.driverService.setVisibility(next).subscribe({
      next: (res) => {
        this.togglingVisibility.set(false);
        this.isPublic.set(res.isPublic);
        this.authService.patchCurrentUser({ isPublic: res.isPublic });
      },
      error: (err: HttpErrorResponse) => {
        this.togglingVisibility.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  accept(order: Order): void {
    if (this.acceptingId()) return;
    this.acceptingId.set(order.id);
    this.acceptError.set(null);
    this.ordersService.accept(order.id).subscribe({
      next: (accepted) => {
        this.acceptingId.set(null);
        this.orders.update((list) => list.filter((o) => o.id !== order.id));
        this.router.navigate(['/driver/my-deliveries', accepted.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.acceptingId.set(null);
        if (err.status === 409) {
          // Déjà prise par un autre livreur : la retirer du radar.
          this.orders.update((list) => list.filter((o) => o.id !== order.id));
        }
        this.acceptError.set(this.extractMessage(err));
      },
    });
  }

  formatDistance(km: number | null): string {
    if (km == null) return '';
    return `${km.toFixed(1)} km`;
  }

  private extractMessage(err: HttpErrorResponse): string {
    const backendMessage = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(backendMessage)) return backendMessage.join(', ');
    if (typeof backendMessage === 'string') return backendMessage;
    if (err.status === 0) return 'Connexion impossible. Vérifiez votre réseau.';
    return 'Une erreur est survenue. Réessayez.';
  }
}
