import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/screens/location_picker_screen.dart';

void main() {
  testWidgets('LocationSearchField garde le texte saisi visible sur la carte', (
    tester,
  ) async {
    final controller = TextEditingController();
    final focusNode = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focusNode.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LocationSearchField(
            controller: controller,
            focusNode: focusNode,
            hint: 'Rechercher un lieu',
            onChanged: (_) {},
          ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Lome');
    await tester.pump();

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.style?.color, Colors.white);
    expect(find.text('Lome'), findsOneWidget);
  });
}
