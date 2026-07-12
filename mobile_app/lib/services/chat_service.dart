import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/env.dart';
import '../controllers/order_socket_controller.dart';
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

  io.Socket? _socket;
  String? _myId;

  final List<ChatMessage> _messages = [];
  final StreamController<List<ChatMessage>> _messagesCtrl =
      StreamController.broadcast();
  final StreamController<bool> _typingCtrl = StreamController.broadcast();
  final StreamController<String> _orderStatusCtrl =
      StreamController.broadcast();
  final StreamController<SocketLifecycleEvent> _connectionStateCtrl =
      StreamController.broadcast();

  /// Destinataires connus de la conversation (participants − moi). Sert à
  /// l'accusé de lecture honnête : « lu par tous » = readBy ⊇ recipients.
  final Set<String> _recipients = {};

  Stream<List<ChatMessage>> get messages$ => _messagesCtrl.stream;
  Stream<bool> get otherTyping$ => _typingCtrl.stream;

  /// Statut de la course poussé par le backend (`orderStatusUpdated`) — le
  /// socket du chat est dans la room `user:<id>` et reçoit donc les statuts
  /// des courses dont l'utilisateur est partie. Permet de fermer l'UI de
  /// saisie dès qu'un statut terminal survient pendant que le chat est ouvert.
  Stream<String> get orderStatus$ => _orderStatusCtrl.stream;
  Stream<SocketLifecycleEvent> get connectionState$ =>
      _connectionStateCtrl.stream;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  String? get myId => _myId;
  Set<String> get recipients => Set.unmodifiable(_recipients);
  bool get isConnected => _socket?.connected == true;

  Timer? _typingDebounce;
  bool _typingEmitted = false;
  bool _disposed = false;

  ChatService(this.orderId);

  @visibleForTesting
  static bool hasUsableToken(String? token) {
    return token != null && token.trim().isNotEmpty;
  }

  @visibleForTesting
  static Map<String, dynamic> buildSocketOptions(String token) {
    final normalizedToken = token.trim();
    return io.OptionBuilder()
        .setTransports(['websocket'])
        .disableAutoConnect()
        .enableReconnection()
        .setReconnectionAttempts(8)
        .setReconnectionDelay(1000)
        .setReconnectionDelayMax(5000)
        .setTimeout(8000)
        .setAuth({'token': normalizedToken})
        .setExtraHeaders({'Authorization': 'Bearer $normalizedToken'})
        .build();
  }

  void _emitConnectionState(
    SocketLifecycleState state,
    String message, {
    int? attempt,
  }) {
    if (_connectionStateCtrl.isClosed) return;
    _connectionStateCtrl.add(
      SocketLifecycleEvent(
        state: state,
        message: message,
        attempt: attempt,
        occurredAt: DateTime.now(),
      ),
    );
  }

  Future<void> init() async {
    final user = await _auth.getCurrentUser();
    if (_disposed) return;
    _myId = user?.id;

    await _loadHistory();
    if (_disposed) return;
    await _connectSocket();
    if (_disposed) {
      _socket?.dispose();
      _socket = null;
      return;
    }
    // Marquer comme lu dès l'ouverture (les messages déjà reçus)
    unawaited(markRead());
    // Non bloquant : les destinataires servent uniquement à affiner
    // l'affichage de l'accusé de lecture.
    unawaited(_loadRecipients());
  }

  /// Charge les participants de la conversation (client/livreur/commerçant
  /// suivis + ajoutés) pour connaître les destinataires. Échec silencieux :
  /// l'indicateur de lecture retombe sur la sémantique « lu par au moins un ».
  Future<void> _loadRecipients() async {
    try {
      final res = await _api.get('/orders/$orderId/conversation');
      if (res.statusCode != 200 && res.statusCode != 201) return;
      final data = jsonDecode(res.body);
      final participants = data is Map ? data['participants'] : null;
      if (participants is! List) return;
      for (final p in participants) {
        if (p is! Map) continue;
        if (p['leftAt'] != null) continue;
        final userId = p['userId']?.toString();
        if (userId != null && userId.isNotEmpty && userId != _myId) {
          _recipients.add(userId);
        }
      }
      if (_recipients.isNotEmpty) _emit();
    } catch (_) {}
  }

  Future<void> _loadHistory() async {
    try {
      final res = await _api.get('/orders/$orderId/messages');
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        if (data is List) {
          _messages
            ..clear()
            ..addAll(
              data.map((j) => ChatMessage.fromJson(j as Map<String, dynamic>)),
            );
          _emit();
        }
      }
    } catch (_) {
      // Silencieux : l'utilisateur verra juste un chat vide jusqu'à reconnexion
    }
  }

  Future<void> _connectSocket() async {
    final token = await _auth.getToken();
    if (_disposed) return;
    if (!hasUsableToken(token)) {
      _emitConnectionState(
        SocketLifecycleState.skipped,
        'Connexion chat ignorée: JWT absent.',
      );
      return;
    }

    _socket = io.io(apiUrl, buildSocketOptions(token!));
    _emitConnectionState(
      SocketLifecycleState.connecting,
      'Connexion chat en cours…',
    );

    _socket!.onConnect((_) {
      _emitConnectionState(
        SocketLifecycleState.connected,
        'Connexion chat établie.',
      );
      _socket!.emit('chat:join', {'orderId': orderId});
    });

    _socket!.onDisconnect((reason) {
      _emitConnectionState(
        SocketLifecycleState.disconnected,
        'Chat déconnecté: ${reason ?? 'raison inconnue'}.',
      );
    });

    _socket!.onConnectError((error) {
      _emitConnectionState(
        SocketLifecycleState.connectError,
        'Échec de connexion chat: ${error ?? 'erreur inconnue'}.',
      );
    });

    _socket!.onError((error) {
      _emitConnectionState(
        SocketLifecycleState.error,
        'Erreur Socket.IO du chat: ${error ?? 'erreur inconnue'}.',
      );
    });

    _socket!.onReconnectAttempt((attempt) {
      final normalizedAttempt = switch (attempt) {
        int value => value,
        num value => value.toInt(),
        _ => null,
      };
      _emitConnectionState(
        SocketLifecycleState.reconnecting,
        'Reconnexion du chat en cours…',
        attempt: normalizedAttempt,
      );
    });

    _socket!.onReconnect((attempt) {
      final normalizedAttempt = switch (attempt) {
        int value => value,
        num value => value.toInt(),
        _ => null,
      };
      _emitConnectionState(
        SocketLifecycleState.connected,
        'Connexion chat rétablie.',
        attempt: normalizedAttempt,
      );
      _socket!.emit('chat:join', {'orderId': orderId});
      unawaited(markRead());
      // Rattrape les messages envoyés pendant une coupure réseau.
      unawaited(_loadHistory());
    });

    _socket!.onReconnectError((error) {
      _emitConnectionState(
        SocketLifecycleState.connectError,
        'Échec de reconnexion chat: ${error ?? 'erreur inconnue'}.',
      );
    });

    _socket!.onReconnectFailed((_) {
      _emitConnectionState(
        SocketLifecycleState.reconnectFailed,
        'La reconnexion du chat a échoué.',
      );
    });

    _socket!.on('chat:message', (data) {
      if (data is! Map) return;
      if (data['orderId']?.toString() != orderId) return;
      final raw = data['message'];
      if (raw is! Map) return;
      final incoming = ChatMessage.fromJson(Map<String, dynamic>.from(raw));

      // Déduplication : le socket est dans 2 rooms (user: et order::chat),
      // le même événement arrive donc potentiellement deux fois. On ignore
      // le doublon si un message avec le même id serveur est déjà présent
      // et n'est pas un optimiste en attente.
      if (incoming.id.isNotEmpty) {
        final dupIdx = _messages.indexWhere(
          (m) => m.id == incoming.id && m.status != MessageStatus.pending,
        );
        if (dupIdx >= 0) return;
      }

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
      if (_typingCtrl.isClosed) return;
      _typingCtrl.add(data['isTyping'] == true);
    });

    _socket!.on('chat:read', (data) {
      if (data is! Map) return;
      if (data['orderId']?.toString() != orderId) return;
      final readerId = data['readerId']?.toString();
      if (readerId == null || readerId == _myId) return;
      // Un lecteur actif est de facto un destinataire de la conversation
      // (utile si _loadRecipients n'a pas encore/pas pu répondre).
      _recipients.add(readerId);
      // Tous mes messages envoyés avant le timestamp sont lus PAR CE lecteur
      // (readBy) ; readAt garde la sémantique « lu par au moins un ».
      final readAt =
          DateTime.tryParse(data['at']?.toString() ?? '') ?? DateTime.now();
      var changed = false;
      for (var i = 0; i < _messages.length; i++) {
        final m = _messages[i];
        if (m.senderId != _myId || m.createdAt.isAfter(readAt)) continue;
        final alreadyRead = m.readBy.contains(readerId);
        if (m.readAt != null && alreadyRead) continue;
        _messages[i] = m.copyWith(
          readAt: m.readAt ?? readAt,
          readBy: alreadyRead ? m.readBy : [...m.readBy, readerId],
        );
        changed = true;
      }
      if (changed) _emit();
    });

    // Statut de la course (annulation, complétion…) pendant que le chat est
    // ouvert : propagé à l'écran pour fermer la saisie en direct.
    _socket!.on('orderStatusUpdated', (data) {
      if (data is! Map) return;
      if (data['orderId']?.toString() != orderId) return;
      final status = data['status']?.toString();
      if (status == null || _orderStatusCtrl.isClosed) return;
      _orderStatusCtrl.add(status);
    });

    // Enregistre d'abord les handlers afin de ne pas manquer un handshake
    // ou un premier message sur une connexion très rapide.
    _socket!.connect();
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
    if (_disposed) return;
    final localId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    final optimistic = ChatMessage(
      id: localId,
      orderId: orderId,
      senderId: _myId,
      senderFirstName: null,
      senderLastName: null,
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
    _disposed = true;
    _typingDebounce?.cancel();
    _socket?.emit('chat:leave', {'orderId': orderId});
    _socket?.dispose();
    _socket = null;
    await _messagesCtrl.close();
    await _typingCtrl.close();
    await _orderStatusCtrl.close();
    await _connectionStateCtrl.close();
  }
}
