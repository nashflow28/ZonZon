# Tests d'intégration Flutter — ZonZon

Ce dossier contient les tests d'intégration de l'app mobile ZonZon. Ils
complètent les tests widgets (`test/widgets/`) en validant des flux UI plus
complets sur l'arbre de widgets réel.

> Pour les tests widgets unitaires, voir `mobile_app/test/widgets/`.

## Lancer les tests

Les tests d'intégration ont besoin d'un **device physique ou d'un émulateur
en cours d'exécution** (ou d'un browser pour le ciblage `web`). Ils ne
peuvent **pas** tourner avec un simple `flutter test` — il faut soit
`flutter test integration_test/` (sur un device connecté), soit
`flutter drive` avec un host driver.

### Tous les tests d'un coup

```powershell
cd C:\laragon\www\ZonZon\mobile_app
flutter test integration_test/
```

Cela exécute tous les fichiers `*_test.dart` du dossier sur le device
courant.

### Un seul fichier

```powershell
flutter test integration_test/login_flow_test.dart
```

### Sur un émulateur Android spécifique

```powershell
flutter devices                       # liste les devices
flutter test -d emulator-5554 integration_test/
```

### Avec une URL d'API personnalisée (pour cibler un backend de test)

```powershell
flutter test --dart-define=API_URL=http://10.0.2.2:3050 integration_test/
```

## Tests existants

| Fichier | Couverture | Limitations |
|---|---|---|
| `login_flow_test.dart` | Présence des champs (PhoneField, mot de passe), bouton "Se connecter", lien "Créer un compte". Validation côté UI : champs vides → snackbar d'erreur. État de chargement après tap (loader visible). Navigation vers `RegisterScreen`. | **Pas de mock réseau** : le happy path (login réussi) n'est pas testé car il faudrait un backend joignable ou un mock complet de `package:http`. |
| `create_order_flow_test.dart` | Smoke test : `OrderScreen` se construit sans crasher (GPS mocké comme indisponible). | **Très minimal** : aucun flow réel de création de commande n'est testé. Le plugin `geolocator` est mocké pour retourner "service indisponible" ; les requêtes HTTP de l'écran (estimation, commande active) ne sont pas mockées et échoueront silencieusement. |
| `home_screen_smoke_test.dart` | Aiguillage par rôle : CLIENT → `OrderScreen`, LIVREUR → `DriverScreen`, COMMERCANT → `MerchantHomeScreen`, ADMIN → placeholder neutre. Storage vide → placeholder neutre. | Pas de pumpAndSettle (les écrans cibles ouvrent des sockets / timers). Test fait juste un `pump` court et vérifie le `runtimeType` du child. |

## Patterns utilisés

### Mock de `flutter_secure_storage`

Le pattern est le même que dans `test/widgets/order_history_screen_test.dart` :

```dart
final messenger =
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
const channel =
    MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
messenger.setMockMethodCallHandler(channel, (call) async {
  switch (call.method) {
    case 'read': return null;
    case 'readAll': return <String, String>{};
    default: return null;
  }
});
```

Pour injecter un user fictif (cf. `home_screen_smoke_test.dart`), retourner
un JSON encodé sur la clé `current_user`.

### Mock de `geolocator`

```dart
for (final name in const [
  'flutter.baseflow.com/geolocator',
  'flutter.baseflow.com/geolocator_android',
  'flutter.baseflow.com/geolocator_apple',
]) {
  messenger.setMockMethodCallHandler(MethodChannel(name), (call) async {
    if (call.method == 'isLocationServiceEnabled') return false;
    return null;
  });
}
```

Ce mock force le screen à retomber sur le fallback "GPS indisponible".

### Pas de `pumpAndSettle`

Les écrans réels (OrderScreen, DriverScreen, ChatScreen) ouvrent des sockets
WebSocket ou des timers périodiques. `tester.pumpAndSettle()` boucle alors
indéfiniment et fait timeout. **Préférer** `tester.pump(Duration(milliseconds: N))`
pour avancer le temps sans bloquer.

## Limitations connues

1. **Pas de mock réseau** : `AuthService` et `ApiClient` utilisent
   `package:http` en mode singleton. Pour mocker proprement, il faudrait
   refactor pour injecter un `http.Client` (cf. `package:http/testing.dart`
   et `MockClient`). Aujourd'hui les tests ne peuvent valider que des
   chemins d'erreur (ou rien si pas de réseau).
2. **Pas de mock GPS détaillé** : on simule seulement "service indisponible".
   Pour tester un vrai flow où l'utilisateur a une position fictive, il
   faudrait un mock complet retournant un `Position` valide via
   `getCurrentPosition`.
3. **Pas de mock WebSocket** : `OrderSocketController` ouvre un vrai socket
   sur l'URL de prod. Aucun test ne valide les événements temps réel
   (orderAccepted, driver:location, etc.).
4. **Pas de mock Firebase** : `FirebaseMessaging.instance` peut crasher si
   appelé hors test driver. Les écrans qui en dépendent (ex: déclenchement
   de `PushService` au login) sont à manipuler avec prudence.
5. **Tests E2E non couverts** : "Le client crée une commande, le livreur
   l'accepte, etc." n'est PAS testé ici. Pour ça, il faut un backend de
   test joignable et probablement Firebase Test Lab pour exécuter sur un
   parc Android réel.

## Ajouter un nouveau test d'intégration

1. Créer `integration_test/<feature>_flow_test.dart`.
2. Initialiser le binding tout en haut de `main()` :
   ```dart
   IntegrationTestWidgetsFlutterBinding.ensureInitialized();
   ```
3. Mocker les plugins natifs nécessaires dans un `setUp()` (au minimum
   `flutter_secure_storage` et — si l'écran touché lit le GPS —
   `geolocator`).
4. Pump le widget cible (encapsulé dans un `MaterialApp`) puis `pump()`
   sans `pumpAndSettle` pour éviter les timeouts sur sockets/timers.
5. Asserter sur des `Finder`s par texte (`find.text(...)`) ou par type
   (`find.byType(...)`) — préférez les `ValueKey` dès qu'un test devient
   fragile.

## Roadmap suggérée

Pour aller plus loin (tâches potentielles à ouvrir séparément) :

- Refactor `AuthService` / `ApiClient` pour injecter un `http.Client` →
  permettre les tests "happy path" complets (login → home → création de
  commande).
- Ajouter un mock complet du plugin `geolocator` (avec `Position` fictif).
- Setup d'un backend de test (TiDB local ou container Docker) +
  pipeline CI dédiée pour `flutter drive`.
- Tests "page object" pour réduire la duplication entre tests
  (`LoginScreenObject.fillCredentials(...).submit()`).
