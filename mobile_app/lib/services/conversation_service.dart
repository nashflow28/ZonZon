import 'dart:convert';

import 'api_client.dart';

class ConversationServiceException implements Exception {
  final String message;
  const ConversationServiceException(this.message);

  @override
  String toString() => message;
}

class ConversationParticipantInfo {
  final String userId;
  final String role;
  final DateTime? joinedAt;

  const ConversationParticipantInfo({
    required this.userId,
    required this.role,
    this.joinedAt,
  });

  factory ConversationParticipantInfo.fromJson(Map<String, dynamic> json) {
    return ConversationParticipantInfo(
      userId: json['userId']?.toString() ?? '',
      role: json['role']?.toString() ?? 'UNKNOWN',
      joinedAt: json['joinedAt'] == null
          ? null
          : DateTime.tryParse(json['joinedAt'].toString()),
    );
  }
}

class ConversationSnapshot {
  final String conversationId;
  final String deliveryId;
  final List<ConversationParticipantInfo> participants;

  const ConversationSnapshot({
    required this.conversationId,
    required this.deliveryId,
    required this.participants,
  });

  factory ConversationSnapshot.fromJson(Map<String, dynamic> json) {
    final conversation = json['conversation'];
    final participantsJson = json['participants'];
    return ConversationSnapshot(
      conversationId: conversation is Map
          ? conversation['id']?.toString() ?? ''
          : '',
      deliveryId: conversation is Map
          ? conversation['deliveryId']?.toString() ?? ''
          : '',
      participants: participantsJson is List
          ? participantsJson
                .whereType<Map>()
                .map(
                  (m) => ConversationParticipantInfo.fromJson(
                    Map<String, dynamic>.from(m),
                  ),
                )
                .toList()
          : const [],
    );
  }
}

class ConversationService {
  final ApiClient _api = ApiClient();

  Future<ConversationSnapshot> getConversation(String orderId) async {
    try {
      final res = await _api.get('/orders/$orderId/conversation');
      if (res.statusCode == 200 || res.statusCode == 201) {
        final decoded = jsonDecode(res.body);
        if (decoded is! Map<String, dynamic>) {
          throw const ConversationServiceException(
            'Réponse conversation invalide.',
          );
        }
        return ConversationSnapshot.fromJson(decoded);
      }
      throw ConversationServiceException(
        _extractError(
          res.body,
          fallback: 'Impossible de charger la conversation.',
        ),
      );
    } on ConversationServiceException {
      rethrow;
    } catch (e) {
      throw ConversationServiceException('Erreur réseau : $e');
    }
  }

  Future<void> addSelf(String orderId) async {
    try {
      final res = await _api.post('/orders/$orderId/conversation/participants');
      if (res.statusCode != 200 && res.statusCode != 201) {
        throw ConversationServiceException(
          _extractError(
            res.body,
            fallback: 'Impossible de rejoindre la conversation.',
          ),
        );
      }
    } on ConversationServiceException {
      rethrow;
    } catch (e) {
      throw ConversationServiceException('Erreur réseau : $e');
    }
  }

  Future<void> removeSelf(String orderId) async {
    try {
      final res = await _api.delete(
        '/orders/$orderId/conversation/participants/me',
      );
      if (res.statusCode != 200 &&
          res.statusCode != 201 &&
          res.statusCode != 204) {
        throw ConversationServiceException(
          _extractError(
            res.body,
            fallback: 'Impossible de quitter la conversation.',
          ),
        );
      }
    } on ConversationServiceException {
      rethrow;
    } catch (e) {
      throw ConversationServiceException('Erreur réseau : $e');
    }
  }

  String _extractError(String body, {required String fallback}) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['message'] != null) {
        final msg = decoded['message'];
        return msg is List ? msg.join(', ') : msg.toString();
      }
    } catch (_) {}
    return fallback;
  }
}
