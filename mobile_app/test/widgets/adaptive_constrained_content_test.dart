import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/utils/platform_adapter.dart';

void main() {
  testWidgets('adaptiveConstrainedContent limite la largeur sur grand écran', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(1000, 600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox.expand(
            child: adaptiveConstrainedContent(
              maxWidth: 320,
              child: Container(key: const Key('content')),
            ),
          ),
        ),
      ),
    );

    expect(tester.getSize(find.byKey(const Key('content'))).width, 320);
  });

  testWidgets(
    'adaptiveConstrainedContent laisse les petits écrans prendre toute la largeur',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(240, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox.expand(
              child: adaptiveConstrainedContent(
                maxWidth: 320,
                child: Container(key: const Key('content')),
              ),
            ),
          ),
        ),
      );

      expect(tester.getSize(find.byKey(const Key('content'))).width, 240);
    },
  );
}
