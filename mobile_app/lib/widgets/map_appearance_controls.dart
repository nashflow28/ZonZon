import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../services/map_appearance_service.dart';

class MapTileLayers extends StatelessWidget {
  const MapTileLayers({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<MapAppearance>(
    valueListenable: MapAppearanceService.appearance,
    builder: (context, appearance, _) {
      final style = appearance == MapAppearance.light ? 'light' : 'dark';
      return Stack(
        children: [
          TileLayer(
            urlTemplate:
                'https://{s}.basemaps.cartocdn.com/${style}_nolabels/{z}/{x}/{y}{r}.png',
            userAgentPackageName: 'com.zonzon.app',
            subdomains: const ['a', 'b', 'c', 'd'],
            retinaMode: RetinaMode.isHighDensity(context),
          ),
          TileLayer(
            urlTemplate:
                'https://{s}.basemaps.cartocdn.com/${style}_only_labels/{z}/{x}/{y}{r}.png',
            userAgentPackageName: 'com.zonzon.app',
            subdomains: const ['a', 'b', 'c', 'd'],
            retinaMode: RetinaMode.isHighDensity(context),
          ),
        ],
      );
    },
  );
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
