import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/env.dart';
import '../services/auth_service.dart';

/// Position live du livreur diffusée par le backend toutes les ~30 s.
class DriverPosition {
  final String orderId;
  final LatLng location;
  final DateTime receivedAt;

  DriverPosition({
    required this.orderId,
    required this.location,
    required this.receivedAt,
  });
}

/// Évènement `orderAccepted` : le backend signale qu'un livreur a accepté
/// la course identifiée par [orderId]. Le payload brut est fourni pour
/// les consommateurs qui veulent extraire d'autres champs.
class OrderAcceptedEvent {
  final String orderId;
  final Map<String, dynamic> raw;

  OrderAcceptedEvent({required this.orderId, required this.raw});
}

/// Mise à jour de statut `orderStatusUpdated`.
class OrderStatusUpdate {
  final String orderId;
  final String status;

  OrderStatusUpdate({required this.orderId, required this.status});
}

/// Mise à jour du statut de PAIEMENT `orderPaymentUpdated` (diffusé par le
/// backend au client, au livreur et au commerçant de la course).
class OrderPaymentUpdate {
  final String orderId;
  final String paymentStatus;

  OrderPaymentUpdate({required this.orderId, required this.paymentStatus});
}

/// Nouveau message chat reçu sur la commande active.
class NewChatMessageEvent {
  final String orderId;
  final Map<String, dynamic> raw;

  NewChatMessageEvent({required this.orderId, required this.raw});
}

/// Message général reçu via `direct:message`.
///
/// Contrairement au chat de course, ce fil est partagé entre deux personnes
/// et peut optionnellement être relié à une commande. Il ne doit donc pas
/// être filtré par [watchedOrderIds].
class DirectMessageEvent {
  final String senderId;
  final String recipientId;
  final Map<String, dynamic> raw;

  DirectMessageEvent({
    required this.senderId,
    required this.recipientId,
    required this.raw,
  });
}

/// Nouvelle course disponible diffusée par le backend (côté LIVREUR).
///
/// Le payload brut contient les champs habituels d'une commande (id,
/// pickupAddress, deliveryAddress, priceFcfa, distanceKm, etc.). On expose
/// l'objet complet pour que l'écran radar puisse l'afficher tel quel.
class NewOrderEvent {
  final String orderId;
  final Map<String, dynamic> raw;

  NewOrderEvent({required this.orderId, required this.raw});
}

enum SocketLifecycleState {
  skipped,
  connecting,
  connected,
  disconnected,
  reconnecting,
  reconnectFailed,
  connectError,
  error,
}

class SocketLifecycleEvent {
  final SocketLifecycleState state;
  final String message;
  final int? attempt;
  final DateTime occurredAt;

  const SocketLifecycleEvent({
    required this.state,
    required this.message,
    this.attempt,
    required this.occurredAt,
  });
}

/// Gère le cycle de vie du socket pour les écrans client et livreur.
///
/// Le contrôleur s'abonne aux évènements pertinents et expose un `Stream`
/// typé pour chacun. Un consommateur appelle [init] dans `initState`, lit
/// les streams puis [dispose] dans `dispose`.
///
/// Le contrôleur partagé propage tous les événements autorisés par le serveur.
/// Chaque consommateur filtre ensuite son propre `orderId`; un écran ne peut
/// ainsi plus masquer les événements d'un autre écran en modifiant un filtre
/// global. [watchedOrderIds] reste disponible pour le suivi local des courses
/// actives et la rétrocompatibilité.
class OrderSocketController {
  OrderSocketController({AuthService? auth}) : _auth = auth ?? AuthService();

  final AuthService _auth;
  io.Socket? _socket;
  Future<void>? _initializing;

  /// Set local des orderIds suivis, sans effet sur les streams partagés.
  final Set<String> _watchedOrderIds = <String>{};

  /// Vue immutable de l'ensemble des orderIds suivis (utile pour debug/tests).
  Set<String> get watchedOrderIds => Set.unmodifiable(_watchedOrderIds);

  /// Ajoute un orderId au registre local. Idempotent.
  void watchOrder(String orderId) {
    _watchedOrderIds.add(orderId);
  }

  /// Retire un orderId du registre local. No-op s'il n'est pas présent.
  void unwatchOrder(String orderId) {
    _watchedOrderIds.remove(orderId);
  }

  /// Vide le set des orderIds suivis. À utiliser au logout par ex.
  void clearWatchedOrders() {
    _watchedOrderIds.clear();
  }

  /// API legacy single-id : remplace tout le set par cet orderId
  /// (ou le vide si null).
  ///
  /// @deprecated Préférer [watchOrder] / [unwatchOrder] qui supportent
  /// nativement plusieurs commandes simultanées.
  String? get activeOrderId =>
      _watchedOrderIds.length == 1 ? _watchedOrderIds.first : null;
  set activeOrderId(String? value) {
    _watchedOrderIds.clear();
    if (value != null) _watchedOrderIds.add(value);
  }

  final _driverPositionCtrl = StreamController<DriverPosition>.broadcast();
  final _orderAcceptedCtrl = StreamController<OrderAcceptedEvent>.broadcast();
  final _statusUpdatesCtrl = StreamController<OrderStatusUpdate>.broadcast();
  final _paymentUpdatesCtrl = StreamController<OrderPaymentUpdate>.broadcast();
  final _newChatMessageCtrl = StreamController<NewChatMessageEvent>.broadcast();
  final _directMessageCtrl = StreamController<DirectMessageEvent>.broadcast();
  final _newOrderAvailableCtrl = StreamController<NewOrderEvent>.broadcast();
  final _connectedCtrl = StreamController<void>.broadcast();
  final _lifecycleCtrl = StreamController<SocketLifecycleEvent>.broadcast();

  /// Stream des positions live du livreur (filtré par [watchedOrderIds]).
  Stream<DriverPosition> get driverPosition$ => _driverPositionCtrl.stream;

  /// Stream des évènements `orderAccepted`. Filtré par [watchedOrderIds] quand
  /// le set est non-vide (cas client). Côté livreur, le set reste vide donc
  /// TOUTES les acceptations remontent — ce qui permet au radar de retirer
  /// une course dès qu'un autre livreur la prend.
  Stream<OrderAcceptedEvent> get orderAccepted$ => _orderAcceptedCtrl.stream;

  /// Stream des nouveaux statuts (filtré par [watchedOrderIds]).
  Stream<OrderStatusUpdate> get statusUpdates$ => _statusUpdatesCtrl.stream;

  /// Stream des changements de statut de paiement (filtré par
  /// [watchedOrderIds]). Permet à toutes les parties de voir un paiement
  /// marqué « payé » sans recharger l'écran.
  Stream<OrderPaymentUpdate> get paymentUpdates$ => _paymentUpdatesCtrl.stream;

  /// Stream des nouveaux messages de chat reçus (filtré par [watchedOrderIds]).
  /// Le consommateur doit lire `evt.orderId` pour aiguiller le badge non-lu
  /// vers la bonne commande quand plusieurs sont actives en parallèle.
  Stream<NewChatMessageEvent> get newChatMessage$ => _newChatMessageCtrl.stream;

  /// Messages généraux client/livreur ou commerçant/livreur en temps réel.
  Stream<DirectMessageEvent> get directMessages$ => _directMessageCtrl.stream;

  /// Stream des nouvelles courses diffusées par le backend (côté LIVREUR
  /// uniquement). Pas de filtrage sur [activeOrderId] — toutes les nouvelles
  /// courses doivent apparaître dans le radar.
  Stream<NewOrderEvent> get newOrderAvailable$ => _newOrderAvailableCtrl.stream;

  /// Stream qui émet une fois à chaque (re)connexion du socket. Utilisé
  /// côté livreur pour amorcer le tracking GPS au moment où le socket est
  /// effectivement prêt à recevoir des `driver:location`.
  Stream<void> get connected$ => _connectedCtrl.stream;

  /// État du transport Socket.IO : utile pour afficher des erreurs concrètes
  /// et relancer une resynchronisation HTTP au bon moment.
  Stream<SocketLifecycleEvent> get lifecycle$ => _lifecycleCtrl.stream;

  bool get isConnected => _socket?.connected == true;

  /// `true` après [dispose] : init() lancé sans await par un écran peut se
  /// terminer APRÈS le dispose de cet écran — sans ce flag, on créerait un
  /// socket orphelin jamais fermé.
  bool _disposed = false;

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

  void _emitLifecycle(
    SocketLifecycleState state,
    String message, {
    int? attempt,
  }) {
    if (_lifecycleCtrl.isClosed) return;
    _lifecycleCtrl.add(
      SocketLifecycleEvent(
        state: state,
        message: message,
        attempt: attempt,
        occurredAt: DateTime.now(),
      ),
    );
  }

  /// Connecte le socket et abonne les listeners. Les appels concurrents
  /// partagent la même initialisation pour garantir un seul transport.
  Future<void> init() {
    if (_socket != null || _disposed) return Future.value();
    return _initializing ??= _initialize().whenComplete(() {
      _initializing = null;
    });
  }

  Future<void> _initialize() async {
    if (_socket != null || _disposed) return;
    final token = await _auth.getToken();
    if (_disposed) return; // dispose() est passé pendant l'await du token
    if (!hasUsableToken(token)) {
      _emitLifecycle(
        SocketLifecycleState.skipped,
        'Connexion temps réel ignorée: JWT absent.',
      );
      return;
    }

    // Certains transports WebSocket natifs ne transmettent pas toujours
    // `auth` jusqu'au handshake Socket.IO. Le backend accepte aussi Bearer.
    final socket = io.io(apiUrl, buildSocketOptions(token!));
    _socket = socket;
    _emitLifecycle(
      SocketLifecycleState.connecting,
      'Connexion au temps réel en cours…',
    );
    socket.onConnect((_) {
      _emitLifecycle(
        SocketLifecycleState.connected,
        'Connexion temps réel établie.',
      );
      _connectedCtrl.add(null);
    });

    socket.onDisconnect((reason) {
      _emitLifecycle(
        SocketLifecycleState.disconnected,
        'Temps réel déconnecté: ${reason ?? 'raison inconnue'}.',
      );
    });

    socket.onConnectError((error) {
      _emitLifecycle(
        SocketLifecycleState.connectError,
        'Échec de connexion temps réel: ${error ?? 'erreur inconnue'}.',
      );
    });

    socket.onError((error) {
      _emitLifecycle(
        SocketLifecycleState.error,
        'Erreur Socket.IO: ${error ?? 'erreur inconnue'}.',
      );
    });

    socket.onReconnectAttempt((attempt) {
      final normalizedAttempt = switch (attempt) {
        int value => value,
        num value => value.toInt(),
        _ => null,
      };
      _emitLifecycle(
        SocketLifecycleState.reconnecting,
        'Reconnexion temps réel en cours…',
        attempt: normalizedAttempt,
      );
    });

    socket.onReconnect((attempt) {
      final normalizedAttempt = switch (attempt) {
        int value => value,
        num value => value.toInt(),
        _ => null,
      };
      _emitLifecycle(
        SocketLifecycleState.connected,
        'Connexion temps réel rétablie.',
        attempt: normalizedAttempt,
      );
      // Les écrans utilisent ce signal pour resynchroniser HTTP les
      // événements qui ont pu arriver pendant la coupure réseau.
      _connectedCtrl.add(null);
    });

    socket.onReconnectError((error) {
      _emitLifecycle(
        SocketLifecycleState.connectError,
        'Échec de reconnexion temps réel: ${error ?? 'erreur inconnue'}.',
      );
    });

    socket.onReconnectFailed((_) {
      _emitLifecycle(
        SocketLifecycleState.reconnectFailed,
        'La reconnexion temps réel a échoué.',
      );
    });

    socket.on('newOrderAvailable', (data) {
      if (data is! Map) return;
      final orderId = data['id']?.toString() ?? data['orderId']?.toString();
      if (orderId == null) return;
      _newOrderAvailableCtrl.add(
        NewOrderEvent(orderId: orderId, raw: Map<String, dynamic>.from(data)),
      );
    });

    socket.on('orderAccepted', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      if (orderId == null) return;
      _orderAcceptedCtrl.add(
        OrderAcceptedEvent(
          orderId: orderId,
          raw: Map<String, dynamic>.from(data),
        ),
      );
    });

    socket.on('orderStatusUpdated', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      final status = data['status']?.toString();
      if (orderId == null || status == null) return;
      _statusUpdatesCtrl.add(
        OrderStatusUpdate(orderId: orderId, status: status),
      );
    });

    socket.on('orderPaymentUpdated', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      final paymentStatus = data['paymentStatus']?.toString();
      if (orderId == null || paymentStatus == null) return;
      _paymentUpdatesCtrl.add(
        OrderPaymentUpdate(orderId: orderId, paymentStatus: paymentStatus),
      );
    });

    socket.on('driver:position', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      final lat = (data['lat'] as num?)?.toDouble();
      final lng = (data['lng'] as num?)?.toDouble();
      if (orderId == null || lat == null || lng == null) return;
      _driverPositionCtrl.add(
        DriverPosition(
          orderId: orderId,
          location: LatLng(lat, lng),
          receivedAt: DateTime.now(),
        ),
      );
    });

    // Écouter les nouveaux messages du livreur pour afficher un badge non-lu.
    socket.on('chat:message', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      if (orderId == null) return;
      _newChatMessageCtrl.add(
        NewChatMessageEvent(
          orderId: orderId,
          raw: Map<String, dynamic>.from(data),
        ),
      );
    });

    socket.on('direct:message', (data) {
      if (data is! Map) return;
      final senderId = data['senderId']?.toString();
      final recipientId = data['recipientId']?.toString();
      final message = data['message'];
      if (senderId == null || recipientId == null || message is! Map) return;
      _directMessageCtrl.add(
        DirectMessageEvent(
          senderId: senderId,
          recipientId: recipientId,
          raw: Map<String, dynamic>.from(message),
        ),
      );
    });

    // Tous les listeners doivent être prêts avant le handshake : une
    // connexion très rapide ne doit pas empêcher la resynchronisation radar.
    socket.connect();
  }

  /// Émet la position GPS du livreur sur le socket (`driver:location`).
  ///
  /// [heartbeat] est mis à `true` quand l'émission est forcée par le timer
  /// de fallback (la position n'a pas changé depuis 90 s) — le backend peut
  /// éventuellement l'utiliser pour distinguer une vraie mise à jour d'un
  /// simple "je suis toujours là".
  void emitDriverLocation(double lat, double lng, {bool heartbeat = false}) {
    final payload = <String, dynamic>{'lat': lat, 'lng': lng};
    if (heartbeat) payload['heartbeat'] = true;
    _socket?.emit('driver:location', payload);
  }

  /// Rattrape les événements potentiellement manqués pendant que
  /// l'application était en arrière-plan. Si le transport est encore actif,
  /// les consommateurs déclenchent immédiatement leur resynchronisation HTTP;
  /// sinon Socket.IO relance le handshake puis émettra le même signal.
  Future<void> resynchronize() async {
    if (_disposed) return;
    if (_socket == null) {
      await init();
      return;
    }
    if (_socket!.connected) {
      if (!_connectedCtrl.isClosed) _connectedCtrl.add(null);
      return;
    }
    _socket!.connect();
  }

  Future<void> dispose() async {
    _disposed = true;
    _socket?.dispose();
    _socket = null;
    await _driverPositionCtrl.close();
    await _orderAcceptedCtrl.close();
    await _statusUpdatesCtrl.close();
    await _paymentUpdatesCtrl.close();
    await _newChatMessageCtrl.close();
    await _directMessageCtrl.close();
    await _newOrderAvailableCtrl.close();
    await _connectedCtrl.close();
    await _lifecycleCtrl.close();
  }
}
