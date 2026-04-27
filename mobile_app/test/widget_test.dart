import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/main.dart';

void main() {
  testWidgets('ZonZonApp builds without throwing', (WidgetTester tester) async {
    await tester.pumpWidget(const ZonZonApp());
    expect(find.byType(ZonZonApp), findsOneWidget);
  });
}
