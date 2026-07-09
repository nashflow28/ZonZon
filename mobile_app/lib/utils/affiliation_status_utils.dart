import 'package:flutter/material.dart';

class AffiliationStatusUtils {
  const AffiliationStatusUtils._();

  static String label(String? status) {
    switch (status) {
      case 'PENDING':
        return 'Invitation en attente';
      case 'ACTIVE':
        return 'Affiliation active';
      case 'REJECTED':
        return 'Invitation refusée';
      case 'REMOVED':
        return 'Affiliation retirée';
      default:
        return (status == null || status.trim().isEmpty) ? 'Inconnue' : status;
    }
  }

  static Color color(String? status) {
    switch (status) {
      case 'PENDING':
        return const Color(0xFFFF9E1B);
      case 'ACTIVE':
        return const Color(0xFF0FB271);
      case 'REJECTED':
        return const Color(0xFFF0453D);
      case 'REMOVED':
        return const Color(0xFF8FA6AE);
      default:
        return Colors.white54;
    }
  }
}
