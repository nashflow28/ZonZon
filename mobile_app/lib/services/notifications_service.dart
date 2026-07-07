import 'dart:convert';

import 'api_client.dart';

/// Une notification in-app (liste `GET /notifications`), distincte des
/// notifications push FCM gérées par `push_service.dart`.
class AppNotification {
  final String id;
  final String? deliveryId;
  final String type;
  final String title;
  final String body;
  final DateTime? readAt;
  final DateTime? createdAt;

  AppNotification({
    required this.id,
    this.deliveryId,
    required this.type,
    required this.title,
    required this.body,
    this.readAt,
    this.createdAt,
  });

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic v) {
      if (v == null) return null;
      return DateTime.tryParse(v.toString());
    }

    return AppNotification(
      id: json['id']?.toString() ?? '',
      deliveryId: json['deliveryId']?.toString(),
      type: json['type']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      readAt: parseDate(json['readAt']),
      createdAt: parseDate(json['createdAt']),
    );
  }
}

/// Résultat paginé de `GET /notifications`.
class NotificationsPage {
  final List<AppNotification> items;
  final int total;
  final int page;
  final int limit;
  final bool hasMore;

  NotificationsPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
    required this.hasMore,
  });

  factory NotificationsPage.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final items = rawItems is List
        ? rawItems
            .whereType<Map>()
            .map((m) => AppNotification.fromJson(Map<String, dynamic>.from(m)))
            .toList()
        : <AppNotification>[];
    return NotificationsPage(
      items: items,
      total: (json['total'] as num?)?.toInt() ?? items.length,
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? items.length,
      hasMore: json['hasMore'] as bool? ?? false,
    );
  }
}

/// Service pour la liste des notifications in-app de l'utilisateur courant
/// (`GET /notifications`, `PATCH /notifications/:id/read`,
/// `PATCH /notifications/read-all`).
///
/// À ne pas confondre avec `push_service.dart` qui gère les notifications
/// push FCM (arrivée en arrière-plan / tap système).
class NotificationsService {
  final ApiClient _api = ApiClient();

  /// Récupère une page de notifications de l'utilisateur courant.
  Future<NotificationsPage> list({int page = 1}) async {
    final res = await _api.get('/notifications?page=$page');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(_extractError(res));
    }
    final data = jsonDecode(res.body);
    if (data is! Map<String, dynamic>) {
      throw Exception('Réponse inattendue du serveur.');
    }
    return NotificationsPage.fromJson(data);
  }

  /// Marque une notification comme lue.
  Future<void> markRead(String id) async {
    final res = await _api.patch('/notifications/$id/read');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(_extractError(res));
    }
  }

  /// Marque toutes les notifications de l'utilisateur courant comme lues.
  Future<void> markAllRead() async {
    final res = await _api.patch('/notifications/read-all');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(_extractError(res));
    }
  }

  String _extractError(dynamic res) {
    try {
      final data = jsonDecode(res.body);
      if (data is Map && data['message'] != null) {
        final msg = data['message'];
        if (msg is List) return msg.join(', ');
        return msg.toString();
      }
    } catch (_) {}
    return 'Erreur ${res.statusCode}';
  }
}
