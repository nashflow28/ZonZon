import 'package:latlong2/latlong.dart';
import 'product.dart';

enum ShopStatus { pending, approved, rejected, suspended }

ShopStatus shopStatusFromString(String? s) {
  switch (s) {
    case 'APPROVED':
      return ShopStatus.approved;
    case 'REJECTED':
      return ShopStatus.rejected;
    case 'SUSPENDED':
      return ShopStatus.suspended;
    default:
      return ShopStatus.pending;
  }
}

class ShopCategory {
  final String value;
  final String label;
  const ShopCategory({required this.value, required this.label});

  factory ShopCategory.fromJson(Map<String, dynamic> json) {
    return ShopCategory(
      value: json['value']?.toString() ?? 'OTHER',
      label: json['label']?.toString() ?? 'Autre',
    );
  }
}

class Shop {
  final String id;
  final String ownerId;
  final String name;
  final String category;
  final ShopStatus status;
  final String? description;
  final String address;
  final LatLng location;
  final String? logoUrl;
  final String? phone;
  final String? hours;
  final String? rejectionReason;
  final double? distanceKm;
  final List<Product> products;

  Shop({
    required this.id,
    required this.ownerId,
    required this.name,
    required this.category,
    required this.status,
    required this.description,
    required this.address,
    required this.location,
    required this.logoUrl,
    required this.phone,
    required this.hours,
    required this.rejectionReason,
    required this.distanceKm,
    required this.products,
  });

  factory Shop.fromJson(Map<String, dynamic> json) {
    final productsRaw = json['products'];
    final products = productsRaw is List
        ? productsRaw
            .whereType<Map<String, dynamic>>()
            .map(Product.fromJson)
            .toList()
        : <Product>[];
    return Shop(
      id: json['id']?.toString() ?? '',
      ownerId: json['ownerId']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      category: json['category']?.toString() ?? 'OTHER',
      status: shopStatusFromString(json['status']?.toString()),
      description: json['description']?.toString(),
      address: json['address']?.toString() ?? '',
      location: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      logoUrl: json['logoUrl']?.toString(),
      phone: json['phone']?.toString(),
      hours: json['hours']?.toString(),
      rejectionReason: json['rejectionReason']?.toString(),
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      products: products,
    );
  }
}
