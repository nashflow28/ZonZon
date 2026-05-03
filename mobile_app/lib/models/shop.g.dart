// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shop.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Map<String, dynamic> _$ShopCategoryToJson(ShopCategory instance) =>
    <String, dynamic>{'value': instance.value, 'label': instance.label};

Map<String, dynamic> _$ShopToJson(Shop instance) => <String, dynamic>{
  'id': instance.id,
  'ownerId': instance.ownerId,
  'name': instance.name,
  'category': instance.category,
  'status': _shopStatusToJson(instance.status),
  'description': instance.description,
  'address': instance.address,
  'location': _latLngToJson(instance.location),
  'logoUrl': instance.logoUrl,
  'phone': instance.phone,
  'hours': instance.hours,
  'rejectionReason': instance.rejectionReason,
  'distanceKm': instance.distanceKm,
  'products': instance.products.map((e) => e.toJson()).toList(),
};
