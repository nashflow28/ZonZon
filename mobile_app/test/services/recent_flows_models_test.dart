import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/services/merchant_drivers_service.dart';
import 'package:mobile_app/services/merchant_orders_service.dart';
import 'package:mobile_app/services/notifications_service.dart';

void main() {
  test('une invitation d’affiliation PENDING est correctement interprétée', () {
    final invite = DriverAffiliationInvite.fromJson({
      'merchantId': 'merchant-1',
      'status': 'PENDING',
      'merchant': {
        'id': 'merchant-1',
        'firstName': 'Kossi',
        'lastName': 'Shop',
      },
    });

    expect(invite.isPending, isTrue);
    expect(invite.merchant?.fullName, 'Kossi Shop');
  });

  test(
    'une création commerçant exige un client avant tout appel API',
    () async {
      await expectLater(
        MerchantOrdersService().createMerchantOrder(
          pickupAddress: 'Marché',
          deliveryAddress: 'Adidogomé',
          description: 'Colis',
        ),
        throwsA(isA<MerchantOrderException>()),
      );
    },
  );

  test('une notification persistée conserve sa cible de navigation', () {
    final page = NotificationsPage.fromJson({
      'items': [
        {
          'id': 'notif-1',
          'deliveryId': 'order-1',
          'type': 'new_order',
          'title': 'Nouvelle course',
          'body': 'Une course est disponible',
          'createdAt': '2026-07-10T10:00:00.000Z',
        },
      ],
      'page': 1,
      'total': 1,
      'limit': 20,
      'hasMore': false,
    });

    expect(page.items.single.deliveryId, 'order-1');
    expect(page.items.single.isUnread, isTrue);
  });
}
