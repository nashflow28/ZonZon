import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

enum MapAppearance { dark, light }

class MapAppearanceService {
  MapAppearanceService._();

  static const _storage = FlutterSecureStorage();
  static const _key = 'map_appearance';
  static final ValueNotifier<MapAppearance> appearance = ValueNotifier(
    MapAppearance.dark,
  );
  static bool _loaded = false;

  static Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final saved = await _storage.read(key: _key);
      appearance.value = saved == 'light'
          ? MapAppearance.light
          : MapAppearance.dark;
    } catch (_) {
      // La carte reste utilisable même si le stockage sécurisé est indisponible.
    }
  }

  static Future<void> toggle() async {
    final next = appearance.value == MapAppearance.dark
        ? MapAppearance.light
        : MapAppearance.dark;
    appearance.value = next;
    try {
      await _storage.write(key: _key, value: next.name);
    } catch (_) {
      // Le choix reste actif pour la session courante.
    }
  }
}
