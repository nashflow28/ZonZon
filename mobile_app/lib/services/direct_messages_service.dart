import 'dart:convert';

import 'api_client.dart';

class DirectContact {
  const DirectContact({
    required this.id,
    required this.name,
    required this.role,
  });
  final String id;
  final String name;
  final String role;
  factory DirectContact.fromJson(Map<String, dynamic> json) => DirectContact(
    id: json['id']?.toString() ?? '',
    name: '${json['firstName'] ?? ''} ${json['lastName'] ?? ''}'.trim(),
    role: json['role']?.toString() ?? '',
  );
}

class DirectMessageItem {
  const DirectMessageItem({
    required this.id,
    required this.senderId,
    required this.content,
    this.orderId,
    this.createdAt,
  });
  final String id;
  final String senderId;
  final String content;
  final String? orderId;
  final DateTime? createdAt;
  factory DirectMessageItem.fromJson(Map<String, dynamic> json) =>
      DirectMessageItem(
        id: json['id']?.toString() ?? '',
        senderId: json['senderId']?.toString() ?? '',
        content: json['content']?.toString() ?? '',
        orderId: json['orderId']?.toString(),
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      );
}

class DirectMessagesService {
  final ApiClient _api = ApiClient();
  Future<List<DirectContact>> contacts() async {
    final res = await _api.get('/direct-messages/contacts');
    if (res.statusCode != 200) throw Exception('Erreur ${res.statusCode}');
    return (jsonDecode(res.body) as List)
        .whereType<Map>()
        .map((m) => DirectContact.fromJson(Map<String, dynamic>.from(m)))
        .where((c) => c.id.isNotEmpty)
        .toList();
  }

  Future<List<DirectMessageItem>> thread(String userId) async {
    final res = await _api.get('/direct-messages/$userId');
    if (res.statusCode != 200) throw Exception('Erreur ${res.statusCode}');
    return (jsonDecode(res.body) as List)
        .whereType<Map>()
        .map((m) => DirectMessageItem.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  Future<void> send(String userId, String content, {String? orderId}) async {
    final res = await _api.post(
      '/direct-messages/$userId',
      body: {'content': content, if (orderId != null) 'orderId': orderId},
    );
    if (res.statusCode != 200 && res.statusCode != 201)
      throw Exception('Erreur ${res.statusCode}');
  }
}
