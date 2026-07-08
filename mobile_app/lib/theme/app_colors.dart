import 'package:flutter/material.dart';

/// Palette « Direction A — Évolution » de Zonzon.
///
/// Thème sombre conservé mais réchauffé au teal, avec une couleur signature
/// verte (« GO-nzon ») et un accent mangue pour l'état actif/en route.
///
/// ⚠️ Ces valeurs sont PARTAGÉES avec le dashboard admin Angular
/// (`admin-dashboard/src/styles.css`, variables `--zz-*`). Toute évolution de
/// teinte doit rester cohérente des deux côtés.
class AppColors {
  AppColors._();

  // Surfaces
  /// Fond d'application (ex-`#0F172A`, réchauffé au teal).
  static const Color bg = Color(0xFF0C1A22);

  /// Fond des cartes / conteneurs (ex-`#1E293B`).
  static const Color card = Color(0xFF122530);

  /// Bordures et séparateurs discrets.
  static const Color line = Color(0xFF24404C);

  // Couleurs de marque / sémantiques
  /// Vert signature : disponible, livré, succès, validé (ex-`#10B981`).
  static const Color go = Color(0xFF0FB271);

  /// Mangue : état actif / en route / en cours (ex-`#F59E0B`).
  static const Color mango = Color(0xFFFF9E1B);

  /// Bleu : information, suivi, actions secondaires (ex-`#0EA5E9`/`#3B82F6`).
  static const Color sky = Color(0xFF2E90FA);

  /// Corail : annulé, échoué, danger (ex-`#EF4444`).
  static const Color coral = Color(0xFFF0453D);

  // Texte
  /// Texte principal sur fond sombre.
  static const Color textHi = Color(0xFFEAF2F0);

  /// Texte secondaire / libellés atténués.
  static const Color textMut = Color(0xFF8FA6AE);
}
