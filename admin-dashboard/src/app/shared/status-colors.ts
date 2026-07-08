/**
 * Pièce signature « Direction A » — mapping statut → variante de couleur.
 *
 * Source unique de vérité pour la sémantique des couleurs de statut côté
 * admin. Les variantes (`go`, `mango`, `sky`, `coral`, `mut`) correspondent
 * aux classes CSS `.zz-pill--go|--mango|--sky|--coral|--mut` définies dans
 * `src/styles.css`, elles-mêmes basées sur les tokens `--zz-go/--zz-mango/
 * --zz-sky/--zz-coral/--zz-mut`. Cette même sémantique est partagée avec le
 * mobile (Flutter, `AppColors`) : NE PAS changer un mapping ici sans vérifier
 * la cohérence côté mobile_app.
 *
 * Sémantique générale :
 *   - go    → terminé / livré / payé / validé
 *   - mango → en cours / en route / actif
 *   - sky   → au retrait / info
 *   - coral → annulé / échoué / refusé
 *   - mut   → en attente / neutre / inconnu
 *
 * Usage typique dans un template :
 *   <span class="zz-pill" [ngClass]="'zz-pill--' + statusVariant(status)">…</span>
 */

export type ZzStatusVariant = 'go' | 'mango' | 'sky' | 'coral' | 'mut';

/** Classe Tailwind/CSS complète ("zz-pill zz-pill--go") pour une variante donnée. */
export function pillClass(variant: ZzStatusVariant): string {
  return `zz-pill zz-pill--${variant}`;
}

/**
 * Statuts de commande (Order.status), y compris les statuts intermédiaires
 * de suivi temps réel du livreur (EN_ROUTE_PICKUP, AT_PICKUP, NEAR_CLIENT)
 * et FAILED.
 */
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

/** Variante de couleur pour un statut de commande. */
export function orderStatusVariant(status: string | undefined | null): ZzStatusVariant {
  if (!status) return 'mut';
  return ORDER_STATUS_VARIANTS[status] ?? 'mut';
}

/** Classe CSS complète pour un statut de commande. */
export function orderStatusPillClass(status: string | undefined | null): string {
  return pillClass(orderStatusVariant(status));
}

/**
 * Statuts de paiement (Order.paymentStatus).
 */
const PAYMENT_STATUS_VARIANTS: Record<string, ZzStatusVariant> = {
  UNPAID: 'mut',
  PAY_ON_DELIVERY: 'mango',
  PAID: 'go',
  RECEIVED_BY_MERCHANT: 'go',
  RECEIVED_BY_LIVREUR: 'go',
};

/** Variante de couleur pour un statut de paiement. */
export function paymentStatusVariant(status: string | undefined | null): ZzStatusVariant {
  if (!status) return 'mut';
  return PAYMENT_STATUS_VARIANTS[status] ?? 'mut';
}

/** Classe CSS complète pour un statut de paiement. */
export function paymentStatusPillClass(status: string | undefined | null): string {
  return pillClass(paymentStatusVariant(status));
}

/**
 * Statuts de signalement (Signalement.status).
 */
const SIGNALEMENT_STATUS_VARIANTS: Record<string, ZzStatusVariant> = {
  OPEN: 'mango',
  REVIEWED: 'sky',
  RESOLVED: 'go',
  DISMISSED: 'mut',
};

/** Variante de couleur pour un statut de signalement. */
export function signalementStatusVariant(status: string | undefined | null): ZzStatusVariant {
  if (!status) return 'mut';
  return SIGNALEMENT_STATUS_VARIANTS[status] ?? 'mut';
}

/** Classe CSS complète pour un statut de signalement. */
export function signalementStatusPillClass(status: string | undefined | null): string {
  return pillClass(signalementStatusVariant(status));
}
