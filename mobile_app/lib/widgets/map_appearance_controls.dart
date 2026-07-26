import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../services/map_appearance_service.dart';

class MapTileLayers extends StatelessWidget {
  const MapTileLayers({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<MapAppearance>(
    valueListenable: MapAppearanceService.appearance,
    builder: (context, appearance, _) {
      if (appearance == MapAppearance.light) {
        // Le style OSM standard expose davantage de commerces, services,
        // bâtiments publics et autres points de repère que le fond CARTO.
        return TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.zonzon.app',
          maxNativeZoom: 19,
          maxZoom: 20,
          retinaMode: false,
        );
      }

      return Stack(
        children: [
          TileLayer(
            urlTemplate:
                'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
            userAgentPackageName: 'com.zonzon.app',
            subdomains: const ['a', 'b', 'c', 'd'],
            retinaMode: RetinaMode.isHighDensity(context),
          ),
          TileLayer(
            urlTemplate:
                'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
            userAgentPackageName: 'com.zonzon.app',
            subdomains: const ['a', 'b', 'c', 'd'],
            retinaMode: RetinaMode.isHighDensity(context),
          ),
        ],
      );
    },
  );
}

class MapAttribution extends StatelessWidget {
  const MapAttribution({super.key});

  @override
  Widget build(BuildContext context) {
    return const RichAttributionWidget(
      alignment: AttributionAlignment.bottomRight,
      showFlutterMapAttribution: false,
      attributions: [
        TextSourceAttribution('OpenStreetMap contributors'),
        TextSourceAttribution('CARTO'),
      ],
    );
  }
}

class MapAppearanceButton extends StatelessWidget {
  const MapAppearanceButton({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<MapAppearance>(
    valueListenable: MapAppearanceService.appearance,
    builder: (context, appearance, _) {
      final isLight = appearance == MapAppearance.light;
      return Material(
        color: isLight
            ? Colors.white.withValues(alpha: 0.96)
            : const Color(0xFF122530).withValues(alpha: 0.96),
        shape: const CircleBorder(),
        elevation: 3,
        child: IconButton(
          tooltip: isLight
              ? 'Afficher la carte sombre'
              : 'Afficher la carte claire',
          onPressed: MapAppearanceService.toggle,
          icon: Icon(
            isLight ? Icons.dark_mode_outlined : Icons.light_mode_outlined,
            color: isLight ? const Color(0xFF0C1A22) : Colors.white,
          ),
        ),
      );
    },
  );
}

class MapProfileButton extends StatelessWidget {
  final VoidCallback onPressed;

  const MapProfileButton({super.key, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF122530).withValues(alpha: 0.96),
      shape: const CircleBorder(),
      elevation: 3,
      child: IconButton(
        tooltip: 'Ouvrir mon profil',
        onPressed: onPressed,
        icon: const Icon(Icons.person_outline, color: Colors.white),
      ),
    );
  }
}
