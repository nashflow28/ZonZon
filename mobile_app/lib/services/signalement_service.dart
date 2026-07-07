import 'dart:convert';

import 'api_client.dart';

/// Service pour le signalement d'un problème (course, utilisateur, livreur,
/// commerçant) auprès du backend (`POST /signalements`).
///
/// Accessible à tout utilisateur authentifié (CLIENT, LIVREUR, COMMERCANT).
class SignalementService {
  final ApiClient _api = ApiClient();

  /// Envoie un signalement.
  ///
  /// [targetType] : `'DELIVERY'` | `'USER'` | `'DRIVER'` | `'MERCHANT'`.
  /// [targetId] : identifiant (uuid) de la cible.
  /// [reason] : motif, 3 à 500 caractères.
  ///
  /// Lève une [Exception] avec un message clair en cas d'échec.
  Future<void> report({
    required String targetType,
    required String targetId,
    required String reason,
  }) async {
    final res = await _api.post(
      '/signalements',
      body: {
        'targetType': targetType,
        'targetId': targetId,
        'reason': reason,
      },
    );

    if (res.statusCode == 200 || res.statusCode == 201) return;

    throw Exception(_extractError(res));
  }

  String _extractError(dynamic res) {
    try {
      final data = jsonDecode(res.body);
      if (data is Map && data['message'] != null) {
        final msg = data['message'];
        if (msg is List) return msg.join(', ');
        return msg.toString();
      }
    } catch (_) {}
    return 'Erreur ${res.statusCode}';
  }
}
