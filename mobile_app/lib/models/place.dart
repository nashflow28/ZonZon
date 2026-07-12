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

  /// Hand-written because `fromNominatim` requires bespoke address parsing
  /// and the `location` field uses a custom LatLng type with flat lat/lng keys.
  /// json_serializable cannot represent the flat lat/lng → LatLng mapping
  /// without a custom converter that would add more complexity than value.
  factory Place.fromNominatim(Map<String, dynamic> json) {
    final lat = double.tryParse(json['lat']?.toString() ?? '') ?? 0;
    final lon = double.tryParse(json['lon']?.toString() ?? '') ?? 0;
    final addr = json['address'] as Map<String, dynamic>?;
    final display = json['display_name']?.toString() ?? '';
    final short = _shortFromAddress(addr) ?? _firstChunk(display);
    return Place(
      displayName: display,
      shortName: short,
      location: LatLng(lat.toDouble(), lon.toDouble()),
      type: json['type']?.toString(),
    );
  }

  factory Place.fromPhoton(Map<String, dynamic> feature) {
    final geometry = feature['geometry'] as Map<String, dynamic>?;
    final coordinates = geometry?['coordinates'] as List?;
    final properties =
        feature['properties'] as Map<String, dynamic>? ?? const {};
    final lon = coordinates != null && coordinates.isNotEmpty
        ? (coordinates[0] as num?)?.toDouble() ?? 0
        : 0;
    final lat = coordinates != null && coordinates.length > 1
        ? (coordinates[1] as num?)?.toDouble() ?? 0
        : 0;
    final parts = <String>[];
    for (final key in const [
      'name',
      'street',
      'district',
      'city',
      'county',
      'state',
      'country',
    ]) {
      final value = properties[key]?.toString().trim();
      if (value != null && value.isNotEmpty && !parts.contains(value)) {
        parts.add(value);
      }
    }
    final shortName = properties['name']?.toString().trim();
    return Place(
      displayName: parts.join(', '),
      shortName: shortName == null || shortName.isEmpty
          ? (parts.isEmpty ? 'Lieu' : parts.first)
          : shortName,
      location: LatLng(lat.toDouble(), lon.toDouble()),
      type: properties['type']?.toString(),
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
