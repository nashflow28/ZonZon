import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientOrderDraftService } from '../client-order-draft.service';
import { mediaUrl } from '../../shared/media-url';
import { Shop } from '../../shared/models/shop.model';
import { ShopsService } from '../../shared/services/shops.service';

/** Détail boutique + produits (GET /shops/:id) et pont vers l'Accueil. */
@Component({
  selector: 'app-client-shop-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shop-detail.component.html',
  styleUrl: './shop-detail.component.css',
})
export class ClientShopDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private shopsService = inject(ShopsService);
  private draftService = inject(ClientOrderDraftService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly shop = signal<Shop | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.shopsService.getOne(id).subscribe({
      next: (shop) => {
        this.shop.set(shop);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger cette boutique.');
      },
    });
  }

  logoSrc(): string | null {
    return mediaUrl(this.shop()?.logoUrl);
  }

  productPhotoSrc(photoUrl: string | null | undefined): string | null {
    return mediaUrl(photoUrl);
  }

  orderFromShop(): void {
    const shop = this.shop();
    if (!shop) return;
    this.draftService.setPendingPickup({
      address: shop.name + (shop.address ? ' — ' + shop.address : ''),
      lat: shop.lat,
      lng: shop.lng,
    });
    this.router.navigate(['/client/home']);
  }
}
