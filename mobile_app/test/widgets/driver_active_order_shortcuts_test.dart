import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/widgets/driver_active_order_shortcuts.dart';

void main() {
  testWidgets('affiche chaque arrêt actif et ouvre celui touché', (
    tester,
  ) async {
    String? openedId;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DriverActiveOrderShortcuts(
            orders: const [
              {
                'id': 'one',
                'status': 'IN_PROGRESS',
                'pickupAddress': 'Boutique',
                'deliveryAddress': 'Client A',
                'priceFcfa': 1500,
              },
              {
                'id': 'two',
                'status': 'ACCEPTED',
                'pickupAddress': 'Boutique',
                'deliveryAddress': 'Client B',
                'priceFcfa': 2500,
              },
            ],
            onOpen: (order) => openedId = order['id']?.toString(),
          ),
        ),
      ),
    );

    expect(find.text('Course en cours - En cours'), findsOneWidget);
    expect(find.text('Boutique -> Client B'), findsOneWidget);
    expect(find.text('2 500 FCFA'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('active-order-two')));
    await tester.pump();
    expect(openedId, 'two');
  });
}
