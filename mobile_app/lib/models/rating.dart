import 'package:json_annotation/json_annotation.dart';

part 'rating.g.dart';

/// Note attribuée par un utilisateur à un autre suite à une course terminée.
@JsonSerializable(createFactory: false)
class Rating {
  final String id;
  final String orderId;
  final String fromUserId;
  final String toUserId;
  final int score;
  final String? comment;
  final DateTime? createdAt;

  /// Ces champs proviennent de l'objet imbriqué `fromUser` dans la réponse
  /// API. Ils ne font pas partie de la sérialisation JSON sortante standard
  /// (ils sont exclus du toJson généré).
  @JsonKey(includeToJson: false)
  final String? fromFirstName;
  @JsonKey(includeToJson: false)
  final String? fromLastName;

  /// Sous-notes par catégorie (1-5), toutes optionnelles.
  /// `score` reste la note principale ; ces champs sont strictement additionnels.
  final int? punctualityScore;
  final int? communicationScore;
  final int? courtesyScore;

  const Rating({
    required this.id,
    required this.orderId,
    required this.fromUserId,
    required this.toUserId,
    required this.score,
    this.comment,
    this.createdAt,
    this.fromFirstName,
    this.fromLastName,
    this.punctualityScore,
    this.communicationScore,
    this.courtesyScore,
  });

  /// Hand-written because `fromFirstName`/`fromLastName` come from the
  /// nested `fromUser` object, which json_serializable cannot handle
  /// automatically without a custom converter.
  factory Rating.fromJson(Map<String, dynamic> json) {
    final from = json['fromUser'];
    String? fromFirst;
    String? fromLast;
    if (from is Map<String, dynamic>) {
      fromFirst = from['firstName']?.toString();
      fromLast = from['lastName']?.toString();
    }
    return Rating(
      id: json['id']?.toString() ?? '',
      orderId: json['orderId']?.toString() ?? '',
      fromUserId: json['fromUserId']?.toString() ?? '',
      toUserId: json['toUserId']?.toString() ?? '',
      score: (json['score'] as num?)?.toInt() ?? 0,
      comment: json['comment']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      fromFirstName: fromFirst,
      fromLastName: fromLast,
      punctualityScore: (json['punctualityScore'] as num?)?.toInt(),
      communicationScore: (json['communicationScore'] as num?)?.toInt(),
      courtesyScore: (json['courtesyScore'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toJson() => _$RatingToJson(this);
}

/// Statistiques agrégées des notes reçues par un utilisateur.
@JsonSerializable()
class RatingStats {
  @JsonKey(fromJson: _numToDouble)
  final double average;
  @JsonKey(fromJson: _numToInt)
  final int count;

  /// Moyennes par catégorie (null si aucune note de cette catégorie reçue).
  @JsonKey(fromJson: _numToDoubleNullable)
  final double? punctualityAverage;
  @JsonKey(fromJson: _numToDoubleNullable)
  final double? communicationAverage;
  @JsonKey(fromJson: _numToDoubleNullable)
  final double? courtesyAverage;

  const RatingStats({
    required this.average,
    required this.count,
    this.punctualityAverage,
    this.communicationAverage,
    this.courtesyAverage,
  });

  factory RatingStats.fromJson(Map<String, dynamic> json) =>
      _$RatingStatsFromJson(json);

  Map<String, dynamic> toJson() => _$RatingStatsToJson(this);

  bool get hasRatings => count > 0;
}

double _numToDouble(dynamic v) {
  if (v == null) return 0;
  if (v is double) return v;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

double? _numToDoubleNullable(dynamic v) {
  if (v == null) return null;
  if (v is double) return v;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

int _numToInt(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}
