import 'package:latlong2/latlong.dart';

class Place {
  final String displayName;
  final String shortName;
  final LatLng location;
  final String? type; // city, road, building, etc.

  Place({
    required this.displayName,
    required this.shortName,
    required this.location,
    this.type,
  });

  factory Place.fromNominatim(Map<String, dynamic> json) {
    final lat = double.tryParse(json['lat']?.toString() ?? '') ?? 0;
    final lon = double.tryParse(json['lon']?.toString() ?? '') ?? 0;
    final addr = json['address'] as Map<String, dynamic>?;
    final display = json['display_name']?.toString() ?? '';
    final short = _shortFromAddress(addr) ?? _firstChunk(display);
    return Place(
      displayName: display,
      shortName: short,
      location: LatLng(lat, lon),
      type: json['type']?.toString(),
    );
  }

  static String? _shortFromAddress(Map<String, dynamic>? a) {
    if (a == null) return null;
    final candidates = [
      a['road'],
      a['neighbourhood'],
      a['suburb'],
      a['village'],
      a['town'],
      a['city'],
    ];
    for (final c in candidates) {
      if (c is String && c.trim().isNotEmpty) return c;
    }
    return null;
  }

  static String _firstChunk(String s) {
    final idx = s.indexOf(',');
    return idx > 0 ? s.substring(0, idx) : s;
  }

  Map<String, dynamic> toJson() => {
        'displayName': displayName,
        'shortName': shortName,
        'lat': location.latitude,
        'lng': location.longitude,
        'type': type,
      };

  factory Place.fromJson(Map<String, dynamic> json) {
    return Place(
      displayName: json['displayName']?.toString() ?? '',
      shortName: json['shortName']?.toString() ?? '',
      location: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      type: json['type']?.toString(),
    );
  }
}
