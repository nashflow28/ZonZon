# Plan de tests ZonZon V1 — Backend

> Document de référence sur la couverture de tests du backend NestJS
> (`backend/`). Complète `PROGRESS.md` / `TODO.md` sans les remplacer.
> Dernière mise à jour : 2026-07-07.

---

## a) Tests unitaires existants — `backend/src/**/*.spec.ts`

**15 suites, 232 tests unitaires**, tous passants (`npx jest` depuis `backend/`).
Le nombre de 221 mentionné historiquement a légèrement augmenté suite à des
ajouts en parallèle (règles P0 : suspension de compte / course active).

| Suite | Fichier | ~ Tests |
|---|---|---|
| OrdersService | `src/orders/orders.service.spec.ts` | 82 |
| OrdersGateway | `src/orders/orders.gateway.spec.ts` | 17 |
| UsersService | `src/users/users.service.spec.ts` | 19 |
| ShopsService | `src/shops/shops.service.spec.ts` | 21 |
| ZonesService | `src/zones/zones.service.spec.ts` | 12 |
| AuthService | `src/auth/auth.service.spec.ts` | 11 |
| CORS (common) | `src/common/cors.spec.ts` | 11 |
| RatingsService | `src/ratings/ratings.service.spec.ts` | 10 |
| MerchantDriversService | `src/merchant-drivers/merchant-drivers.service.spec.ts` | 10 |
| DeviceTokensService | `src/users/device-tokens.service.spec.ts` | 9 |
| PricingService | `src/pricing/pricing.service.spec.ts` | 8 |
| AuditLogService | `src/audit-log/audit-log.service.spec.ts` | 6 |
| VehiclesService | `src/vehicles/vehicles.service.spec.ts` | 5 |
| ReportsService | `src/reports/reports.service.spec.ts` | 3 |
| AppController | `src/app.controller.spec.ts` | 1 |

Ces tests sont des tests **unitaires purs** (mocks manuels des repos
TypeORM), ils ne passent pas par la pile HTTP (pas de guards, pas de
controllers, pas de validation de DTO). C'est précisément le trou que les
tests e2e ci-dessous comblent.

### Tests e2e déjà présents avant cette session

- `backend/test/app.e2e-spec.ts` — 1 test, construit `AppModule` **complet**
  (TypeORM réel + connexion MySQL/TiDB). **Échoue systématiquement en local/CI
  sans base de données accessible** (timeout de connexion). Ce n'est pas un
  test hermétique et il est hors-scope de cette session (préexistant, non lié
  aux changements ci-dessous).
- `backend/test/orders.e2e-spec.ts` — pattern hermétique (in-memory repos +
  axios mocké), mais **cassé au démarrage de cette session** : `OrdersService`
  a évolué (Lot 2/3 : `NotificationsService`, `PositionsService`,
  `PricingService`, `MerchantDriversService` injectés) sans que le module de
  test soit mis à jour → erreur de résolution NestJS DI
  (`Nest can't resolve dependencies of OrdersService`). Réparé dans cette
  session (voir (b)).

---

## b) Tests ajoutés dans cette session

Tout le travail a été fait dans `backend/test/` (aucune modification de
`backend/src/`). Fichiers créés/modifiés :

### `backend/test/test-helpers.ts` (nouveau — helpers partagés)

Factorise le pattern hermétique utilisé par tous les fichiers e2e :

- `makeInMemoryRepo<T>()` : mini-repo TypeORM-like. Étendu par rapport à la
  version d'origine pour supporter ce que le code `src/` actuel utilise
  réellement :
  - `findAndCount`, `delete`, `count`, `softDelete`, `restore` (absents avant) ;
  - gestion des **FindOperator TypeORM** (`IsNull()`, `Not(IsNull())`,
    `In([...])`, `MoreThanOrEqual`, `LessThanOrEqual`, `Between`) dans le
    matcher `where` — nécessaire car `OrdersService.findAvailable` /
    `acceptOrder` les utilisent désormais ;
  - `createQueryBuilder()` minimal : simule l'UPDATE atomique conditionnel de
    `acceptOrder` (`status=PENDING AND livreurId IS NULL AND
    (preferredLivreurId IS NULL OR = ce livreur)`) ;
  - `save()` **mute l'entité passée en argument** (comme le vrai TypeORM) en
    plus de la retourner — un bug de la version d'origine (elle retournait un
    nouvel objet sans muter l'original) provoquait un `admin.id` `undefined`
    après `save()` dans les tests qui créent un admin directement en base.
- `buildTestApp()` : construit une app Nest avec `AuthController`,
  `OrdersController`, `UsersController`, `MerchantDriversController` (+
  services réels, guards réels `JwtAuthGuard`/`RolesGuard`), et des repos
  in-memory pour `User`, `Vehicle`, `DeliveryOrder`, `DeviceToken`,
  `MerchantDriver`, `DriverPosition`, `PricingConfig`. `NotificationsService`,
  `PositionsService`, `PricingService` sont stubbés (`useValue`, pas des
  cibles de test ici) — `PricingService.getPricePerKm` renvoie 150 FCFA/km
  pour un calcul de prix déterministe. `axios` est mocké au format
  OpenRouteService réellement consommé par `OrdersService`
  (`features[0].properties.summary.distance`), avec `ORS_API_KEY` forcé pour
  éviter le fallback Haversine non déterministe.
- `registerAndLogin()`, `approveLivreur()`, `setAvailable()` : raccourcis.

### `backend/test/orders.e2e-spec.ts` (réparé + étendu)

Le scénario original (register → create → accept → progress → complete →
double-acceptation 409) est conservé mais adapté au workflow de validation
livreur (un livreur fraîchement inscrit est `PENDING` + indisponible — il
faut un ADMIN qui approuve puis le livreur passe disponible avant de pouvoir
voir/accepter). 11 tests, tous passants.

### `backend/test/driver-validation.e2e-spec.ts` (nouveau — 6 tests)

Couvre le CDC §21.4 « validation livreur » et « disponibilité » :
- livreur `PENDING` → 403 sur `GET /orders/available` et `POST /orders/:id/accept` ;
- livreur `APPROVED` mais indisponible → `GET /orders/available` renvoie `200 []` (pas d'erreur) et `POST accept` → 403 ;
- livreur `APPROVED` + disponible (après `PATCH /users/me/availability`) → voit la course et peut l'accepter (`201`).

### `backend/test/permissions.e2e-spec.ts` (nouveau — 12 tests)

Couvre le CDC §21.4 « permissions par rôle » (`RolesGuard` + `@Roles`) :
- `GET /users` (`@Roles(ADMIN)`) : CLIENT/LIVREUR/COMMERCANT → 403, ADMIN → 200 ;
- `POST /orders/merchant` (`@Roles(COMMERCANT)`) : LIVREUR/CLIENT → 403, COMMERCANT → 201 ;
- `PATCH /users/me/availability` (`@Roles(LIVREUR)`) : CLIENT/COMMERCANT → 403 ;
- `GET /orders` (`@Roles(ADMIN, LIVREUR)`) : CLIENT/COMMERCANT → 403, ADMIN → 200.

### `backend/test/ownership.e2e-spec.ts` (nouveau — 7 tests)

Couvre le CDC §21.4 « propriété des ressources » et « attribution manuelle » :
- `PATCH /orders/:id/status` par un livreur NON assigné → 403 (livreur assigné → 200) ;
- `GET /orders/mine` : un client ne voit que SA commande, un autre client la sienne, un commerçant seulement ses livraisons créées (Type 1) ;
- attribution manuelle (`preferredLivreurId`) : un autre livreur validé+dispo → 403 (« réservée ») ; le livreur préféré peut accepter → 201.

### Récapitulatif des scénarios §21.4 demandés (d)

| # | Scénario | Fichier | Statut |
|---|---|---|---|
| 1 | Validation livreur (PENDING → 403, APPROVED+dispo → OK) | `driver-validation.e2e-spec.ts` | ✅ ajouté |
| 2 | Disponibilité (APPROVED+indispo → `[]`/403, puis dispo → OK) | `driver-validation.e2e-spec.ts` | ✅ ajouté |
| 3 | Double-acceptation impossible (1er 200/201, 2e 409) | `orders.e2e-spec.ts` (existant, réparé) | ✅ déjà présent, vérifié |
| 4 | Permissions par rôle (CLIENT/LIVREUR/COMMERCANT/ADMIN) | `permissions.e2e-spec.ts` | ✅ ajouté |
| 5 | Propriété des ressources (`status`, `/orders/mine`) | `ownership.e2e-spec.ts` | ✅ ajouté |
| 6 | Attribution manuelle / réservation (`preferredLivreurId`) | `ownership.e2e-spec.ts` | ✅ ajouté |

**Total e2e après cette session : 36 tests passants** (11 + 6 + 12 + 7) sur
4 fichiers hermétiques, + `app.e2e-spec.ts` (1 test, échoue sans DB — non
hermétique, hors-scope).

---

## c) Tests encore manquants à écrire plus tard

Ne PAS écrire maintenant — ces règles/zones sont soit en cours d'écriture en
parallèle, soit hors du périmètre backend NestJS de cette session :

1. **Suspension de compte** (`UserStatus` — ajouté en parallèle pendant cette
   session dans `src/entities/user.entity.ts` + `src/users/dto/suspend-user.dto.ts`
   + migration `1779000000000-AddUserStatus.ts`). Écrire des tests e2e une
   fois cette fonctionnalité stabilisée (ex. `GET /orders/available` /
   `accept` doivent refuser un compte `SUSPENDED`).
2. **Règle « une seule course active »** (P0 CDC) — code déjà repéré dans
   `OrdersService.acceptOrder` (bloc « 0bis » avec `In([ACCEPTED,
   EN_ROUTE_PICKUP, AT_PICKUP, IN_PROGRESS, NEAR_CLIENT])`) pendant cette
   session, en cours de finalisation par un autre agent. Tests à ajouter :
   un livreur qui a déjà une course active reçoit 403/409 en tentant d'en
   accepter une seconde.
3. **GPS strict / géofencing** — vérifier les tolérances de distance
   pickup/delivery pour les transitions `AT_PICKUP`/`NEAR_CLIENT` côté mobile
   (actuellement le backend ne semble pas vérifier la position GPS à la
   transition de statut, seulement la machine à états logique — à confirmer
   avec le code final avant d'écrire des tests).
4. **Messagerie multi-participants** — `src/messages/` existe mais n'a pas de
   controller e2e testé ici (chat WebSocket `chat:join/leave/typing/message`
   dans `OrdersGateway` : logique déjà couverte partiellement par
   `orders.gateway.spec.ts` en unitaire ; un test e2e avec un vrai client
   Socket.IO reste à écrire si besoin de non-régression HTTP+WS combinée).
5. **Notifications persistées** — `NotificationsService`/FCM est stubbé dans
   tous les tests e2e de cette session (no-op sans credentials en prod aussi).
   Pas de test de la persistance des notifications lues/non-lues côté mobile
   si une telle table existe ou est prévue.
6. **Tests Flutter** (`mobile_app/`) — hors périmètre (voir skills
   `flutter-add-widget-test` / `flutter-add-integration-test` dans
   `.agents/skills/`). Aucun test automatisé Flutter n'a été inventorié ici.
7. **Tests Angular** (`admin-dashboard/`) — un seul fichier repéré
   (`admin-dashboard/src/app/orders.service.spec.ts`, ajouté en parallèle
   pendant cette session par un autre agent) ; couverture à étendre
   (composants, guards de rôle admin, intercepteurs HTTP) mais hors périmètre
   backend NestJS de cette session.
8. **Reassignation manuelle** (`PATCH /orders/:id/assign`) — le service
   `assignPreferredLivreur` existe (Lot 3 item 1) mais n'a pas de test e2e
   dédié ici (seule la création avec `preferredLivreurId` est testée). À
   ajouter : réassigner une course PENDING non acceptée à un nouveau livreur
   et vérifier que l'ancien preferredLivreur perd l'exclusivité.
9. **Affiliation commerçant/livreur** (`merchant-drivers.controller.ts`) —
   `MerchantDriversService` est unitairement testé
   (`merchant-drivers.service.spec.ts`) et son controller est chargé dans le
   module e2e (`buildTestApp`) mais aucun scénario e2e HTTP dédié
   (`POST/GET/DELETE /merchants/me/drivers`) n'a été écrit dans cette session
   — à ajouter si le temps le permet.
10. **Statut de paiement** (`PATCH /orders/:id/payment-status`) — testé
    unitairement dans `orders.service.spec.ts` mais pas d'e2e HTTP dédié.

---

## e) Mocks nécessaires (état actuel)

- **FCM / `NotificationsService`** : no-op sans `FIREBASE_CREDENTIALS_JSON`/
  `GOOGLE_APPLICATION_CREDENTIALS` (comportement du code source lui-même,
  déjà safe en environnement de test). Dans les tests e2e de cette session,
  on va plus loin en le remplaçant entièrement par un `useValue` stub
  (`sendToUser: jest.fn()`), pour éviter tout effet de bord et parce que ce
  n'est pas la cible des règles testées.
- **`axios`** : `jest.mock('axios')` global dans `test-helpers.ts`, réponse
  mockée au format OpenRouteService (voir (b)). `ORS_API_KEY` forcé à une
  valeur factice pour garantir un calcul de distance déterministe (sinon
  fallback Haversine, qui dépend des coordonnées passées et casse
  l'assertion sur le prix).
- **Repositories TypeORM** : tous in-memory via `getRepositoryToken()` (voir
  `makeInMemoryRepo` dans `test-helpers.ts`). Pas de DB réelle, pas de
  Docker, pas de SQLite — cohérent avec le pattern déjà en place dans
  `orders.e2e-spec.ts` original.
- **`OrdersGateway`** (Socket.IO) : stubbé entièrement (`useValue`) —
  `broadcastNewOrder`, `broadcastOrderAccepted`, `broadcastStatusUpdate`,
  `isUserConnected` (ce dernier manquait dans la version d'origine du test et
  a dû être ajouté, `OrdersService` l'appelle désormais systématiquement).
- **`PositionsService`** / **`PricingService`** : stubbés (`useValue`), pas
  la cible des tests métier de cette session.

---

## f) Données de test

Tous les fichiers e2e utilisent des numéros de téléphone togolais fictifs
distincts par fichier pour éviter toute collision entre suites (chaque
fichier construit sa PROPRE instance d'app/repos via `buildTestApp()`, donc
aucune collision n'est possible entre fichiers, mais la convention est
gardée par lisibilité) :

- `orders.e2e-spec.ts` : `+228900000xx`
- `driver-validation.e2e-spec.ts` : `+22891000xxx`
- `permissions.e2e-spec.ts` : `+22892000xxx`
- `ownership.e2e-spec.ts` : `+22893000xxx`

Les comptes ADMIN ne peuvent pas être créés via `/auth/register` (refus
explicite et volontaire dans `AuthService.register`, défense en profondeur
anti-escalade de privilèges) : tous les tests créent l'admin directement via
`usersRepo.create()` + `usersRepo.save()`, puis signent un JWT à la main avec
`JwtService` (même secret que l'app testée) pour simuler une session admin
déjà authentifiée.

Prix de référence : distance mockée à 3 km (ORS), `pricePerKm` stubbé à 150
FCFA/km → `priceFcfa` attendu = 450 pour toute commande Lomé Centre → Agoè
avec ces coordonnées.

---

## g) Commandes

Depuis `backend/` :

```powershell
# Tests unitaires (src/**/*.spec.ts) — 15 suites, 232 tests
npx jest

# Tests e2e (test/**/*.e2e-spec.ts) — pattern hermétique, pas de DB requise
npm run test:e2e
# équivalent : npx jest --config ./test/jest-e2e.json

# Un seul fichier e2e
npx jest --config test/jest-e2e.json orders.e2e-spec.ts --verbose

# Un seul test par nom (utile pour déboguer)
npx jest --config test/jest-e2e.json orders.e2e-spec.ts -t "ADMIN approuve"
```

**Note** : `test/app.e2e-spec.ts` (préexistant) échouera systématiquement
sans base de données MySQL/TiDB accessible — c'est attendu et indépendant du
travail de cette session (il construit `AppModule` complet au lieu du
pattern hermétique in-memory).

---

## Résultat de la vérification finale (cette session)

```
npm run test:e2e
Test Suites: 1 failed, 4 passed, 5 total
Tests:       1 failed, 36 passed, 37 total
```

Le seul échec (`app.e2e-spec.ts`) est la tentative de connexion DB réelle
décrite ci-dessus — indépendant des changements de cette session. Les 36
tests e2e du pattern hermétique (dont les 25 nouveaux répartis sur
`driver-validation.e2e-spec.ts`, `permissions.e2e-spec.ts`,
`ownership.e2e-spec.ts`, plus les 11 réparés dans `orders.e2e-spec.ts`)
passent tous.

`npx jest` (unitaires `src/`) : 232/232 passants, 15/15 suites.
