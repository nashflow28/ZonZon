import 'dart:convert';

import 'api_client.dart';

/// Résultat d'un appel `GET /orders/:id/eta` côté backend.
///
/// Le backend renvoie :
///   - `distanceKm` : distance livreur → cible (pickup ou delivery selon le
///     statut), via Haversine. `null` si non disponible.
///   - `etaMinutes` : durée estimée en minutes (vitesse moyenne 25 km/h en
///     ville à Lomé). `null` si non disponible.
///   - `basedOn` : source de la position du livreur :
///       - `'driver_position'` : position fraîche (< 5 min) — ETA fiable.
///       - `'pickup'` : fallback (pas de position fraîche, course IN_PROGRESS,
///         on suppose le livreur encore au pickup) — ETA approximatif.
///       - `'unavailable'` : ETA non calculable (course pas en route ou
///         données manquantes).
class EtaResult {
  final double? distanceKm;
  final int? etaMinutes;
  final String basedOn;
  final DateTime fetchedAt;

  EtaResult({
    this.distanceKm,
    this.etaMinutes,
    required this.basedOn,
    required this.fetchedAt,
  });

  bool get isAvailable => etaMinutes != null;

  /// Indique si l'ETA est en mode fallback (position pas fraîche, on a
  /// supposé que le livreur était au pickup). À afficher en grisé / avec
  /// un warning visuel léger côté UI.
  bool get isFallback => basedOn == 'pickup';
}

/// Client HTTP pour l'endpoint ETA.
///
/// Utilisation typique côté `OrderScreen` :
///   - Appel toutes les 30 s tant que la course est ACCEPTED ou IN_PROGRESS.
///   - Refresh immédiat à chaque réception d'un évènement `driver:location`
///     (la position vient d'évoluer, l'ETA aussi probablement).
class EtaService {
  EtaService({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  /// Renvoie `null` si la requête échoue ou retourne un statut non-2xx.
  /// Les erreurs sont silencieuses : un échec d'ETA ne doit pas bloquer
  /// le suivi de la course.
  Future<EtaResult?> fetchEta(String orderId) async {
    try {
      final res = await _api.get('/orders/$orderId/eta');
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      return EtaResult(
        distanceKm: (data['distanceKm'] as num?)?.toDouble(),
        etaMinutes: (data['etaMinutes'] as num?)?.toInt(),
        basedOn: data['basedOn']?.toString() ?? 'unavailable',
        fetchedAt: DateTime.now(),
      );
    } catch (_) {
      return null;
    }
  }
}
