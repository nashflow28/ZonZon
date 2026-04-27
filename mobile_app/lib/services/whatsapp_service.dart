import 'package:url_launcher/url_launcher.dart';

/// Helper centralisé pour ouvrir WhatsApp via deeplink (wa.me).
///
/// - Nettoie le numéro (enlève espaces, tirets, parenthèses, et le `+`).
/// - Ajoute un préfixe pays par défaut (Togo `228`) si le numéro local
///   ne commence pas déjà par un indicatif (heuristique : longueur ≤ 9 chiffres).
/// - Ouvre l'app WhatsApp si possible, sinon fallback `tel:`.
class WhatsappService {
  static Future<void> openChat({
    required String phone,
    required String message,
    String defaultCountryCode = '228',
  }) async {
    final normalized = _normalize(phone, defaultCountryCode);
    if (normalized.isEmpty) return;

    final waUri = Uri.parse(
      'https://wa.me/$normalized?text=${Uri.encodeComponent(message)}',
    );

    try {
      final canOpen = await canLaunchUrl(waUri);
      if (canOpen) {
        final ok = await launchUrl(
          waUri,
          mode: LaunchMode.externalApplication,
        );
        if (ok) return;
      }
    } catch (_) {
      // On bascule en fallback ci-dessous
    }

    // Fallback : appel téléphonique direct
    final telUri = Uri.parse('tel:$normalized');
    try {
      await launchUrl(telUri);
    } catch (_) {
      // silencieux : rien d'utile à faire si ça échoue aussi
    }
  }

  /// Nettoie un numéro pour le format e164 sans `+`.
  /// - retire espaces, tirets, points, parenthèses
  /// - retire un éventuel `+` en tête
  /// - si le numéro est court (≤ 9 chiffres → numéro local), préfixe avec
  ///   `defaultCountryCode`
  static String _normalize(String raw, String defaultCountryCode) {
    var s = raw.trim();
    if (s.isEmpty) return '';
    // Garde seulement les chiffres et le `+` initial
    final hasPlus = s.startsWith('+');
    s = s.replaceAll(RegExp(r'[^0-9]'), '');
    if (s.isEmpty) return '';

    if (hasPlus) {
      // déjà international, on retire juste le +
      return s;
    }

    // Si le numéro est local (≤ 9 chiffres, typiquement 8 au Togo),
    // on préfixe avec l'indicatif pays par défaut.
    if (s.length <= 9) {
      // Évite double indicatif si l'utilisateur a déjà tapé "228..."
      if (s.startsWith(defaultCountryCode)) return s;
      return '$defaultCountryCode$s';
    }

    return s;
  }
}
