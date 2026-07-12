import { environment } from '../../environments/environment';

/**
 * Résout une URL média (avatar, logo boutique, photo produit) qu'elle soit
 * absolue (stockage objet R2/S3) ou un chemin legacy relatif (`/uploads/...`).
 * Porté depuis admin-dashboard/shops.component.ts (même convention).
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//i.test(path) ? path : `${environment.apiUrl}${path}`;
}
