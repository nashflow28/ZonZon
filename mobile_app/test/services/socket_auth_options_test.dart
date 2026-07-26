import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/controllers/order_socket_controller.dart';
import 'package:mobile_app/services/chat_service.dart';

void main() {
  group('OrderSocketController socket auth', () {
    test('refuse de créer un socket sans JWT exploitable', () {
      expect(OrderSocketController.hasUsableToken(null), isFalse);
      expect(OrderSocketController.hasUsableToken(''), isFalse);
      expect(OrderSocketController.hasUsableToken('   '), isFalse);
      expect(OrderSocketController.hasUsableToken('token-123'), isTrue);
    });

    test('construit un handshake Socket.IO avec auth et header Bearer', () {
      final options = OrderSocketController.buildSocketOptions('  token-123  ');

      expect(options['auth'], {'token': 'token-123'});
      expect(options['extraHeaders'], {'Authorization': 'Bearer token-123'});
      expect(options['transports'], ['websocket']);
      expect(options['autoConnect'], isFalse);
      // Reconnexion illimitée : une limite finie faisait abandonner le socket
      // après ~40 s de coupure réseau, sans aucune reprise tant que l'app
      // restait au premier plan.
      expect(options['reconnectionAttempts'], double.infinity);
      expect(options['reconnectionDelay'], 1000);
      expect(options['reconnectionDelayMax'], 5000);
      expect(options['timeout'], 8000);
    });
  });

  group('ChatService socket auth', () {
    test('refuse de créer un socket sans JWT exploitable', () {
      expect(ChatService.hasUsableToken(null), isFalse);
      expect(ChatService.hasUsableToken(''), isFalse);
      expect(ChatService.hasUsableToken('   '), isFalse);
      expect(ChatService.hasUsableToken('token-456'), isTrue);
    });

    test('construit le même handshake robuste pour le chat', () {
      final options = ChatService.buildSocketOptions(' token-456 ');

      expect(options['auth'], {'token': 'token-456'});
      expect(options['extraHeaders'], {'Authorization': 'Bearer token-456'});
      expect(options['transports'], ['websocket']);
      expect(options['autoConnect'], isFalse);
      // Reconnexion illimitée : une limite finie faisait abandonner le socket
      // après ~40 s de coupure réseau, sans aucune reprise tant que l'app
      // restait au premier plan.
      expect(options['reconnectionAttempts'], double.infinity);
      expect(options['reconnectionDelay'], 1000);
      expect(options['reconnectionDelayMax'], 5000);
      expect(options['timeout'], 8000);
    });
  });
}
