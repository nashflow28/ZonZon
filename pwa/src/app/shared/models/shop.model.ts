/** Modèles boutique/produit — voir backend/src/entities/shop.entity.ts et product.entity.ts. */

export type ShopCategory =
  | 'RESTAURANT'
  | 'SUPERMARKET'
  | 'BAKERY'
  | 'PHARMACY'
  | 'FASHION'
  | 'ELECTRONICS'
  | 'BEAUTY'
  | 'HARDWARE'
  | 'BOOKS'
  | 'OTHER';

export interface ShopCategoryOption {
  value: ShopCategory;
  label: string;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  description?: string | null;
  priceFcfa: number;
  photoUrl?: string | null;
  available: boolean;
}

export interface Shop {
  id: string;
  ownerId: string;
  name: string;
  category: ShopCategory;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  description?: string | null;
  address: string;
  lat: number;
  lng: number;
  logoUrl?: string | null;
  phone?: string | null;
  hours?: string | null;
  products?: Product[];
}
