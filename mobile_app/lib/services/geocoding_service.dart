import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import '../models/place.dart';

/// Wrapper sur l'API Nominatim (OpenStreetMap).
///
/// Politique d'usage Nominatim : 1 req/s max, User-Agent obligatoire.
/// On debounce les recherches côté UI (350 ms) et on coupe en local
/// les requêtes < 3 caractères.
class GeocodingService {
  static const _base = 'https://nominatim.openstreetmap.org';
  static const _userAgent = 'ZonZon/1.0 (delivery app, Togo)';
  static const _countryCodes = 'tg';

  /// Recherche d'adresses par texte (forward geocoding).
  /// Retourne au max 6 résultats pertinents pour le Togo.
  Future<List<Place>> search(String query) async {
    final q = query.trim();
    if (q.length < 3) return [];

    final uri = Uri.parse('$_base/search').replace(queryParameters: {
      'q': q,
      'format': 'json',
      'addressdetails': '1',
      'countrycodes': _countryCodes,
      'limit': '6',
      'accept-language': 'fr',
    });

    try {
      final res = await http
          .get(uri, headers: {'User-Agent': _userAgent})
          .timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(Place.fromNominatim)
          .toList();
    } on TimeoutException {
      return [];
    } catch (_) {
      return [];
    }
  }

  /// Reverse geocoding : (lat, lng) → adresse lisible.
  Future<Place?> reverse(LatLng point) async {
    final uri = Uri.parse('$_base/reverse').replace(queryParameters: {
      'lat': point.latitude.toString(),
      'lon': point.longitude.toString(),
      'format': 'json',
      'addressdetails': '1',
      'accept-language': 'fr',
      'zoom': '18',
    });
    try {
      final res = await http
          .get(uri, headers: {'User-Agent': _userAgent})
          .timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      if (data is! Map<String, dynamic>) return null;
      return Place.fromNominatim(data);
    } on TimeoutException {
      return null;
    } catch (_) {
      return null;
    }
  }
}
