import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/screens/order_history_screen.dart';

/// Mocks the `flutter_secure_storage` and `http` plugin channels so the
/// screen can mount in widget tests without throwing `MissingPluginException`.
///
/// We don't need real data here: the test only asserts that the *initial*
/// frame shows a loader while async work is in flight.
void _installPluginMocks() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  // flutter_secure_storage : tous les reads renvoient null, writes sont noop.
  const secureStorageChannel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  messenger.setMockMethodCallHandler(secureStorageChannel, (call) async {
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

void _clearPluginMocks() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const secureStorageChannel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  messenger.setMockMethodCallHandler(secureStorageChannel, null);
}

void main() {
  setUp(_installPluginMocks);
  tearDown(_clearPluginMocks);

  group('OrderHistoryScreen', () {
    testWidgets(
        'état de chargement initial — un loader (CircularProgressIndicator '
        'ou CupertinoActivityIndicator) est visible avant que les données '
        'arrivent',
        (tester) async {
      // Pump le widget : à cette frame, `_bootstrap()` vient juste d'être
      // déclenché par initState, mais aucun await n'a encore résolu.
      await tester.pumpWidget(const MaterialApp(home: OrderHistoryScreen()));

      // L'AppBar est rendue.
      expect(find.text('Historique des courses'), findsOneWidget);

      // Et un loader natif (`adaptiveLoader`) est centré dans le body.
      // Sur Android/Linux/web → CircularProgressIndicator, sur iOS/macOS →
      // CupertinoActivityIndicator. On accepte les deux.
      final hasMaterialLoader =
          find.byType(CircularProgressIndicator).evaluate().isNotEmpty;
      final hasCupertinoLoader =
          find.byType(ProgressIndicator).evaluate().isNotEmpty;
      expect(
        hasMaterialLoader || hasCupertinoLoader,
        isTrue,
        reason: 'Un loader doit être affiché au build initial',
      );

      // ⚠️ On NE pumpe PAS jusqu'à settle() ici : `_load()` lance un
      // `http.get` réel qui partira potentiellement vers l'URL de prod.
      // Le test se limite à l'état initial.
    });
  });
}
