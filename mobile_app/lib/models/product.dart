import 'package:json_annotation/json_annotation.dart';

part 'product.g.dart';

@JsonSerializable()
class Product {
  final String id;
  final String shopId;
  final String name;
  final String? description;
  @JsonKey(fromJson: _numToInt)
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

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);

  Map<String, dynamic> toJson() => _$ProductToJson(this);
}

int _numToInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}
