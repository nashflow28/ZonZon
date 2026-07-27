import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/services/auth_service.dart';
import 'package:mobile_app/widgets/delete_account_dialog.dart';

/// Monte un écran minimal dont le bouton ouvre le dialogue de suppression et
/// mémorise sa valeur de retour.
Future<void> _pumpHost(
  WidgetTester tester, {
  required DeleteAccountSubmit onSubmit,
  required void Function(bool?) onClosed,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              final result = await showDeleteAccountDialog(
                context,
                onSubmit: onSubmit,
              );
              onClosed(result);
            },
            child: const Text('Ouvrir'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Ouvrir'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'Étape 1 : explique ce qui est supprimé et ce qui est conservé, sans champ mot de passe',
    (tester) async {
      await _pumpHost(
        tester,
        onSubmit: (_) async => fail('Aucun appel réseau ne doit partir'),
        onClosed: (_) {},
      );

      expect(find.text('Supprimer mon compte'), findsOneWidget);
      expect(find.text('Ce qui est supprimé'), findsOneWidget);
      expect(find.text('Ce qui est conservé'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Continuer'), findsOneWidget);
    },
  );

  testWidgets('Étape 2 : « Continuer » demande le mot de passe actuel', (
    tester,
  ) async {
    await _pumpHost(
      tester,
      onSubmit: (_) async => fail('Aucun appel réseau ne doit partir'),
      onClosed: (_) {},
    );

    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();

    expect(find.text('Confirmer la suppression'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Supprimer définitivement'), findsOneWidget);
  });

  testWidgets('Mot de passe vide : erreur locale, aucun appel réseau', (
    tester,
  ) async {
    var calls = 0;
    await _pumpHost(
      tester,
      onSubmit: (_) async => calls++,
      onClosed: (_) {},
    );

    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Supprimer définitivement'));
    await tester.pump();

    expect(calls, 0);
    expect(
      find.text('Saisissez votre mot de passe pour confirmer.'),
      findsOneWidget,
    );
  });

  testWidgets('Succès : le mot de passe est transmis et le dialogue rend true', (
    tester,
  ) async {
    String? received;
    bool? result;
    await _pumpHost(
      tester,
      onSubmit: (password) async => received = password,
      onClosed: (value) => result = value,
    );

    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'motdepasse123');
    await tester.tap(find.text('Supprimer définitivement'));
    await tester.pumpAndSettle();

    expect(received, 'motdepasse123');
    expect(result, isTrue);
    expect(find.text('Confirmer la suppression'), findsNothing);
  });

  testWidgets('409 : le message du backend (course en cours) est affiché', (
    tester,
  ) async {
    const backendMessage =
        'Terminez ou annulez votre course en cours avant de supprimer votre compte.';
    await _pumpHost(
      tester,
      onSubmit: (_) async =>
          throw const DeleteAccountException(409, backendMessage),
      onClosed: (_) {},
    );

    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'motdepasse123');
    await tester.tap(find.text('Supprimer définitivement'));
    await tester.pumpAndSettle();

    expect(find.text(backendMessage), findsOneWidget);
    // Le dialogue reste ouvert : l'utilisateur peut corriger puis réessayer.
    expect(find.text('Confirmer la suppression'), findsOneWidget);
  });

  testWidgets('Réseau injoignable : message générique et dialogue conservé', (
    tester,
  ) async {
    await _pumpHost(
      tester,
      onSubmit: (_) async =>
          throw TimeoutException('délai dépassé', const Duration(seconds: 20)),
      onClosed: (_) {},
    );

    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'motdepasse123');
    await tester.tap(find.text('Supprimer définitivement'));
    await tester.pumpAndSettle();

    expect(find.textContaining('connexion est trop lente'), findsOneWidget);
    expect(find.text('Confirmer la suppression'), findsOneWidget);
  });

  testWidgets('Chargement : le bouton de suppression est désactivé', (
    tester,
  ) async {
    final completer = Completer<void>();
    var calls = 0;
    await _pumpHost(
      tester,
      onSubmit: (_) {
        calls++;
        return completer.future;
      },
      onClosed: (_) {},
    );

    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'motdepasse123');
    await tester.tap(find.text('Supprimer définitivement'));
    await tester.pump();

    // Le libellé a laissé place au loader : plus rien à retaper.
    expect(find.text('Supprimer définitivement'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    completer.complete();
    await tester.pumpAndSettle();
    expect(calls, 1);
  });
}
