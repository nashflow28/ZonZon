// Integration test — Flow de login.
//
// ⚠️ Ce test ne mocke PAS le réseau (cf. README.md du dossier).
// Il vérifie uniquement les invariants UI :
//   1. Les composants clés (PhoneField, champ mot de passe, bouton "Se connecter",
//      lien "Créer un compte") sont bien présents au build initial.
//   2. Si l'utilisateur tape "Se connecter" avec des champs vides, un snackbar
//      d'erreur s'affiche et on reste sur LoginScreen (pas de navigation).
//   3. Avec des champs remplis, le tap déclenche un état de chargement (le
//      bouton est désactivé) — la requête HTTP réelle peut échouer si aucun
//      backend n'est joignable, ce qui fait apparaître un snackbar d'erreur.
//      Pour des tests "happy path" (login réussi), un mock réseau ou un
//      backend de test serait nécessaire (voir README.md du dossier).
//   4. Le tap sur "Créer un compte" navigue vers RegisterScreen.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:mobile_app/screens/login_screen.dart';
import 'package:mobile_app/screens/register_screen.dart';
import 'package:mobile_app/widgets/phone_field.dart';

/// Mocks `flutter_secure_storage` pour éviter les `MissingPluginException`
/// quand `AuthService` lit/écrit le token sur le backend test runner.
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

void _clearSecureStorageMock() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const channel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  messenger.setMockMethodCallHandler(channel, null);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(_installSecureStorageMock);
  tearDown(_clearSecureStorageMock);

  group('LoginScreen — flow de connexion', () {
    testWidgets('rend les composants UI clés (téléphone, mot de passe, bouton, lien création)',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
      await tester.pump();

      // Titre + sous-titre.
      expect(find.text('ZonZon'), findsOneWidget);
      expect(find.text('Connectez-vous pour continuer'), findsOneWidget);

      // PhoneField (notre widget custom).
      expect(find.byType(PhoneField), findsOneWidget);

      // Champ mot de passe : repérable par son hint.
      expect(find.text('Mot de passe'), findsOneWidget);

      // Bouton de connexion.
      expect(find.text('Se connecter'), findsOneWidget);

      // Lien vers la page de création de compte.
      expect(find.text('Créer un compte'), findsOneWidget);
    });

    testWidgets(
        'tap sur "Se connecter" avec champs vides → snackbar d\'erreur, '
        'pas de navigation', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
      await tester.pump();

      // Avant le tap : pas de snackbar d'erreur.
      expect(find.text('Veuillez remplir tous les champs.'), findsNothing);

      // Tap sur le bouton sans rien remplir.
      await tester.tap(find.text('Se connecter'));
      // Pump une frame pour que le snackbar apparaisse.
      await tester.pump();
      // Pump l'animation d'apparition du SnackBar.
      await tester.pump(const Duration(milliseconds: 750));

      // Le snackbar (Material) ou le bandeau (Cupertino) affiche le message
      // d'erreur. Sur l'environnement de test on est en TargetPlatform.android
      // par défaut → SnackBar Material.
      expect(find.text('Veuillez remplir tous les champs.'), findsOneWidget);

      // On est toujours sur LoginScreen (pas de navigation déclenchée).
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets(
        'tap sur "Créer un compte" → navigation vers RegisterScreen',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
      await tester.pump();

      // S'assurer que le lien est visible (peut nécessiter scroll si surface
      // trop petite — mais ici on a forcé 900px de hauteur).
      await tester.ensureVisible(find.text('Créer un compte'));
      await tester.tap(find.text('Créer un compte'));

      // RegisterScreen monte plusieurs widgets et peut potentiellement
      // déclencher des plugins (image_picker, etc.) au build. On pump
      // sans settle pour éviter de bloquer si un timer périodique tourne.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // RegisterScreen est désormais dans l'arbre. LoginScreen est
      // techniquement encore présent dans le Navigator (push, pas
      // pushAndRemoveUntil), donc on vérifie juste que RegisterScreen
      // existe au-dessus.
      expect(find.byType(RegisterScreen), findsOneWidget);
    });

    testWidgets(
        'avec des champs remplis, tap sur "Se connecter" déclenche le state '
        '`_isLoading` (loader visible ou bouton désactivé)', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
      await tester.pump();

      // Trouver le TextField du téléphone (PhoneField expose un TextField
      // interne pour le numéro local). On cherche le premier TextField
      // (téléphone) et le second (mot de passe) dans l'ordre du widget tree.
      final textFields = find.byType(TextField);
      expect(textFields, findsNWidgets(2));

      await tester.enterText(textFields.first, '90123456');
      await tester.enterText(textFields.last, 'mypassword');
      await tester.pump();

      // Tap sur "Se connecter" — la requête HTTP va être lancée.
      // En environnement de test sans backend, elle va échouer (timeout
      // ou network error). On ne pumpAndSettle PAS (timer/socket ouvert).
      await tester.tap(find.text('Se connecter'));
      await tester.pump(); // setState(_isLoading = true)

      // À cette frame, le bouton doit afficher le loader natif au lieu du
      // texte "Se connecter" (cf. login_screen.dart:_isLoading
      // ? adaptiveLoader(...) : Text('Se connecter')).
      // On accepte les deux formes (Material ou Cupertino) en vérifiant
      // simplement que le texte "Se connecter" disparaît.
      // NB : cette assertion peut être flaky si le post HTTP rend
      // immédiatement (peu probable en environnement test sans backend)
      // — dans ce cas le snackbar d'erreur apparaîtrait et le bouton
      // redeviendrait actif.
      // On laisse le test tolérant : on accepte soit le loader soit le
      // snackbar d'erreur.
      final loaderVisible = find
              .byType(CircularProgressIndicator)
              .evaluate()
              .isNotEmpty ||
          find.byType(ProgressIndicator).evaluate().isNotEmpty;
      // On NE pumpAndSettle PAS pour éviter de bloquer sur un timer réseau.

      expect(
        loaderVisible,
        isTrue,
        reason:
            'Après le tap, le bouton "Se connecter" doit afficher un loader '
            '(état _isLoading=true).',
      );
    });
  });
}
