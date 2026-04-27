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

/// Gère le cycle de vie du socket pour l'écran de commande client.
///
/// Le contrôleur s'abonne aux trois évènements pertinents et expose un
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

  /// Stream des positions live du livreur (filtré par [activeOrderId]).
  Stream<DriverPosition> get driverPosition$ => _driverPositionCtrl.stream;

  /// Stream des évènements `orderAccepted` (filtré par [activeOrderId]).
  Stream<OrderAcceptedEvent> get orderAccepted$ => _orderAcceptedCtrl.stream;

  /// Stream des nouveaux statuts (filtré par [activeOrderId]).
  Stream<OrderStatusUpdate> get statusUpdates$ => _statusUpdatesCtrl.stream;

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
  }

  Future<void> dispose() async {
    _socket?.dispose();
    _socket = null;
    await _driverPositionCtrl.close();
    await _orderAcceptedCtrl.close();
    await _statusUpdatesCtrl.close();
  }
}
