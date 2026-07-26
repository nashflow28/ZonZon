import '../controllers/order_socket_controller.dart';

/// Ressources temps réel uniques pour toute la session authentifiée.
class RealtimeServices {
  RealtimeServices._();

  static OrderSocketController? _socket;

  static OrderSocketController get socket =>
      _socket ??= OrderSocketController();

  static Future<void> resynchronize() async {
    await _socket?.resynchronize();
  }

  static Future<void> reset() async {
    final socket = _socket;
    _socket = null;
    if (socket != null) await socket.dispose();
  }
}
