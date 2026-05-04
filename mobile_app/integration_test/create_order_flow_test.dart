// Integration test — Flow de création de commande (CLIENT).
//
// ⚠️ Limitations très importantes (cf. README.md du dossier) :
//
//  - `HomeTab` appelle `Geolocator.getCurrentPosition` au build initial.
//    En environnement de test, il n'y a aucun backend GPS — on mocke donc le
//    plugin `flutter.baseflow.com/geolocator` pour qu'il retourne un statut
//    "service indisponible" (le screen retombe alors sur un fallback UI sans
//    crasher).
//  - Toutes les requêtes HTTP réelles lancées par le tab (estimation,
//    récupération de la commande active, etc.) NE SONT PAS mockées. Elles
//    partiront vers `apiUrl` (par défaut `https://zonzon-backend.fly.dev`)
//    et échoueront probablement dans l'environnement de test. Le test se
//    contente donc de vérifier la BUILDABILITÉ initiale de l'écran et que
//    le pump initial ne lève pas d'exception.
//
// Pour un test E2E plus profond ("Le client crée une commande, le livreur
// l'accepte, etc."), il faudrait :
//   1. Un backend de test joignable depuis le device de test.
//   2. Un mock complet du réseau via `package:http/testing.dart` (qui exige
//      un refactor de `AuthService` / `ApiClient` pour injecter le client).
//   3. Un mock complet du plugin `geolocator` avec une position fictive.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:mobile_app/screens/client/home_tab.dart';

/// Mock minimal du plugin `flutter_secure_storage` (idem autres tests).
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

/// Mock minimal du plugin `geolocator` : on simule un service GPS désactivé,
/// ce qui force `HomeTab._initialPickupFromGps` à retomber sur le fallback
/// (`isLocationLoading = false`, `_pickup = null`).
void _installGeolocatorMock() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  Future<Object?> handler(MethodCall call) async {
    switch (call.method) {
      case 'isLocationServiceEnabled':
        return false; // → fallback `isLocationLoading=false` immédiat
      case 'checkPermission':
      case 'requestPermission':
        return 1; // LocationPermission.denied
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

void _clearMocks() {
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
  tearDown(_clearMocks);

  group('HomeTab — smoke test (CLIENT)', () {
    testWidgets(
        'pumpWidget(HomeTab) construit l\'écran sans crasher (GPS '
        'simulé indisponible)', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      // Capture des erreurs FlutterError silencieuses : si une exception est
      // levée pendant le build, on veut le savoir.
      final exceptions = <Object>[];
      final originalOnError = FlutterError.onError;
      FlutterError.onError = (details) {
        exceptions.add(details.exception);
      };
      addTearDown(() => FlutterError.onError = originalOnError);

      await tester.pumpWidget(const MaterialApp(home: HomeTab()));

      // Pump quelques frames pour laisser le initState() tourner — sans
      // pumpAndSettle (l'écran ouvre des subscriptions qui ne settle jamais).
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // L'écran est bien monté.
      expect(find.byType(HomeTab), findsOneWidget);

      // Les exceptions HTTP/socket asynchrones peuvent encore voler après
      // ce point ; le test ne garantit pas leur absence (cf. limitations).
      // En revanche, AUCUNE exception synchrone (build / initState) ne
      // doit avoir été levée.
      expect(
        exceptions,
        isEmpty,
        reason:
            'HomeTab ne doit pas crasher au build initial (GPS mocké).',
      );
    });
  });
}
