import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/utils/driver_active_orders.dart';

void main() {
  test('un statut terminal retire uniquement la course concernée', () {
    final result = applyActiveOrderStatus(
      [
        {'id': 'one', 'status': 'IN_PROGRESS'},
        {'id': 'two', 'status': 'ACCEPTED'},
      ],
      'one',
      'COMPLETED',
    );

    expect(result, hasLength(1));
    expect(result.single['id'], 'two');
  });

  test('statut et paiement sont mis à jour pour une course non ouverte', () {
    final orders = [
      {'id': 'one', 'status': 'ACCEPTED', 'paymentStatus': 'UNPAID'},
      {'id': 'two', 'status': 'ACCEPTED', 'paymentStatus': 'UNPAID'},
    ];

    final withStatus = applyActiveOrderStatus(orders, 'two', 'IN_PROGRESS');
    final result = applyActiveOrderPayment(withStatus, 'two', 'PAID');

    expect(result[1]['status'], 'IN_PROGRESS');
    expect(result[1]['paymentStatus'], 'PAID');
    expect(result[0]['status'], 'ACCEPTED');
  });
}
