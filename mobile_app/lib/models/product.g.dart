// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Product _$ProductFromJson(Map<String, dynamic> json) => Product(
  id: json['id'] as String,
  shopId: json['shopId'] as String,
  name: json['name'] as String,
  description: json['description'] as String?,
  priceFcfa: _numToInt(json['priceFcfa']),
  photoUrl: json['photoUrl'] as String?,
  available: json['available'] as bool,
);

Map<String, dynamic> _$ProductToJson(Product instance) => <String, dynamic>{
  'id': instance.id,
  'shopId': instance.shopId,
  'name': instance.name,
  'description': instance.description,
  'priceFcfa': instance.priceFcfa,
  'photoUrl': instance.photoUrl,
  'available': instance.available,
};
