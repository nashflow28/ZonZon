import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import '../models/place.dart';

/// Autocomplétion via Photon, avec Nominatim comme solution de secours.
///
/// Politique d'usage Nominatim : 1 req/s max, User-Agent obligatoire.
/// L'interface temporise les recherches et les déclenche dès 2 caractères.
class GeocodingService {
  GeocodingService({http.Client? client}) : _client = client ?? http.Client();

  static const _base = 'https://nominatim.openstreetmap.org';
  static const _photonBase = 'https://photon.komoot.io/api/';
  static const _userAgent = 'ZonZon/1.0 (delivery app, Togo)';
  static const _countryCodes = 'tg';
  final http.Client _client;

  /// Recherche d'adresses par texte (forward geocoding).
  /// Retourne au maximum 8 résultats pertinents pour le Togo.
  Future<List<Place>> search(String query) async {
    final q = query.trim();
    if (q.length < 2) return [];

    final photon = await _searchPhoton(q);
    if (photon.isNotEmpty) return photon;

    return _searchNominatim(q);
  }

  Future<List<Place>> _searchPhoton(String query) async {
    final uri = Uri.parse(_photonBase).replace(
      queryParameters: {
        'q': query,
        'limit': '12',
        'lang': 'fr',
        'lat': '6.1319',
        'lon': '1.2228',
      },
    );

    try {
      final res = await _client
          .get(uri, headers: {'User-Agent': _userAgent})
          .timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! Map || data['features'] is! List) return [];
      final normalizedQuery = _normalize(query);
      final places = (data['features'] as List)
          .whereType<Map>()
          .where((feature) {
            final properties = feature['properties'];
            return properties is Map &&
                properties['countrycode']?.toString().toUpperCase() == 'TG';
          })
          .map(
            (feature) => Place.fromPhoton(Map<String, dynamic>.from(feature)),
          )
          .where(
            (place) =>
                place.location.latitude != 0 && place.location.longitude != 0,
          )
          .toList();
      places.sort((a, b) {
        final aPrefix = _normalize(a.shortName).startsWith(normalizedQuery);
        final bPrefix = _normalize(b.shortName).startsWith(normalizedQuery);
        if (aPrefix != bPrefix) return aPrefix ? -1 : 1;
        return a.shortName.compareTo(b.shortName);
      });
      final seen = <String>{};
      return places
          .where(
            (place) => seen.add(
              '${_normalize(place.shortName)}|${place.location.latitude.toStringAsFixed(4)}|${place.location.longitude.toStringAsFixed(4)}',
            ),
          )
          .take(8)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<Place>> _searchNominatim(String q) async {
    final uri = Uri.parse('$_base/search').replace(
      queryParameters: {
        'q': q,
        'format': 'json',
        'addressdetails': '1',
        'countrycodes': _countryCodes,
        'limit': '6',
        'accept-language': 'fr',
      },
    );

    try {
      final res = await _client
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

  static String _normalize(String value) => value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp('[éèêë]'), 'e')
      .replaceAll(RegExp('[àâä]'), 'a')
      .replaceAll(RegExp('[îï]'), 'i')
      .replaceAll(RegExp('[ôö]'), 'o')
      .replaceAll(RegExp('[ùûü]'), 'u')
      .replaceAll('ç', 'c');

  /// Reverse geocoding : (lat, lng) → adresse lisible.
  Future<Place?> reverse(LatLng point) async {
    final uri = Uri.parse('$_base/reverse').replace(
      queryParameters: {
        'lat': point.latitude.toString(),
        'lon': point.longitude.toString(),
        'format': 'json',
        'addressdetails': '1',
        'accept-language': 'fr',
        'zoom': '18',
      },
    );
    try {
      final res = await _client
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
