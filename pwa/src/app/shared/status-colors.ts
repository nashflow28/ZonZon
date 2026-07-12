/**
 * Mapping statut → variante de couleur.
 *
 * Porté depuis admin-dashboard/src/app/shared/status-colors.ts — source unique
 * de vérité pour la sémantique des couleurs de statut, partagée avec l'admin
 * et le mobile (Flutter, `AppColors`). NE PAS changer un mapping ici sans
 * vérifier la cohérence côté admin-dashboard et mobile_app.
 *
 * Sémantique générale :
 *   - go    → terminé / livré / payé / validé
 *   - mango → en cours / en route / actif
 *   - sky   → au retrait / info
 *   - coral → annulé / échoué / refusé
 *   - mut   → en attente / neutre / inconnu
 *
 * Usage typique dans un template :
 *   <span [class]="orderStatusPillClass(order.status)">…</span>
 */

export type ZzStatusVariant = 'go' | 'mango' | 'sky' | 'coral' | 'mut';

/** Classe CSS complète ("zz-pill zz-pill--go") pour une variante donnée. */
export function pillClass(variant: ZzStatusVariant): string {
  return `zz-pill zz-pill--${variant}`;
}

const ORDER_STATUS_VARIANTS: Record<string, ZzStatusVariant> = {
  PENDING: 'mut',
  ACCEPTED: 'sky',
  IN_PROGRESS: 'mango',
  EN_ROUTE_PICKUP: 'mango',
  AT_PICKUP: 'sky',
  NEAR_CLIENT: 'mango',
  COMPLETED: 'go',
  CANCELLED: 'coral',
  FAILED: 'coral',
};

export function orderStatusVariant(status: string | undefined | null): ZzStatusVariant {
  if (!status) return 'mut';
  return ORDER_STATUS_VARIANTS[status] ?? 'mut';
}

export function orderStatusPillClass(status: string | undefined | null): string {
  return pillClass(orderStatusVariant(status));
}

const PAYMENT_STATUS_VARIANTS: Record<string, ZzStatusVariant> = {
  UNPAID: 'mut',
  PAY_ON_DELIVERY: 'mango',
  PAID: 'go',
  RECEIVED_BY_MERCHANT: 'go',
  RECEIVED_BY_LIVREUR: 'go',
  CASH_ON_DELIVERY: 'go',
  REFUNDED: 'mut',
};

export function paymentStatusVariant(status: string | undefined | null): ZzStatusVariant {
  if (!status) return 'mut';
  return PAYMENT_STATUS_VARIANTS[status] ?? 'mut';
}

export function paymentStatusPillClass(status: string | undefined | null): string {
  return pillClass(paymentStatusVariant(status));
}
