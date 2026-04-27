enum MessageStatus { pending, sent, failed }

class ChatMessage {
  final String id;
  final String orderId;
  final String? senderId;
  final String? senderFirstName;
  final String type;
  final String content;
  final DateTime createdAt;
  final DateTime? readAt;
  final MessageStatus status;

  /// Identifiant temporaire (côté client) pour matcher le retour serveur
  /// quand on envoie de manière optimiste.
  final String? localId;

  ChatMessage({
    required this.id,
    required this.orderId,
    required this.senderId,
    required this.senderFirstName,
    required this.type,
    required this.content,
    required this.createdAt,
    required this.readAt,
    this.status = MessageStatus.sent,
    this.localId,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>?;
    return ChatMessage(
      id: json['id']?.toString() ?? '',
      orderId: json['orderId']?.toString() ?? '',
      senderId: json['senderId']?.toString(),
      senderFirstName: sender?['firstName'] as String?,
      type: json['type']?.toString() ?? 'TEXT',
      content: json['content']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'].toString())
          : null,
      status: MessageStatus.sent,
    );
  }

  ChatMessage copyWith({
    String? id,
    DateTime? readAt,
    MessageStatus? status,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      orderId: orderId,
      senderId: senderId,
      senderFirstName: senderFirstName,
      type: type,
      content: content,
      createdAt: createdAt,
      readAt: readAt ?? this.readAt,
      status: status ?? this.status,
      localId: localId,
    );
  }
}
