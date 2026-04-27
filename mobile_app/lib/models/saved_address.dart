import 'package:latlong2/latlong.dart';

class SavedAddress {
  final String id;
  final String label;
  final String address;
  final LatLng location;
  final String? icon;

  SavedAddress({
    required this.id,
    required this.label,
    required this.address,
    required this.location,
    this.icon,
  });

  factory SavedAddress.fromJson(Map<String, dynamic> json) {
    return SavedAddress(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      address: json['address']?.toString() ?? '',
      location: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      icon: json['icon']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'address': address,
        'lat': location.latitude,
        'lng': location.longitude,
        if (icon != null) 'icon': icon,
      };
}
