import 'package:json_annotation/json_annotation.dart';

part 'message.g.dart';

enum MessageStatus { pending, sent, failed }

@JsonSerializable(createFactory: false)
class ChatMessage {
  final String id;
  final String orderId;
  final String? senderId;

  /// Extracted from the nested `sender` object in the API response.
  /// Not included in toJson (client-side display field only).
  @JsonKey(includeToJson: false)
  final String? senderFirstName;

  /// Nom de famille extrait du `sender` imbriqué.
  @JsonKey(includeToJson: false)
  final String? senderLastName;

  final String type;
  final String content;
  final DateTime createdAt;

  /// Lu par AU MOINS UN destinataire (sémantique serveur). Pour un accusé de
  /// lecture honnête en conversation à 3+, utiliser [readBy].
  final DateTime? readAt;

  /// Ids des participants ayant lu ce message (receipts par participant,
  /// renvoyés par `GET /orders/:id/messages` et enrichis en live via
  /// `chat:read`). Champ d'affichage uniquement — non renvoyé au serveur.
  @JsonKey(includeToJson: false)
  final List<String> readBy;

  /// Client-side status — not part of the server payload.
  @JsonKey(includeToJson: false)
  final MessageStatus status;

  /// Client-side optimistic ID — not part of the server payload.
  @JsonKey(includeToJson: false)
  final String? localId;

  ChatMessage({
    required this.id,
    required this.orderId,
    required this.senderId,
    required this.senderFirstName,
    required this.senderLastName,
    required this.type,
    required this.content,
    required this.createdAt,
    required this.readAt,
    this.readBy = const [],
    this.status = MessageStatus.sent,
    this.localId,
  });

  /// Hand-written because `senderFirstName` comes from the nested `sender`
  /// object, which cannot be auto-mapped by json_serializable without a
  /// custom converter.
  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>?;
    return ChatMessage(
      id: json['id']?.toString() ?? '',
      orderId: json['orderId']?.toString() ?? '',
      senderId: json['senderId']?.toString(),
      senderFirstName: sender?['firstName'] as String?,
      senderLastName: sender?['lastName'] as String?,
      type: json['type']?.toString() ?? 'TEXT',
      content: json['content']?.toString() ?? '',
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'].toString())
          : null,
      readBy: json['readBy'] is List
          ? List<String>.from((json['readBy'] as List).map((e) => e.toString()))
          : const [],
      status: MessageStatus.sent,
    );
  }

  Map<String, dynamic> toJson() => _$ChatMessageToJson(this);

  ChatMessage copyWith({
    String? id,
    DateTime? readAt,
    List<String>? readBy,
    MessageStatus? status,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      orderId: orderId,
      senderId: senderId,
      senderFirstName: senderFirstName,
      senderLastName: senderLastName,
      type: type,
      content: content,
      createdAt: createdAt,
      readAt: readAt ?? this.readAt,
      readBy: readBy ?? this.readBy,
      status: status ?? this.status,
      localId: localId,
    );
  }

  @JsonKey(includeToJson: false)
  String? get senderDisplayName {
    final first = senderFirstName?.trim() ?? '';
    final last = senderLastName?.trim() ?? '';
    final full = '$first $last'.trim();
    return full.isEmpty ? null : full;
  }
}
