import 'dart:async';
import 'dart:convert';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/env.dart';
import '../models/message.dart';
import 'api_client.dart';
import 'auth_service.dart';

/// Service de chat dédié à une commande.
///
/// Cycle de vie : `init()` à l'ouverture du chat, `dispose()` à la fermeture.
/// L'envoi est optimiste : le message apparaît immédiatement avec un statut
/// `pending`, puis devient `sent` (ou `failed`) selon la réponse du serveur.
class ChatService {
  final String orderId;
  final ApiClient _api = ApiClient();
  final AuthService _auth = AuthService();

  IO.Socket? _socket;
  String? _myId;

  final List<ChatMessage> _messages = [];
  final StreamController<List<ChatMessage>> _messagesCtrl =
      StreamController.broadcast();
  final StreamController<bool> _typingCtrl = StreamController.broadcast();

  Stream<List<ChatMessage>> get messages$ => _messagesCtrl.stream;
  Stream<bool> get otherTyping$ => _typingCtrl.stream;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  String? get myId => _myId;

  Timer? _typingDebounce;
  bool _typingEmitted = false;

  ChatService(this.orderId);

  Future<void> init() async {
    final user = await _auth.getCurrentUser();
    _myId = user?.id;

    await _loadHistory();
    await _connectSocket();
    // Marquer comme lu dès l'ouverture (les messages déjà reçus)
    unawaited(markRead());
  }

  Future<void> _loadHistory() async {
    try {
      final res = await _api.get('/orders/$orderId/messages');
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        if (data is List) {
          _messages
            ..clear()
            ..addAll(data.map((j) => ChatMessage.fromJson(j as Map<String, dynamic>)));
          _emit();
        }
      }
    } catch (_) {
      // Silencieux : l'utilisateur verra juste un chat vide jusqu'à reconnexion
    }
  }

  Future<void> _connectSocket() async {
    final token = await _auth.getToken();
    _socket = IO.io(apiUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': token},
    });

    _socket!.connect();

    _socket!.onConnect((_) {
      _socket!.emit('chat:join', {'orderId': orderId});
    });

    _socket!.on('chat:message', (data) {
      if (data is! Map) return;
      if (data['orderId']?.toString() != orderId) return;
      final raw = data['message'];
      if (raw is! Map<String, dynamic>) return;
      final incoming = ChatMessage.fromJson(raw);

      // Match par contenu+sender pour fusionner avec un message envoyé en optimiste
      final pendingIdx = _messages.indexWhere(
        (m) =>
            m.status == MessageStatus.pending &&
            m.senderId == incoming.senderId &&
            m.content == incoming.content,
      );
      if (pendingIdx >= 0) {
        _messages[pendingIdx] = incoming;
      } else {
        _messages.add(incoming);
      }
      _emit();

      // Si le message vient de l'autre, on le marque lu immédiatement
      if (incoming.senderId != null && incoming.senderId != _myId) {
        unawaited(markRead());
      }
    });

    _socket!.on('chat:typing', (data) {
      if (data is! Map) return;
      if (data['orderId']?.toString() != orderId) return;
      if (data['userId']?.toString() == _myId) return;
      _typingCtrl.add(data['isTyping'] == true);
    });

    _socket!.on('chat:read', (data) {
      if (data is! Map) return;
      if (data['orderId']?.toString() != orderId) return;
      final readerId = data['readerId']?.toString();
      if (readerId == null || readerId == _myId) return;
      // Tous mes messages envoyés avant le timestamp passent à "lu"
      final readAt = DateTime.tryParse(data['at']?.toString() ?? '') ?? DateTime.now();
      var changed = false;
      for (var i = 0; i < _messages.length; i++) {
        final m = _messages[i];
        if (m.senderId == _myId && m.readAt == null && !m.createdAt.isAfter(readAt)) {
          _messages[i] = m.copyWith(readAt: readAt);
          changed = true;
        }
      }
      if (changed) _emit();
    });
  }

  Future<void> sendText(String content) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) return;
    return _send(trimmed, type: 'TEXT');
  }

  Future<void> sendQuickReply(String content) {
    return _send(content, type: 'QUICK_REPLY');
  }

  Future<void> _send(String content, {required String type}) async {
    final localId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    final optimistic = ChatMessage(
      id: localId,
      orderId: orderId,
      senderId: _myId,
      senderFirstName: null,
      type: type,
      content: content,
      createdAt: DateTime.now(),
      readAt: null,
      status: MessageStatus.pending,
      localId: localId,
    );
    _messages.add(optimistic);
    _emit();

    // Stop typing immédiatement à l'envoi
    if (_typingEmitted) {
      _socket?.emit('chat:typing', {'orderId': orderId, 'isTyping': false});
      _typingEmitted = false;
    }

    try {
      final res = await _api.post(
        '/orders/$orderId/messages',
        body: {'content': content, 'type': type},
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final saved = ChatMessage.fromJson(data);
        // On remplace l'optimiste par le vrai (id serveur)
        final idx = _messages.indexWhere((m) => m.localId == localId);
        if (idx >= 0) {
          _messages[idx] = saved;
          _emit();
        }
      } else {
        _markFailed(localId);
      }
    } catch (_) {
      _markFailed(localId);
    }
  }

  void _markFailed(String localId) {
    final idx = _messages.indexWhere((m) => m.localId == localId);
    if (idx >= 0) {
      _messages[idx] = _messages[idx].copyWith(status: MessageStatus.failed);
      _emit();
    }
  }

  /// À appeler sur chaque keystroke. Anti-rebond intégré.
  void notifyTyping() {
    if (!_typingEmitted) {
      _socket?.emit('chat:typing', {'orderId': orderId, 'isTyping': true});
      _typingEmitted = true;
    }
    _typingDebounce?.cancel();
    _typingDebounce = Timer(const Duration(seconds: 3), () {
      _socket?.emit('chat:typing', {'orderId': orderId, 'isTyping': false});
      _typingEmitted = false;
    });
  }

  Future<void> markRead() async {
    try {
      await _api.patch('/orders/$orderId/messages/read');
    } catch (_) {}
  }

  void _emit() {
    if (!_messagesCtrl.isClosed) {
      _messagesCtrl.add(List.unmodifiable(_messages));
    }
  }

  Future<void> dispose() async {
    _typingDebounce?.cancel();
    _socket?.emit('chat:leave', {'orderId': orderId});
    _socket?.dispose();
    _socket = null;
    await _messagesCtrl.close();
    await _typingCtrl.close();
  }
}
