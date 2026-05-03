// Integration test — Smoke test du HomeScreen.
//
// Stratégie : on mocke `flutter_secure_storage` pour qu'il retourne un user
// fictif différent à chaque test (CLIENT, LIVREUR, COMMERCANT, ADMIN). Le
// HomeScreen lit `current_user` via `AuthService().getCurrentUser()` puis
// route vers l'écran approprié.
//
// Limitations :
//  - Les écrans cibles (OrderScreen, DriverScreen, MerchantHomeScreen)
//    déclenchent des appels réseau / GPS. On ne pumpAndSettle PAS ; on
//    vérifie juste que le `runtimeType` du child rendu correspond à ce
//    qu'on attend pour chaque rôle.
//  - Pour le rôle ADMIN, on vérifie la présence du message neutre
//    "Compte administrateur. Utilisez le tableau de bord web." (l'app
//    mobile n'a pas d'écran admin).
//  - Le plugin `geolocator` est aussi mocké (cas LIVREUR / CLIENT qui
//    déclenchent des lookups GPS au build).

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:mobile_app/driver_screen.dart';
import 'package:mobile_app/home_screen.dart';
import 'package:mobile_app/order_screen.dart';
import 'package:mobile_app/screens/merchant_home_screen.dart';

/// Construit un payload User minimal valide pour `User.fromJson`.
String _userJson(String role) => jsonEncode({
      'id': 'test-user-id',
      'firstName': 'Test',
      'lastName': 'User',
      'phone': '+22890000000',
      'role': role,
    });

/// Installe un handler `flutter_secure_storage` qui renvoie un user fictif
/// avec le `role` donné quand on lit la clé `current_user`. Toujours
/// `null` pour `access_token` (pas besoin pour le smoke test).
void _installSecureStorageWithRole(String role) {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const channel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  messenger.setMockMethodCallHandler(channel, (call) async {
    switch (call.method) {
      case 'read':
        final args = call.arguments;
        // En fonction de la version : `arguments` peut être Map<String, ...>
        // ou String selon le plugin. On cherche la clé "current_user" dans
        // les deux formes.
        String? key;
        if (args is Map) {
          key = args['key']?.toString();
        } else if (args is String) {
          key = args;
        }
        if (key == 'current_user') {
          return _userJson(role);
        }
        return null;
      case 'readAll':
        return <String, String>{
          'current_user': _userJson(role),
        };
      case 'write':
      case 'delete':
      case 'deleteAll':
        return null;
      case 'containsKey':
        return true;
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

  setUp(_installGeolocatorMock);
  tearDown(_clearAllMocks);

  group('HomeScreen — aiguillage par rôle', () {
    testWidgets('rôle CLIENT → OrderScreen', (tester) async {
      _installSecureStorageWithRole('CLIENT');
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: HomeScreen()));
      // Premier pump : initState lance _loadRole() (async).
      await tester.pump();
      // Laisse le Future résoudre.
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(OrderScreen), findsOneWidget);
    });

    testWidgets('rôle LIVREUR → DriverScreen', (tester) async {
      _installSecureStorageWithRole('LIVREUR');
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: HomeScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(DriverScreen), findsOneWidget);
    });

    testWidgets('rôle COMMERCANT → MerchantHomeScreen', (tester) async {
      _installSecureStorageWithRole('COMMERCANT');
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: HomeScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(MerchantHomeScreen), findsOneWidget);
    });

    testWidgets(
        'rôle ADMIN → page neutre avec message "Compte administrateur"',
        (tester) async {
      _installSecureStorageWithRole('ADMIN');
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: HomeScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Pas de DriverScreen / OrderScreen / MerchantHomeScreen.
      expect(find.byType(DriverScreen), findsNothing);
      expect(find.byType(OrderScreen), findsNothing);
      expect(find.byType(MerchantHomeScreen), findsNothing);

      // Le placeholder admin doit être visible.
      expect(
        find.textContaining('Compte administrateur'),
        findsOneWidget,
      );
      expect(find.text('Se déconnecter'), findsOneWidget);
    });

    testWidgets(
        'aucun user (storage vide) → tombe sur la branche par défaut '
        '(placeholder admin avec bouton de déconnexion)', (tester) async {
      // Storage vide → AuthService.getCurrentUser() renvoie null →
      // _role reste null → switch tombe dans le `default` qui rend la
      // page admin neutre.
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      const channel =
          MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
      messenger.setMockMethodCallHandler(channel, (call) async => null);

      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: HomeScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Se déconnecter'), findsOneWidget);
    });
  });
}
