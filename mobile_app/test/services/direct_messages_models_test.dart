import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/services/direct_messages_service.dart';

void main() {
  test('parse le résumé enrichi d’une conversation directe', () {
    final contact = DirectContact.fromJson({
      'id': 'driver-1',
      'firstName': 'Kofi',
      'lastName': 'Mensah',
      'role': 'LIVREUR',
      'phone': '+22890000000',
      'lastMessage': 'Je suis en route',
      'lastMessageAt': '2026-07-14T10:00:00.000Z',
      'unreadCount': 2,
    });

    expect(contact.name, 'Kofi Mensah');
    expect(contact.lastMessage, 'Je suis en route');
    expect(contact.unreadCount, 2);
    expect(contact.lastMessageAt, DateTime.utc(2026, 7, 14, 10));
  });

  test('conserve la course associée à un message direct', () {
    final message = DirectMessageItem.fromJson({
      'id': 'message-1',
      'senderId': 'client-1',
      'content': 'Je suis devant',
      'orderId': 'order-1',
    });

    expect(message.orderId, 'order-1');
  });
}
