import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/main.dart';

// ---------------------------------------------------------------------------
// The ZonZonApp now uses MaterialApp.router + go_router, which reads
// flutter_secure_storage during the initial redirect.  We mock the native
// plugin channel so the test can mount the widget tree without a real device.
// ---------------------------------------------------------------------------
void _installPluginMocks() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  // flutter_secure_storage: every read returns null (no token stored).
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

  testWidgets('ZonZonApp builds without throwing', (WidgetTester tester) async {
    await tester.pumpWidget(const ZonZonApp());
    expect(find.byType(ZonZonApp), findsOneWidget);
  });
}
