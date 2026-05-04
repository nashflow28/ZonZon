// Integration test — Smoke test des écrans d'accueil par rôle.
//
// Depuis la migration vers `go_router` + `StatefulShellRoute`, l'aiguillage
// par rôle est fait dans `_globalRedirect` (cf. `lib/router/app_router.dart`)
// au lieu d'un widget `HomeScreen` aiguilleur. Tester ce redirect requiert
// le router complet + un mock de l'auth, ce qui dépasse le scope du smoke
// test. On valide ici uniquement que les écrans cibles montent sans crash.
//
// Limitations :
//  - On ne vérifie pas le routing par rôle (testé à la main / en CI manuel).
//  - Les écrans cibles (HomeTab, DriverScreen, MerchantHomeScreen)
//    déclenchent des appels réseau / GPS qui ne sont pas mockés. On vérifie
//    juste qu'ils se construisent sans lever d'exception synchrone.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:mobile_app/driver_screen.dart';
import 'package:mobile_app/screens/client/home_tab.dart';
import 'package:mobile_app/screens/merchant_home_screen.dart';

void _installSecureStorageMock() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const channel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  messenger.setMockMethodCallHandler(channel, (call) async {
    switch (call.method) {
      case 'read':
        return null;
      case 'readAll':
        return <String, String>{};
      case 'write':
      case 'delete':
      case 'deleteAll':
        return null;
      case 'containsKey':
        return false;
      default:
        return null;
    }
  });
}

void _installGeolocatorMock() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  Future<Object?> handler(MethodCall call) async {
    switch (call.method) {
      case 'isLocationServiceEnabled':
        return false;
      case 'checkPermission':
      case 'requestPermission':
        return 1; // denied
      case 'getCurrentPosition':
      case 'getLastKnownPosition':
        return null;
      default:
        return null;
    }
  }

  for (final name in const [
    'flutter.baseflow.com/geolocator',
    'flutter.baseflow.com/geolocator_android',
    'flutter.baseflow.com/geolocator_apple',
  ]) {
    messenger.setMockMethodCallHandler(MethodChannel(name), handler);
  }
}

void _clearAllMocks() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  for (final name in const [
    'plugins.it_nomads.com/flutter_secure_storage',
    'flutter.baseflow.com/geolocator',
    'flutter.baseflow.com/geolocator_android',
    'flutter.baseflow.com/geolocator_apple',
  ]) {
    messenger.setMockMethodCallHandler(MethodChannel(name), null);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    _installSecureStorageMock();
    _installGeolocatorMock();
  });
  tearDown(_clearAllMocks);

  group('Smoke test — écrans cibles par rôle', () {
    testWidgets('CLIENT → HomeTab monte sans crash', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: HomeTab()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(HomeTab), findsOneWidget);
    });

    testWidgets('LIVREUR → DriverScreen monte sans crash', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: DriverScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(DriverScreen), findsOneWidget);
    });

    testWidgets('COMMERCANT → MerchantHomeScreen monte sans crash',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: MerchantHomeScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(MerchantHomeScreen), findsOneWidget);
    });
  });
}
