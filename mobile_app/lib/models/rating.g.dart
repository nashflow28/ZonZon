// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rating.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Map<String, dynamic> _$RatingToJson(Rating instance) => <String, dynamic>{
  'id': instance.id,
  'orderId': instance.orderId,
  'fromUserId': instance.fromUserId,
  'toUserId': instance.toUserId,
  'score': instance.score,
  'comment': instance.comment,
  'createdAt': instance.createdAt?.toIso8601String(),
  'punctualityScore': instance.punctualityScore,
  'communicationScore': instance.communicationScore,
  'courtesyScore': instance.courtesyScore,
};

RatingStats _$RatingStatsFromJson(Map<String, dynamic> json) => RatingStats(
  average: _numToDouble(json['average']),
  count: _numToInt(json['count']),
  punctualityAverage: _numToDoubleNullable(json['punctualityAverage']),
  communicationAverage: _numToDoubleNullable(json['communicationAverage']),
  courtesyAverage: _numToDoubleNullable(json['courtesyAverage']),
);

Map<String, dynamic> _$RatingStatsToJson(RatingStats instance) =>
    <String, dynamic>{
      'average': instance.average,
      'count': instance.count,
      'punctualityAverage': instance.punctualityAverage,
      'communicationAverage': instance.communicationAverage,
      'courtesyAverage': instance.courtesyAverage,
    };
