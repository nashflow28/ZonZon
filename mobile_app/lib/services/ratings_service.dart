import 'dart:convert';
import '../models/rating.dart';
import 'api_client.dart';

class RatingsService {
  final ApiClient _api = ApiClient();

  /// Soumet une note pour la course [orderId].
  /// Renvoie `null` si l'API a refusé (course pas COMPLETED, déjà notée, etc.).
  Future<Rating?> submit({
    required String orderId,
    required int score,
    String? comment,
  }) async {
    try {
      final res = await _api.post(
        '/orders/$orderId/rating',
        body: {
          'score': score,
          if (comment != null && comment.trim().isNotEmpty)
            'comment': comment.trim(),
        },
      );
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      final body = jsonDecode(res.body);
      if (body is! Map<String, dynamic>) return null;
      return Rating.fromJson(body);
    } catch (_) {
      return null;
    }
  }

  /// Récupère les statistiques de notes reçues par [userId].
  Future<RatingStats?> stats(String userId) async {
    try {
      final res = await _api.get('/users/$userId/ratings/stats');
      if (res.statusCode != 200 && res.statusCode != 201) return null;
      final body = jsonDecode(res.body);
      if (body is! Map<String, dynamic>) return null;
      return RatingStats.fromJson(body);
    } catch (_) {
      return null;
    }
  }
}
