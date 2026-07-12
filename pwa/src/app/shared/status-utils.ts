/**
 * Libellés FR statut commande / paiement — porté depuis
 * mobile_app/lib/utils/order_status_utils.dart (source de vérité des libellés,
 * gardée synchronisée entre PWA/Flutter). Les couleurs de pill restent dans
 * `status-colors.ts` (partagé avec admin-dashboard).
 */

export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING':
      return 'En attente';
    case 'ACCEPTED':
      return 'Acceptée';
    case 'EN_ROUTE_PICKUP':
      return 'En route vers le retrait';
    case 'AT_PICKUP':
      return 'Arrivé au point de retrait';
    case 'IN_PROGRESS':
      return 'En cours';
    case 'NEAR_CLIENT':
      return 'Proche du client';
    case 'COMPLETED':
      return 'Terminée';
    case 'CANCELLED':
      return 'Annulée';
    case 'FAILED':
      return 'Échec';
    default:
      return !status || !status.trim() ? 'Inconnu' : status;
  }
}

/** Libellé plus descriptif pour l'en-tête de l'écran de suivi. */
export function statusLongLabel(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING':
      return "En attente d'un livreur";
    case 'ACCEPTED':
      return 'Livreur en route vers le pickup';
    case 'EN_ROUTE_PICKUP':
      return 'Livreur en route vers le retrait';
    case 'AT_PICKUP':
      return 'Livreur arrivé au point de retrait';
    case 'IN_PROGRESS':
      return 'En cours de livraison';
    case 'NEAR_CLIENT':
      return 'Livreur proche de vous';
    case 'COMPLETED':
      return 'Terminée';
    case 'CANCELLED':
      return 'Annulée';
    case 'FAILED':
      return 'Échec de la livraison';
    default:
      return !status || !status.trim() ? 'Suivi de la course' : status;
  }
}

export function paymentLabel(status: string | null | undefined): string {
  switch (status) {
    case 'UNPAID':
      return 'Non payé';
    case 'PAID':
      return 'Payé';
    case 'PAY_ON_DELIVERY':
      return 'À la livraison';
    case 'RECEIVED_BY_MERCHANT':
      return 'Reçu (commerçant)';
    case 'RECEIVED_BY_LIVREUR':
      return 'Reçu (livreur)';
    case 'CASH_ON_DELIVERY':
      return 'Payé à la livraison';
    case 'REFUNDED':
      return 'Remboursé';
    default:
      return !status || !status.trim() ? 'Statut de paiement inconnu' : status;
  }
}

/** Un paiement réglé ne doit plus proposer d'action de confirmation. */
export function isPaymentSettled(status: string | null | undefined): boolean {
  return !!status &&
    ['PAID', 'RECEIVED_BY_LIVREUR', 'RECEIVED_BY_MERCHANT', 'CASH_ON_DELIVERY', 'REFUNDED'].includes(
      status
    );
}
