import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/screens/driver_navigation_screen.dart';

void main() {
  testWidgets('shows the pickup destination before parcel collection', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: DriverNavigationScreen(
          status: 'ACCEPTED',
          pickupAddress: 'Marché de Lomé',
          deliveryAddress: 'Bè',
          pickupLat: 6.13,
          pickupLng: 1.22,
          deliveryLat: 6.14,
          deliveryLng: 1.23,
        ),
      ),
    );

    expect(find.text('Direction : retrait'), findsOneWidget);
    expect(find.text('Marché de Lomé'), findsOneWidget);
  });
}
