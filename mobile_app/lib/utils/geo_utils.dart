import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// Distance Haversine entre deux points, en kilomètres.
double haversineKm(LatLng a, LatLng b) {
  const r = 6371.0;
  double toRad(double d) => d * (math.pi / 180);
  final dLat = toRad(b.latitude - a.latitude);
  final dLng = toRad(b.longitude - a.longitude);
  final lat1 = toRad(a.latitude);
  final lat2 = toRad(b.latitude);
  final h =
      math.pow(math.sin(dLat / 2), 2) +
      math.cos(lat1) * math.cos(lat2) * math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.sqrt(h));
}
