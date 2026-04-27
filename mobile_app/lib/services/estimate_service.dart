import 'dart:async';
import 'dart:convert';

import 'package:latlong2/latlong.dart';

import 'api_client.dart';

/// Résultat d'une estimation OSRM côté backend (`POST /orders/estimate`).
class EstimateResult {
  final double km;
  final int priceFcfa;
  final List<LatLng> polyline;

  const EstimateResult({
    required this.km,
    required this.priceFcfa,
    required this.polyline,
  });
}

/// Encapsule l'appel à `/orders/estimate` avec un debounce 500 ms partagé.
///
/// Utilisation typique :
/// ```dart
/// final svc = EstimateService();
/// svc.scheduleEstimate(
///   lat1: a.latitude, lng1: a.longitude,
///   lat2: b.latitude, lng2: b.longitude,
///   onResult: (r) => setState(() { ... }),
///   onLoading: (l) => setState(() => loading = l),
/// );
/// ```
///
/// L'API exposée propose deux variantes :
/// - [estimate] : appel immédiat, renvoie un `Future<EstimateResult?>`.
/// - [scheduleEstimate] : pose un debounce 500 ms, idéal pour réagir à
///   des changements de saisie rapides (les appels successifs annulent le
///   précédent).
class EstimateService {
  EstimateService({ApiClient? api, Duration debounceDelay = const Duration(milliseconds: 500)})
      : _api = api ?? ApiClient(),
        _debounceDelay = debounceDelay;

  final ApiClient _api;
  final Duration _debounceDelay;
  Timer? _debounce;

  /// Annule un debounce en cours s'il existe.
  void cancel() {
    _debounce?.cancel();
    _debounce = null;
  }

  /// Programme un appel `/orders/estimate` après [_debounceDelay].
  /// [onLoading] est appelé immédiatement avec `true`, puis `false` quand
  /// la requête se termine (succès ou échec).
  void scheduleEstimate({
    required double lat1,
    required double lng1,
    required double lat2,
    required double lng2,
    required void Function(EstimateResult? result) onResult,
    void Function(bool loading)? onLoading,
  }) {
    _debounce?.cancel();
    onLoading?.call(true);
    _debounce = Timer(_debounceDelay, () async {
      final res = await estimate(lat1: lat1, lng1: lng1, lat2: lat2, lng2: lng2);
      onResult(res);
      onLoading?.call(false);
    });
  }

  /// Appel direct (sans debounce) à `/orders/estimate`.
  /// Renvoie `null` si la requête échoue ou retourne un statut non-2xx.
  Future<EstimateResult?> estimate({
    required double lat1,
    required double lng1,
    required double lat2,
    required double lng2,
  }) async {
    try {
      final res = await _api.post('/orders/estimate', body: {
        'pickupLat': lat1,
        'pickupLng': lng1,
        'deliveryLat': lat2,
        'deliveryLng': lng2,
      });
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final km = (data['distanceKm'] as num?)?.toDouble() ?? 0;
      final price = (data['priceFcfa'] as num?)?.toInt() ?? 0;
      final polyRaw = data['polyline'] as List?;
      final poly = <LatLng>[];
      if (polyRaw != null) {
        for (final p in polyRaw) {
          if (p is List && p.length == 2 && p[0] is num && p[1] is num) {
            poly.add(
              LatLng((p[0] as num).toDouble(), (p[1] as num).toDouble()),
            );
          }
        }
      }
      return EstimateResult(km: km, priceFcfa: price, polyline: poly);
    } catch (_) {
      return null;
    }
  }

  void dispose() {
    cancel();
  }
}
