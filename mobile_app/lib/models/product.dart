class Product {
  final String id;
  final String shopId;
  final String name;
  final String? description;
  final int priceFcfa;
  final String? photoUrl;
  final bool available;

  Product({
    required this.id,
    required this.shopId,
    required this.name,
    required this.description,
    required this.priceFcfa,
    required this.photoUrl,
    required this.available,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id']?.toString() ?? '',
      shopId: json['shopId']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      priceFcfa: (json['priceFcfa'] as num?)?.toInt() ?? 0,
      photoUrl: json['photoUrl']?.toString(),
      available: json['available'] as bool? ?? true,
    );
  }
}
