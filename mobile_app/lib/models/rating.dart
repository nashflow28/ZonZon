/// Note attribuée par un utilisateur à un autre suite à une course terminée.
class Rating {
  final String id;
  final String orderId;
  final String fromUserId;
  final String toUserId;
  final int score;
  final String? comment;
  final DateTime? createdAt;
  final String? fromFirstName;
  final String? fromLastName;

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
  });

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
    );
  }
}

/// Statistiques agrégées des notes reçues par un utilisateur.
class RatingStats {
  final double average;
  final int count;

  const RatingStats({required this.average, required this.count});

  factory RatingStats.fromJson(Map<String, dynamic> json) {
    return RatingStats(
      average: (json['average'] as num?)?.toDouble() ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }

  bool get hasRatings => count > 0;
}
