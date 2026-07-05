import 'package:flutter/material.dart';

/// Mapping centralisé `status → libellé FR` pour toutes les commandes.
///
/// Couvre le cycle de vie complet (y compris les statuts fins introduits pour
/// le suivi livreur granulaire) :
/// `PENDING`, `ACCEPTED`, `EN_ROUTE_PICKUP`, `AT_PICKUP`, `IN_PROGRESS`,
/// `NEAR_CLIENT`, `COMPLETED`, `CANCELLED`, `FAILED`.
///
/// Utilisé côté livreur (dialog de course active, historique) et côté client
/// (suivi de commande, historique) pour éviter toute divergence de libellés
/// entre les deux apps. Un statut inconnu ne casse jamais l'UI : on retombe
/// sur le code brut du statut (fallback lisible) plutôt que de lever une
/// exception ou d'afficher une chaîne vide.
class OrderStatusUtils {
  const OrderStatusUtils._();

  /// Libellé FR court, utilisé pour les pills/badges et les listes.
  static String label(String? status) {
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
        // Fallback lisible : le code brut plutôt qu'une UI cassée/vide.
        return (status == null || status.trim().isEmpty) ? 'Inconnu' : status;
    }
  }

  /// Libellé FR plus descriptif, utilisé dans les en-têtes de suivi
  /// (ex. `OrderTrackingScreen`) où on veut une phrase complète plutôt
  /// qu'un simple mot-état.
  static String longLabel(String? status) {
    switch (status) {
      case 'PENDING':
        return 'En attente d’un livreur';
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
        return (status == null || status.trim().isEmpty)
            ? 'Suivi de la course'
            : status;
    }
  }

  /// Couleur associée à chaque statut (pour pills/badges).
  static Color color(String? status) {
    switch (status) {
      case 'PENDING':
        return const Color(0xFFEAB308);
      case 'ACCEPTED':
        return const Color(0xFF3B82F6);
      case 'EN_ROUTE_PICKUP':
        return const Color(0xFF0EA5E9);
      case 'AT_PICKUP':
        return const Color(0xFF6366F1);
      case 'IN_PROGRESS':
        return const Color(0xFFA855F7);
      case 'NEAR_CLIENT':
        return const Color(0xFFF97316);
      case 'COMPLETED':
        return const Color(0xFF10B981);
      case 'CANCELLED':
        return const Color(0xFFEF4444);
      case 'FAILED':
        return const Color(0xFFDC2626);
      default:
        return Colors.white54;
    }
  }
}

/// Mapping centralisé `paymentStatus → libellé FR`, pour badge de paiement.
class PaymentStatusUtils {
  const PaymentStatusUtils._();

  static String label(String? status) {
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
      default:
        return (status == null || status.trim().isEmpty)
            ? 'Statut de paiement inconnu'
            : status;
    }
  }

  static Color color(String? status) {
    switch (status) {
      case 'UNPAID':
        return const Color(0xFFEF4444);
      case 'PAID':
        return const Color(0xFF10B981);
      case 'PAY_ON_DELIVERY':
        return const Color(0xFFEAB308);
      case 'RECEIVED_BY_MERCHANT':
        return const Color(0xFF0EA5E9);
      case 'RECEIVED_BY_LIVREUR':
        return const Color(0xFF10B981);
      default:
        return Colors.white54;
    }
  }
}
