import 'dart:async';

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

/// Nouveau message chat reçu sur la commande active.
class NewChatMessageEvent {
  final String orderId;
  final Map<String, dynamic> raw;

  NewChatMessageEvent({required this.orderId, required this.raw});
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

/// Gère le cycle de vie du socket pour l'écran de commande client.
///
/// Le contrôleur s'abonne aux quatre évènements pertinents et expose un
/// `Stream` typé pour chacun. Un client n'a qu'à appeler [init] dans
/// `initState`, lire les streams puis [dispose] dans `dispose`.
///
/// Les évènements ne sont émis que pour [activeOrderId], qui peut être
/// défini après le `connect` (par exemple à la création d'une commande).
class OrderSocketController {
  OrderSocketController({AuthService? auth}) : _auth = auth ?? AuthService();

  final AuthService _auth;
  io.Socket? _socket;

  /// Identifiant de la commande active. Les évènements reçus du serveur
  /// sont filtrés sur cette valeur si elle est non-nulle.
  String? activeOrderId;

  final _driverPositionCtrl = StreamController<DriverPosition>.broadcast();
  final _orderAcceptedCtrl = StreamController<OrderAcceptedEvent>.broadcast();
  final _statusUpdatesCtrl = StreamController<OrderStatusUpdate>.broadcast();
  final _newChatMessageCtrl = StreamController<NewChatMessageEvent>.broadcast();
  final _newOrderAvailableCtrl = StreamController<NewOrderEvent>.broadcast();
  final _connectedCtrl = StreamController<void>.broadcast();

  /// Stream des positions live du livreur (filtré par [activeOrderId]).
  Stream<DriverPosition> get driverPosition$ => _driverPositionCtrl.stream;

  /// Stream des évènements `orderAccepted`. Filtré par [activeOrderId]
  /// quand celui-ci est défini (cas client). Côté livreur, [activeOrderId]
  /// reste `null` donc TOUTES les acceptations remontent — ce qui permet
  /// au radar de retirer une course dès qu'un autre livreur l'a prise.
  Stream<OrderAcceptedEvent> get orderAccepted$ => _orderAcceptedCtrl.stream;

  /// Stream des nouveaux statuts (filtré par [activeOrderId]).
  Stream<OrderStatusUpdate> get statusUpdates$ => _statusUpdatesCtrl.stream;

  /// Stream des nouveaux messages de chat reçus (pour badge non-lu).
  Stream<NewChatMessageEvent> get newChatMessage$ => _newChatMessageCtrl.stream;

  /// Stream des nouvelles courses diffusées par le backend (côté LIVREUR
  /// uniquement). Pas de filtrage sur [activeOrderId] — toutes les nouvelles
  /// courses doivent apparaître dans le radar.
  Stream<NewOrderEvent> get newOrderAvailable$ => _newOrderAvailableCtrl.stream;

  /// Stream qui émet une fois à chaque (re)connexion du socket. Utilisé
  /// côté livreur pour amorcer le tracking GPS au moment où le socket est
  /// effectivement prêt à recevoir des `driver:location`.
  Stream<void> get connected$ => _connectedCtrl.stream;

  /// Connecte le socket et abonne les listeners. À appeler une seule fois.
  Future<void> init() async {
    if (_socket != null) return;
    final token = await _auth.getToken();
    final socket = io.io(apiUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': token},
    });
    _socket = socket;
    socket.connect();

    socket.onConnect((_) {
      _connectedCtrl.add(null);
    });

    socket.on('newOrderAvailable', (data) {
      if (data is! Map) return;
      final orderId = data['id']?.toString() ?? data['orderId']?.toString();
      if (orderId == null) return;
      _newOrderAvailableCtrl.add(NewOrderEvent(
        orderId: orderId,
        raw: Map<String, dynamic>.from(data),
      ));
    });

    socket.on('orderAccepted', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      if (orderId == null) return;
      if (activeOrderId != null && orderId != activeOrderId) return;
      _orderAcceptedCtrl.add(OrderAcceptedEvent(
        orderId: orderId,
        raw: Map<String, dynamic>.from(data),
      ));
    });

    socket.on('orderStatusUpdated', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      final status = data['status']?.toString();
      if (orderId == null || status == null) return;
      if (activeOrderId != null && orderId != activeOrderId) return;
      _statusUpdatesCtrl.add(OrderStatusUpdate(orderId: orderId, status: status));
    });

    socket.on('driver:position', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      final lat = (data['lat'] as num?)?.toDouble();
      final lng = (data['lng'] as num?)?.toDouble();
      if (orderId == null || lat == null || lng == null) return;
      if (activeOrderId != null && orderId != activeOrderId) return;
      _driverPositionCtrl.add(DriverPosition(
        orderId: orderId,
        location: LatLng(lat, lng),
        receivedAt: DateTime.now(),
      ));
    });

    // Écouter les nouveaux messages du livreur pour afficher un badge non-lu.
    socket.on('chat:message', (data) {
      if (data is! Map) return;
      final orderId = data['orderId']?.toString();
      if (orderId == null) return;
      if (activeOrderId != null && orderId != activeOrderId) return;
      _newChatMessageCtrl.add(NewChatMessageEvent(
        orderId: orderId,
        raw: Map<String, dynamic>.from(data),
      ));
    });
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

  Future<void> dispose() async {
    _socket?.dispose();
    _socket = null;
    await _driverPositionCtrl.close();
    await _orderAcceptedCtrl.close();
    await _statusUpdatesCtrl.close();
    await _newChatMessageCtrl.close();
    await _newOrderAvailableCtrl.close();
    await _connectedCtrl.close();
  }
}
