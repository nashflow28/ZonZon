import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/place.dart';

/// Rendu de la carte client (pickup, delivery, polyline OSRM, position
/// live du livreur). Le widget est volontairement passif : il reçoit
/// l'état à afficher et délègue toute interaction (sélection d'adresse,
/// ouverture d'un picker) au parent via les callbacks [onPickupChanged]
/// et [onDeliveryChanged]. Aucun appel réseau n'est fait ici.
class OrderMapWidget extends StatefulWidget {
  static const _defaultLome = LatLng(6.1319, 1.2228);

  final Place? pickup;
  final Place? delivery;
  final List<LatLng> polyline;
  final LatLng? driverPosition;
  final MapController? mapController;

  /// Callback pour signaler un changement de pickup (ex : tap sur la carte).
  /// Pas déclenché automatiquement aujourd'hui — câblage futur.
  final ValueChanged<LatLng>? onPickupChanged;

  /// Callback pour signaler un changement de delivery (ex : long-press).
  /// Pas déclenché automatiquement aujourd'hui — câblage futur.
  final ValueChanged<LatLng>? onDeliveryChanged;

  const OrderMapWidget({
    super.key,
    required this.pickup,
    required this.delivery,
    required this.polyline,
    required this.driverPosition,
    this.mapController,
    this.onPickupChanged,
    this.onDeliveryChanged,
  });

  @override
  State<OrderMapWidget> createState() => _OrderMapWidgetState();
}

class _OrderMapWidgetState extends State<OrderMapWidget> {
  late final MapController _internalController;

  MapController get _controller => widget.mapController ?? _internalController;

  @override
  void initState() {
    super.initState();
    _internalController = MapController();
  }

  @override
  Widget build(BuildContext context) {
    final mapCenter = widget.pickup?.location ??
        widget.delivery?.location ??
        OrderMapWidget._defaultLome;
    return FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: mapCenter,
        initialZoom: 13.5,
      ),
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
        if (widget.polyline.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: widget.polyline,
                color: const Color(0xFF2E90FA),
                strokeWidth: 4,
                borderColor: const Color(0xFF2E90FA).withValues(alpha: 0.35),
                borderStrokeWidth: 8,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            if (widget.pickup != null)
              Marker(
                point: widget.pickup!.location,
                width: 60,
                height: 60,
                child: _GlowingMarker(
                  icon: Icons.my_location,
                  color: const Color(0xFF2E90FA),
                ),
              ),
            if (widget.delivery != null)
              Marker(
                point: widget.delivery!.location,
                width: 50,
                height: 50,
                child: _GlowingMarker(
                  icon: Icons.location_on,
                  color: const Color(0xFF0FB271),
                ),
              ),
            if (widget.driverPosition != null)
              Marker(
                point: widget.driverPosition!,
                width: 56,
                height: 56,
                child: const DriverPulseMarker(),
              ),
          ],
        ),
      ],
    );
  }
}

class _GlowingMarker extends StatelessWidget {
  final IconData icon;
  final Color color;
  const _GlowingMarker({required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.6),
            blurRadius: 15,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Icon(icon, color: color, size: 45),
    );
  }
}

/// Marker animé (pulse vert) pour la position live du livreur.
class DriverPulseMarker extends StatefulWidget {
  const DriverPulseMarker({super.key});

  @override
  State<DriverPulseMarker> createState() => _DriverPulseMarkerState();
}

class _DriverPulseMarkerState extends State<DriverPulseMarker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        return Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 56 * (0.5 + t * 0.5),
              height: 56 * (0.5 + t * 0.5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF0FB271)
                    .withValues(alpha: (1 - t) * 0.45),
              ),
            ),
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF0FB271),
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF0FB271).withValues(alpha: 0.6),
                    blurRadius: 12,
                  ),
                ],
              ),
              child: const Icon(Icons.two_wheeler,
                  size: 16, color: Colors.white),
            ),
          ],
        );
      },
    );
  }
}
