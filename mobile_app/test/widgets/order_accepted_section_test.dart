import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/widgets/order_screen_widgets.dart';

/// Builds an [OrderAcceptedSection] wrapped in a [MaterialApp] / [Scaffold]
/// (the widget uses Material components and needs a Material parent).
Widget _wrap(Widget child) {
  return MaterialApp(
    home: Scaffold(
      // Use SingleChildScrollView to avoid layout overflow during tests on
      // small default test surface, the widget is fairly tall.
      body: SingleChildScrollView(child: child),
    ),
  );
}

void main() {
  group('OrderAcceptedSection — bouton "Annuler la commande"', () {
    testWidgets('PENDING + onCancelOrder non null → bouton visible et tap appelle le callback',
        (WidgetTester tester) async {
      var cancelled = false;

      await tester.pumpWidget(_wrap(
        OrderAcceptedSection(
          assignedLivreur: null,
          activeOrderStatus: 'PENDING',
          paymentStatus: null,
          driverPosition: null,
          driverPositionAt: null,
          distanceKm: null,
          onOpenChat: () {},
          onOpenWhatsapp: () {},
          onCancelOrder: () {
            cancelled = true;
          },
        ),
      ));

      // Le bouton doit être présent.
      expect(find.text('Annuler la commande'), findsOneWidget);

      // Tap → callback déclenché.
      await tester.ensureVisible(find.text('Annuler la commande'));
      await tester.tap(find.text('Annuler la commande'));
      await tester.pump();
      expect(cancelled, isTrue);
    });

    testWidgets('ACCEPTED → bouton "Annuler la commande" visible + bouton WhatsApp visible',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(
        OrderAcceptedSection(
          assignedLivreur: const {
            'firstName': 'Bob',
            'phone': '+22890000000',
          },
          activeOrderStatus: 'ACCEPTED',
          paymentStatus: null,
          driverPosition: null,
          driverPositionAt: null,
          distanceKm: null,
          onOpenChat: () {},
          onOpenWhatsapp: () {},
          onCancelOrder: () {},
        ),
      ));

      expect(find.text('Annuler la commande'), findsOneWidget);
      expect(find.text('Contacter le livreur par WhatsApp'), findsOneWidget);
    });

    testWidgets('IN_PROGRESS → bouton "Annuler la commande" CACHÉ mais WhatsApp visible',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(
        OrderAcceptedSection(
          assignedLivreur: const {
            'firstName': 'Bob',
            'phone': '+22890000000',
          },
          activeOrderStatus: 'IN_PROGRESS',
          paymentStatus: null,
          driverPosition: null,
          driverPositionAt: null,
          distanceKm: null,
          onOpenChat: () {},
          onOpenWhatsapp: () {},
          onCancelOrder: () {},
        ),
      ));

      expect(find.text('Annuler la commande'), findsNothing);
      expect(find.text('Contacter le livreur par WhatsApp'), findsOneWidget);
    });

    testWidgets('onCancelOrder = null → bouton CACHÉ même si status = PENDING',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(
        const OrderAcceptedSection(
          assignedLivreur: null,
          activeOrderStatus: 'PENDING',
          paymentStatus: null,
          driverPosition: null,
          driverPositionAt: null,
          distanceKm: null,
          onOpenChat: _noop,
          onOpenWhatsapp: _noop,
          onCancelOrder: null,
        ),
      ));

      expect(find.text('Annuler la commande'), findsNothing);
    });

    testWidgets('paymentStatus renseigné → badge de paiement visible',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(
        const OrderAcceptedSection(
          assignedLivreur: null,
          activeOrderStatus: 'ACCEPTED',
          paymentStatus: 'PAY_ON_DELIVERY',
          driverPosition: null,
          driverPositionAt: null,
          distanceKm: null,
          onOpenChat: _noop,
          onOpenWhatsapp: _noop,
        ),
      ));

      expect(find.text('Paiement : À la livraison'), findsOneWidget);
    });
  });
}

void _noop() {}
