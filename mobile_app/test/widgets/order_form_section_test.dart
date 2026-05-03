import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:mobile_app/models/place.dart';
import 'package:mobile_app/widgets/order_screen_widgets.dart';

/// Wraps a widget in a tall MaterialApp/Scaffold + scroll view because
/// `OrderFormSection` is taller than the default test surface (~600 px).
Widget _wrap(Widget child) {
  return MaterialApp(
    home: Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SingleChildScrollView(child: child),
    ),
  );
}

Place _samplePlace(String name) => Place(
      displayName: '$name, Lomé, Togo',
      shortName: name,
      location: const LatLng(6.13, 1.22),
    );

void main() {
  group('OrderFormSection', () {
    testWidgets(
        'rendu de base — pickup et delivery null → placeholders affichés',
        (tester) async {
      // Larger physical size to fit the form without overflow logs.
      await tester.binding.setSurfaceSize(const Size(420, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final descCtrl = TextEditingController();
      addTearDown(descCtrl.dispose);

      await tester.pumpWidget(_wrap(
        OrderFormSection(
          pickup: null,
          delivery: null,
          descController: descCtrl,
          hasShopOrigin: false,
          shopProductName: null,
          estimateLoading: false,
          estimateKm: null,
          estimatePrice: null,
          submitLoading: false,
          onOpenShops: () {},
          onCancelShop: () {},
          onPickPickup: () {},
          onPickDelivery: () {},
          onSwap: () {},
          onSubmit: () {},
        ),
      ));

      // En-tête + libellés des deux cartes d'adresse vides.
      expect(find.text('Prêt à livrer ?'), findsOneWidget);
      expect(find.text('Choisir le point de départ'), findsOneWidget);
      expect(find.text('Choisir le point d’arrivée'), findsOneWidget);

      // Bouton "Commander maintenant" présent (jamais disabled visuellement,
      // mais l'estimation absente l'empêche d'être utile — on vérifie surtout
      // qu'aucun spinner n'est visible).
      expect(find.text('Commander maintenant'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets(
        'submitLoading=true → spinner visible et bouton désactivé',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final descCtrl = TextEditingController();
      addTearDown(descCtrl.dispose);

      var submitTapped = false;
      await tester.pumpWidget(_wrap(
        OrderFormSection(
          pickup: _samplePlace('Quartier A'),
          delivery: _samplePlace('Quartier B'),
          descController: descCtrl,
          hasShopOrigin: false,
          shopProductName: null,
          estimateLoading: false,
          estimateKm: 3.2,
          estimatePrice: 480,
          submitLoading: true,
          onOpenShops: () {},
          onCancelShop: () {},
          onPickPickup: () {},
          onPickDelivery: () {},
          onSwap: () {},
          onSubmit: () {
            submitTapped = true;
          },
        ),
      ));

      // Quand loading=true, le widget remplace le label par un
      // CircularProgressIndicator dans le bouton primaire.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      // Le label "Commander maintenant" doit avoir disparu (remplacé par
      // le spinner).
      expect(find.text('Commander maintenant'), findsNothing);

      // Tap sur le bouton ne doit rien faire (onPressed=null).
      final btn = find.byType(ElevatedButton).first;
      await tester.tap(btn, warnIfMissed: false);
      await tester.pump();
      expect(submitTapped, isFalse);
    });

    testWidgets(
        'estimation présente — affiche distance et prix formaté',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final descCtrl = TextEditingController();
      addTearDown(descCtrl.dispose);

      await tester.pumpWidget(_wrap(
        OrderFormSection(
          pickup: _samplePlace('Adidogomé'),
          delivery: _samplePlace('Bè'),
          descController: descCtrl,
          hasShopOrigin: false,
          shopProductName: null,
          estimateLoading: false,
          estimateKm: 3.2,
          estimatePrice: 480,
          submitLoading: false,
          onOpenShops: () {},
          onCancelShop: () {},
          onPickPickup: () {},
          onPickDelivery: () {},
          onSwap: () {},
          onSubmit: () {},
        ),
      ));

      // Distance formatée à 1 décimale (toStringAsFixed(1)) et "km".
      expect(find.text('3.2 km'), findsOneWidget);
      // Prix formaté avec espace tous les 3 chiffres + " FCFA".
      expect(find.text('480 FCFA'), findsOneWidget);
    });

    testWidgets(
        'hasShopOrigin=true → ShopOriginBanner visible avec le nom du produit',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final descCtrl = TextEditingController();
      addTearDown(descCtrl.dispose);

      var cancelShopCalled = false;
      await tester.pumpWidget(_wrap(
        OrderFormSection(
          pickup: _samplePlace('Boutique X'),
          delivery: null,
          descController: descCtrl,
          hasShopOrigin: true,
          shopProductName: 'Pizza Margherita',
          estimateLoading: false,
          estimateKm: null,
          estimatePrice: null,
          submitLoading: false,
          onOpenShops: () {},
          onCancelShop: () {
            cancelShopCalled = true;
          },
          onPickPickup: () {},
          onPickDelivery: () {},
          onSwap: () {},
          onSubmit: () {},
        ),
      ));

      // ShopOriginBanner est rendu et affiche le nom du produit.
      expect(find.byType(ShopOriginBanner), findsOneWidget);
      expect(find.text('Commande : Pizza Margherita'), findsOneWidget);

      // Tap sur l'icône fermer doit appeler onCancelShop.
      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      expect(cancelShopCalled, isTrue);
    });
  });
}
