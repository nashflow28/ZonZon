import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/place.dart';
import '../services/estimate_service.dart';
import '../widgets/order_map_widget.dart';

/// Full-screen map used by a driver while an active delivery is in progress.
/// It keeps the delivery controls on the active-order screen while giving the
/// driver a usable in-app visual route instead of a blocking confirmation box.
class DriverNavigationScreen extends StatefulWidget {
  final String status;
  final String pickupAddress;
  final String deliveryAddress;
  final double? pickupLat;
  final double? pickupLng;
  final double? deliveryLat;
  final double? deliveryLng;
  final LatLng? driverPosition;

  const DriverNavigationScreen({
    super.key,
    required this.status,
    required this.pickupAddress,
    required this.deliveryAddress,
    this.pickupLat,
    this.pickupLng,
    this.deliveryLat,
    this.deliveryLng,
    this.driverPosition,
  });

  @override
  State<DriverNavigationScreen> createState() => _DriverNavigationScreenState();
}

class _DriverNavigationScreenState extends State<DriverNavigationScreen> {
  final MapController _mapController = MapController();
  final EstimateService _estimateService = EstimateService();
  List<LatLng> _routePolyline = const [];
  bool _loadingRoute = false;
  bool _routeUnavailable = false;

  bool get _headingToDelivery =>
      widget.status == 'IN_PROGRESS' || widget.status == 'NEAR_CLIENT';

  Place? get _pickup => widget.pickupLat == null || widget.pickupLng == null
      ? null
      : Place(
          displayName: widget.pickupAddress,
          shortName: 'Retrait',
          location: LatLng(widget.pickupLat!, widget.pickupLng!),
        );

  Place? get _delivery =>
      widget.deliveryLat == null || widget.deliveryLng == null
      ? null
      : Place(
          displayName: widget.deliveryAddress,
          shortName: 'Livraison',
          location: LatLng(widget.deliveryLat!, widget.deliveryLng!),
        );

  @override
  void initState() {
    super.initState();
    _loadRoadRoute();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _headingToDelivery
          ? _delivery?.location
          : _pickup?.location;
      final driver = widget.driverPosition;
      if (!mounted || target == null) return;
      if (driver != null) {
        _mapController.fitCamera(
          CameraFit.bounds(
            bounds: LatLngBounds(driver, target),
            padding: const EdgeInsets.all(48),
          ),
        );
      } else {
        _mapController.move(target, 15);
      }
    });
  }

  @override
  void didUpdateWidget(covariant DriverNavigationScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.driverPosition == null && widget.driverPosition != null) {
      _loadRoadRoute();
    }
  }

  Future<void> _loadRoadRoute() async {
    final start = widget.driverPosition;
    final target = _headingToDelivery ? _delivery?.location : _pickup?.location;
    // Without an actual driver GPS point, a pickup-to-delivery segment would
    // be misleading. Keep only the markers until the driver opens the map
    // after their position has been acquired.
    if (start == null || target == null) {
      setState(() => _routeUnavailable = true);
      return;
    }

    setState(() => _loadingRoute = true);
    final estimate = await _estimateService.estimate(
      lat1: start.latitude,
      lng1: start.longitude,
      lat2: target.latitude,
      lng2: target.longitude,
    );
    if (!mounted) return;
    setState(() {
      _loadingRoute = false;
      _routePolyline = estimate?.polyline ?? const [];
      _routeUnavailable = _routePolyline.length < 2;
    });
  }

  @override
  void dispose() {
    _estimateService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final targetAddress = _headingToDelivery
        ? widget.deliveryAddress
        : widget.pickupAddress;
    final pickup = _pickup;
    final delivery = _delivery;
    return Scaffold(
      backgroundColor: const Color(0xFF0C1A22),
      appBar: AppBar(
        backgroundColor: const Color(0xFF122530),
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Navigation de la course',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: OrderMapWidget(
              pickup: pickup,
              delivery: delivery,
              polyline: _routePolyline,
              driverPosition: widget.driverPosition,
              mapController: _mapController,
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              color: const Color(0xFF122530),
              child: Row(
                children: [
                  Icon(
                    _headingToDelivery ? Icons.location_on : Icons.storefront,
                    color: const Color(0xFF0FB271),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _headingToDelivery
                              ? 'Direction : livraison'
                              : 'Direction : retrait',
                          style: const TextStyle(
                            color: Color(0xFF0FB271),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          targetAddress.isEmpty
                              ? 'Adresse indisponible'
                              : targetAddress,
                          style: const TextStyle(color: Colors.white),
                        ),
                        if (_loadingRoute) ...[
                          const SizedBox(height: 4),
                          const Text(
                            'Calcul de l’itinéraire routier…',
                            style: TextStyle(
                              color: Colors.white60,
                              fontSize: 12,
                            ),
                          ),
                        ] else if (_routeUnavailable) ...[
                          const SizedBox(height: 4),
                          const Text(
                            'Itinéraire routier indisponible pour le moment.',
                            style: TextStyle(
                              color: Colors.white60,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
