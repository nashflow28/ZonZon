import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/utils/order_status_utils.dart';

void main() {
  test('REFUNDED est un paiement réglé', () {
    expect(PaymentStatusUtils.isSettled('REFUNDED'), isTrue);
    expect(PaymentStatusUtils.isSettled('UNPAID'), isFalse);
  });

  test('les statuts terminaux ferment les actions de conversation', () {
    expect(OrderStatusUtils.isTerminal('COMPLETED'), isTrue);
    expect(OrderStatusUtils.isTerminal('CANCELLED'), isTrue);
    expect(OrderStatusUtils.isTerminal('FAILED'), isTrue);
    expect(OrderStatusUtils.isTerminal('IN_PROGRESS'), isFalse);
  });
}
