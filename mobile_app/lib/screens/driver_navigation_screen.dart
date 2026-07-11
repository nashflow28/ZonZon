import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/place.dart';
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
  Widget build(BuildContext context) {
    final targetAddress = _headingToDelivery
        ? widget.deliveryAddress
        : widget.pickupAddress;
    final pickup = _pickup;
    final delivery = _delivery;
    final polyline = <LatLng>[
      if (pickup != null) pickup.location,
      if (delivery != null) delivery.location,
    ];

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
              polyline: polyline,
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
