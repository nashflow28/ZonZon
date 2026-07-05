// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'order_history_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Map<String, dynamic> _$OrderHistoryItemToJson(OrderHistoryItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status,
      'pickupAddress': instance.pickupAddress,
      'deliveryAddress': instance.deliveryAddress,
      'description': instance.description,
      'distanceKm': instance.distanceKm,
      'priceFcfa': instance.priceFcfa,
      'createdAt': instance.createdAt?.toIso8601String(),
      'cancellationReason': instance.cancellationReason,
      'cancelledBy': instance.cancelledBy,
      'livreur': instance.livreur,
      'client': instance.client,
      'clientPhone': instance.clientPhone,
      'clientName': instance.clientName,
    };
