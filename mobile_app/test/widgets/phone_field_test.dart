import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/widgets/phone_field.dart';

void main() {
  testWidgets('PhoneField émet le numéro complet et propage onSubmitted', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);

    String? fullPhone;
    String? submittedValue;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PhoneField(
            controller: controller,
            textInputAction: TextInputAction.done,
            onFullNumberChanged: (value) => fullPhone = value,
            onSubmitted: (value) => submittedValue = value,
          ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), '90123456');
    expect(fullPhone, '+22890123456');

    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(submittedValue, '90123456');
  });

  testWidgets('PhoneDisplay formate un numéro local avec l’indicatif du Togo', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: PhoneDisplay(phone: '+22890123456')),
      ),
    );

    expect(find.text('+228 90 12 34 56'), findsOneWidget);
  });
}
