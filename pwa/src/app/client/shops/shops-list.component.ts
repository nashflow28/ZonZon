import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Shop, ShopCategory, ShopCategoryOption } from '../../shared/models/shop.model';
import { ShopsService } from '../../shared/services/shops.service';
import { mediaUrl } from '../../shared/media-url';

/** Liste des boutiques approuvées, filtrable par catégorie (GET /shops). */
@Component({
  selector: 'app-client-shops-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shops-list.component.html',
  styleUrl: './shops-list.component.css',
})
export class ClientShopsListComponent implements OnInit {
  private shopsService = inject(ShopsService);
  private router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly shops = signal<Shop[]>([]);
  readonly categories = signal<ShopCategoryOption[]>([]);
  readonly selectedCategory = signal<ShopCategory | null>(null);

  ngOnInit(): void {
    this.shopsService.categories().subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => {
        /* pas bloquant : la liste sans filtre reste utilisable */
      },
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.shopsService.list(this.selectedCategory()).subscribe({
      next: (shops) => {
        this.shops.set(shops);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les boutiques.');
      },
    });
  }

  selectCategory(category: ShopCategory | null): void {
    this.selectedCategory.set(category);
    this.load();
  }

  open(shop: Shop): void {
    this.router.navigate(['/client/shops', shop.id]);
  }

  logoSrc(shop: Shop): string | null {
    return mediaUrl(shop.logoUrl);
  }
}
