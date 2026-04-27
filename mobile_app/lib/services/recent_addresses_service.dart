import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/place.dart';

/// Stocke les 5 dernières adresses utilisées dans le secure storage local.
/// Pas de synchro serveur — éphémère par appareil.
class RecentAddressesService {
  static const _key = 'zonzon.recent_addresses.v1';
  static const _max = 5;
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<List<Place>> list() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return [];
      final list = jsonDecode(raw);
      if (list is! List) return [];
      return list
          .whereType<Map<String, dynamic>>()
          .map(Place.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> push(Place place) async {
    final current = await list();
    // dedup par coords arrondies (même point ≈ même clé)
    bool sameSpot(Place a, Place b) =>
        a.location.latitude.toStringAsFixed(4) ==
            b.location.latitude.toStringAsFixed(4) &&
        a.location.longitude.toStringAsFixed(4) ==
            b.location.longitude.toStringAsFixed(4);
    current.removeWhere((p) => sameSpot(p, place));
    current.insert(0, place);
    final trimmed = current.take(_max).toList();
    await _storage.write(
      key: _key,
      value: jsonEncode(trimmed.map((p) => p.toJson()).toList()),
    );
  }

  static Future<void> clear() => _storage.delete(key: _key);
}
