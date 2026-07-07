# ZonZon — Tableau des tâches

> Ce fichier est le **Trello du projet**. Toute Claude Code (ou humain) qui travaille sur ZonZon doit :
> 1. Lire `PROGRESS.md` au démarrage (état actuel + commandes utiles)
> 2. Lire `TODO.md` (ce fichier) pour savoir quoi faire
> 3. Cocher les tâches dès qu'elles sont terminées
> 4. Ajouter de nouvelles tâches au bon endroit
>
> Convention : `- [ ]` à faire · `- [x]` fait · `- [~]` en cours · `- [!]` bloqué

---

## 🎯 BACKLOG V1 — Cahier des charges (2026-07-05)

> Architecture V1 confirmée : **Flutter** (client/livreur/commerçant) + **Angular** (admin). Pas de réécriture PWA maintenant.
> Analyse d'écart complète : voir `PROGRESS.md` (section « Analyse d'écart CDC V1 »).
> **Contrainte absolue : ne rien casser** — tracking GPS, Socket.IO, FCM, messagerie client↔livreur, admin dashboard.
> Ordre d'exécution : **backend d'abord**, puis fronts (Flutter, Angular).

### 🆕 CDC V1 détaillé — audit `AUDIT_CDC_ZONZON_V1.md` (2026-07-07, conformité ~68%)
- [x] **P0 — Suspension de compte** — `User.status` (ACTIVE/SUSPENDED), `PATCH /users/:id/suspend|reactivate` (ADMIN + audit), blocage login + create/accept. Migration `1779000000000`. *(backend, jest 232/232)*
- [x] **P0 — Une seule course active par livreur** — `acceptOrder` refuse (`ConflictException`) si course `ACCEPTED…NEAR_CLIENT`. *(backend)*
- [x] **Tests e2e règles métier** — infra hermétique réparée + 25 scénarios §21.4 (validation, permissions, propriété, double-accept). `test:e2e` 37/37. `TEST_PLAN_ZONZON_V1.md`. *(backend/test)*
- [x] **Admin — gestion livraison** — édition `paymentStatus` + réassignation livreur dans le détail. *(admin)*
- [x] **P0 — Admin UI suspension/réactivation** + mobile message « compte suspendu ». *(2026-07-07)*
- [x] **P1 — Historique des statuts** (`DeliveryStatusHistory` + `GET /orders/:id/history`). *(2026-07-07)*
- [x] **P1 — Traçabilité du prix** (`estimatedPrice` + `priceWasManuallyAdjusted` + table `price_changes` + `PATCH /orders/:id/price`). *(2026-07-07)*
- [x] **P1 — Historique de paiement** (`payment_status_history` + `GET /orders/:id/payment-history`) + enum étendu (`CASH_ON_DELIVERY`, `REFUNDED`). *(2026-07-07)*
- [x] **P2 — Signalements** (entité `Signalement` + `POST/GET/PATCH /signalements` + écran admin `/signalements` + bouton mobile « Signaler un problème »). *(2026-07-07)*
- [x] **P2 — Commerçant dans le chat** (`isUserPartyToOrder` autorise le merchant créateur). Modèle chat par room conservé (pas de refonte `Conversation`/`Participants` — light V1). *(2026-07-07)*
- [x] **P2 — GPS strict** (position ignorée hors course active) + diffusion au commerçant (position + statuts). *(2026-07-07)*
- [x] **P2 — Zones enrichies** (`description`/`basePrice`/`pricePerKmOverride`, `pickupZoneId`/`destinationZoneId`, +6 quartiers) + admin. *(2026-07-07)*
- [x] **P2 — Livreur privé/public** (`User.isPublic`, exclusion du broadcast si privé, `PATCH /users/me/visibility` + toggle mobile). *(2026-07-07)*
- [x] **P2 — Notifications persistées** (table `notifications`, persistance dans `sendToUser`, `GET /notifications` + read/read-all + écran mobile). *(2026-07-07)*
- [ ] **Reste (après V1)** : conversation multi-participants complète (entités dédiées) ; statut d'affiliation `MerchantDriver` (PENDING/ACTIVE/REJECTED/REMOVED) + flux invite/accept ; notifs in-app validation/refus livreur ; tarification géographique effective par zone.

### 🔴 Priorité 1 — Validation & disponibilité des livreurs
- [x] **Backend — Validation admin obligatoire des livreurs** *(2026-07-05)*
  - `User.driverApprovalStatus` (PENDING/APPROVED/REJECTED, nullable) + `driverRejectionReason` ; `PENDING` à l'inscription LIVREUR. Migration `1778100000000` (grandfather des livreurs existants → APPROVED+disponibles).
  - `PATCH /users/:id/driver-approval` (ADMIN, `{status, reason?}`) + audit log (`DRIVER_APPROVE`/`DRIVER_REJECT`)
  - `GET /users/drivers/pending` (ADMIN) — file d'attente
- [x] **Backend — Disponibilité livreur (disponible / indisponible)** *(2026-07-05)*
  - `User.isAvailable` (boolean, default `false`)
  - `PATCH /users/me/availability` (LIVREUR, `{available}`) — autorisé uniquement si `APPROVED`
- [x] **Backend — Interdire à un livreur non validé ou indisponible de voir/accepter une course** *(2026-07-05)*
  - `acceptOrder` : `ForbiddenException` si non `APPROVED` ou non `isAvailable` (recharge DB, contrôle dur)
  - `GET /orders/available` : `Forbidden` si non validé ; `[]` si indisponible
  - Broadcast WS `newOrderAvailable` (param `eligibleDriverIds` synchrone) + `findEligibleLivreurIds` + `notifyOfflineLivreurs`/positions filtrés `APPROVED`+`isAvailable`
  - Tests Jest : **138/138** (120→138, +18). Build OK. Aucune régression tracking/Socket.IO/FCM/messagerie.
- [x] **Mobile** — toggle disponibilité (onglet Radar + Profil) + gestion des 3 états (non validé/refusé → bandeau, indisponible → état vide, disponible → radar normal). Modèle `User` étendu, `DriverService.setAvailability`. `flutter analyze` 10 (préexistantes), `flutter test` 10/10. *(2026-07-05)*
- [x] **Admin** — écran `/driver-validation` (file `GET /users/drivers/pending`, approuver/refuser via `PATCH /users/:id/driver-approval`), lien sidebar « Validation livreurs ». Build prod OK. *(2026-07-05)*

### 🟠 Priorité 2 — Livraison commerçant → client (Type 1)
- [x] **Backend** — `POST /orders/merchant` (`@Roles(COMMERCANT)`) *(2026-07-05)*
  - `DeliveryOrder` : + `merchant` (ManyToOne nullable), `clientPhone`, `clientName` ; `client` rendu nullable. Migration `1778200000000` (FK `merchantId` SET NULL, `clientId` → nullable).
  - Rattachement client **existant (compte)** via `clientId` **ou par téléphone** (`clientPhone`/`clientName`, avec ou sans compte). `findForUser` cas COMMERCANT (ses livraisons créées). Pricing factorisé (`buildOrderPricing`).
  - Le commerçant ne peut jamais être livreur (garanti par `@Roles(LIVREUR)` sur `accept`). Build OK, jest **147/147**.
- [x] **Mobile (commerçant)** — écran `create_delivery_screen` (client par téléphone/nom, retrait/livraison via LocationPicker, estimation, `POST /orders/merchant`) + écran `merchant_orders_screen` (« Mes livraisons » via `GET /orders/mine`). Accès depuis l'accueil commerçant (carte d'actions rapides), routes go_router. `flutter analyze` 10, `flutter test` 10/10. *(2026-07-05)*
- [ ] **Admin (optionnel)** — création/gestion de livraison Type 1 depuis le dashboard (non prioritaire)

### 🟡 Priorité 3 — Attribution, affiliation, tarifs, statuts, paiement, zones
> Backend complet (3 lots, jest 214/214) sur `feat/v1-priority-3`. Fronts en cours.
- [x] **Backend Tarif configurable 200 FCFA/km** — `PricingConfig` (singleton, défaut 200, `minPriceFcfa`), `GET/PATCH /admin/pricing`, prix manuel commerçant. *(Lot 1)*
- [x] **Backend Zones / quartiers de Lomé** — entité `Zone`, `GET /zones` + CRUD admin, seed 16 quartiers (version simple, sans tarif par zone). *(Lot 1)*
- [x] **Backend Statuts de livraison étendus** — `EN_ROUTE_PICKUP/AT_PICKUP/NEAR_CLIENT/FAILED` (rétro-compatible) + notifications FCM. *(Lot 2)*
- [x] **Backend `paymentStatus`** — enum sur `DeliveryOrder` + `PATCH /orders/:id/payment-status`. *(Lot 2)*
- [x] **Backend Attribution manuelle** — `preferredLivreur` (réservation + broadcast ciblé), `GET /orders/available-drivers`, `PATCH /orders/:id/assign`. *(Lot 3)*
- [x] **Backend Relation livreur affilié** — entité `MerchantDriver` (M:N) + `GET/POST/DELETE /merchants/me/drivers`. *(Lot 3)*
- [x] **Fronts P3** *(2026-07-05)* :
  - [x] Admin : écrans `/pricing` (Tarifs) + `/zones` (Zones) + statuts étendus & colonne paiement dans Archives. Build prod OK.
  - [x] Mobile livreur : `OrderStatusUtils` (libellés FR), boutons d'avancement (statuts fins, coexistent avec le géofencing) + badge paiement. analyze 10 / test 10/10.
  - [x] Mobile commerçant : `driver_picker_sheet` (choix livreur via `available-drivers` → `preferredLivreurId`) + écran « Mes livreurs » (affiliés). analyze 10 / test 10/10.
- [ ] **Fallback auto livreur public** si affiliés indisponibles (attribution auto avancée — classé « après V1 » dans le CDC, à planifier)

### 🟢 Profil livreur complet (conformité CDC)
- [x] **Photo de pièce d'identité** — `User.idCardPhotoUrl`, `POST /users/me/id-card-photo` (storage dédié `uploads/identity/`). Mobile : upload/aperçu dans l'écran Profil livreur. Admin : vignette + alerte « non fournie » dans l'écran de validation. *(2026-07-05)*
- [x] **Zone habituelle** — `Vehicle.usualZone` (FK `Zone`), `usualZoneId` sur `PUT /vehicles/me`. Mobile : dropdown zones actives. Admin : affichée à côté du véhicule dans la validation. *(2026-07-05)*
- Vérifs : backend jest 221/221 (15 suites) ; admin build prod OK ; mobile analyze 10 (préexistantes) / test 10/10.

---

## 🔥 BUGS CRITIQUES (à corriger en priorité)

### Audit codex (2026-07-04) — 8/9 findings corrigés
> Audit par triangulation des 3 stacks. Verdict initial FAIL. Correctifs via 3 agents parallèles + manuels. Détail complet : `PROGRESS.md` Session 22.
- [x] **Finding #1 (CRITICAL)** — Escalade de privilèges à l'inscription (`POST /v1/auth/register` acceptait `role: ADMIN`)
  - `backend/src/auth/dto/register.dto.ts` : `@IsIn(REGISTRABLE_ROLES)` (CLIENT/LIVREUR/COMMERCANT uniquement, ADMIN exclu)
  - `backend/src/auth/auth.service.ts` : garde défensive `ForbiddenException` si `dto.role === UserRole.ADMIN`
  - Test ajouté : `backend/src/auth/auth.service.spec.ts`
- [x] **Finding #2 (HIGH)** — `OrderTrackingScreen._refreshDetails()` (CLIENT) appelait `GET /orders` (`@Roles(ADMIN, LIVREUR)` → 403 + réponse désormais paginée non-array)
  - `mobile_app/lib/screens/order_tracking_screen.dart:213` : `_api.get('/orders')` → `_api.get('/orders/mine')`. Vérifié : aucun autre écran CLIENT concerné.
- [x] **Finding #3 (HIGH)** — vulnérabilités npm : `npm audit fix` (sans `--force`). Backend **40 → 18** (ws/socket.io, qs, typeorm, protobufjs). Admin **25 → 13** (ws, qs, sigstore, tar). Restes = breaking changes (multer, uuid/firebase-admin côté backend ; Angular/vite/build tooling côté admin) → à planifier séparément.
- [x] **Finding #4 (MEDIUM)** — test scaffold obsolète `app.controller.spec.ts` testait `getHello()` (supprimé) → réécrit pour tester `getHealth()`. Débloque le CI backend.
- [x] **Finding #5 (MEDIUM)** — `chat:join` sans contrôle d'appartenance
  - `backend/src/orders/orders.gateway.ts` : `@InjectRepository(DeliveryOrder)` + `isUserPartyToOrder(orderId, userId, role)` (client/livreur/admin uniquement). Tests : `orders.gateway.spec.ts`
- [x] **Finding #7 (INFO)** — route morte `POST /reports/commissions/:id/pay` supprimée (doublon de `mark-paid`, aucun appelant)
- [x] **Finding #8 (INFO)** — doc `MARCHAND` → `COMMERCANT` alignée sur le code (`PROGRESS.md`)
- [ ] **Finding #6 (LOW, `TO_VALIDATE`)** — période de commission par `createdAt` vs `completedAt` (`reports.service.ts`). Décision métier à trancher — NON corrigé.
- [x] **Vérifs finales** : backend `npm run build` OK + `npx jest` 120/120 ✅ · mobile `flutter test` 10/10 ✅ · admin build prod OK

### Bug #1 — Course déjà prise sur le radar livreur
- [x] **Backend** : créer `GET /orders/available` qui filtre `status=PENDING AND livreur IS NULL`
  - Fichier : `backend/src/orders/orders.service.ts` + `orders.controller.ts`
  - Rôle : `LIVREUR` uniquement
- [x] **Backend** : refactor `acceptOrder` avec UPDATE atomique pour fix race-condition
  - Fichier : `backend/src/orders/orders.service.ts:310-326`
  - Pattern : `UPDATE ... WHERE id=:id AND status='PENDING'` puis vérifier `affected===1`
- [x] **Mobile** : remplacer `_loadAvailableOrders` pour utiliser `/orders/available`
  - Fichier : `mobile_app/lib/driver_screen.dart:56-68`
- [ ] **Mobile** : retirer la course du radar dès `orderAccepted` reçu (déjà fait, à vérifier que ça marche après le fix)

**Symptôme** : un livreur voit une course déjà acceptée par un autre dans son radar et reçoit "Course déjà prise" en cliquant. **Cause** : `GET /orders` renvoie toutes les courses, pas seulement les PENDING.

---

## 🚀 SPRINT EN COURS — Fonctionnalités client

### Profil client (NOUVEAU)
- [x] **Mobile** : écran `ClientProfileScreen` (`mobile_app/lib/screens/client_profile_screen.dart`)
  - Avatar circulaire + upload photo (`POST /users/me/photo`)
  - Édition prénom/nom (`PATCH /users/me`)
  - Numéro de téléphone en lecture seule
  - Accès à l'historique des commandes (`OrderHistoryScreen`)
  - Déconnexion avec dialog de confirmation
- [x] **Routage** : route `clientProfile = '/home/client/profile'` dans `app_router.dart`
- [x] **Accès** : icône `account_circle_outlined` dans `OrderHeader` → `_openProfile()` dans `order_screen.dart`

### Annulation d'une commande par le client
- [x] **Mobile** : bouton "Annuler la commande" dans `order_screen.dart` quand `_activeOrderStatus IN ('PENDING','ACCEPTED')`
  - Confirmation modale : "Êtes-vous sûr ? Le livreur a peut-être déjà démarré"
  - Champ optionnel "Raison" (envoyé via `cancellationReason` du DTO existant)
  - Endpoint backend déjà prêt : `PATCH /orders/:id/status` avec `{status: 'CANCELLED', cancellationReason: '...'}`
- [x] **Mobile** : reset de l'écran après annulation (revenir au formulaire de commande)
- [x] **Backend** : émettre une push notification au livreur si la course était `ACCEPTED` (pour le prévenir)
  - Fichier : `backend/src/orders/orders.service.ts:386-398`

---

## 🟠 BACKEND — À faire prochainement

- [x] **Pagination sur `/orders`** — `findAll()` charge tout en mémoire, va exploser à 10k courses
  - Fichier : `backend/src/orders/orders.service.ts:284-289`
  - Query params `?page=1&limit=20&status=...`
- [x] **Helmet** — headers de sécurité (CSP, X-Frame-Options, HSTS…)
  - `npm install helmet` puis `app.use(helmet())` dans `main.ts`
- [x] **Soft-delete sur `User` et `DeliveryOrder`** — actuellement CASCADE = perte de données comptables
  - `@DeleteDateColumn deletedAt: Date | null` ajouté sur `backend/src/entities/user.entity.ts` et `delivery-order.entity.ts`. TypeORM filtre automatiquement les soft-deleted dans les `find/findOne` standard (sauf si `withDeleted: true` est passé explicitement).
  - Migration `backend/src/migrations/1777626458400-AddSoftDelete.ts` : ajoute la colonne `deletedAt DATETIME(6) NULL` sur `users` et `delivery_orders`. Sera appliquée automatiquement au prochain `flyctl deploy` (`migrationsRun: true` en prod).
  - Endpoints admin : `DELETE /users/:id` (soft-delete) + `POST /users/:id/restore` (restore) — guards `@Roles(UserRole.ADMIN)` + `ParseUUIDPipe`. Méthodes correspondantes `softDelete(id)` / `restore(id)` ajoutées sur `UsersService`.
  - Aucun `usersRepository.remove/delete` ni `ordersRepository.remove/delete` existant à remplacer (vérifié par grep). `OrdersService.findAll/findForUser` exclut déjà les soft-deleted via le comportement par défaut TypeORM — pas de modification nécessaire.
  - Pas d'endpoint soft-delete sur `DeliveryOrder` (l'annulation existe déjà via `updateStatus → CANCELLED`).
  - Tests Jest : `backend/src/users/users.service.spec.ts` créé (2 tests : softDelete et restore).
- [ ] **Migration uploads vers Cloudflare R2** — uploads sur Fly sont éphémères, photos disparaissent à chaque deploy
  - `backend/src/users/upload.config.ts` + `backend/src/shops/upload.config.ts`
  - Compatible S3 SDK
- [x] **FCM fallback livreurs offline** — un livreur déconnecté du WS reçoit maintenant une push FCM dès qu'une nouvelle course est créée
  - Fichiers : `backend/src/orders/orders.service.ts` (méthode privée `notifyOfflineLivreurs`, fire-and-forget après le broadcast WS) + `backend/src/users/users.service.ts` (`findLivreursWithFcmToken`)
  - Push payload : `{ kind: 'new_order', orderId }`, body = "Pickup: <adresse>" (tronqué à 80 chars)
  - ✅ **Filtre géo désormais actif** : depuis la persistance des positions livreur (cf. tâche ci-dessous), on filtre les livreurs offline par distance haversine ≤ `NOTIFY_RADIUS_KM` (default 5 km). Quand aucune position récente n'est connue (cache vide après redéploiement), on retombe automatiquement sur le comportement "notifier tous les livreurs avec fcmToken" pour ne pas avoir de trou de service.
  - Tests Jest : 3 tests dans `orders.service.spec.ts` (push aux offline mode fallback, aucun envoi si tous online, filtre géo actif quand positions récentes existent).
- [x] **Multi-tokens FCM par user** — un user qui a 2 devices reçoit maintenant les pushs sur tous ses appareils
  - Nouvelle entité `DeviceToken` (`backend/src/entities/device-token.entity.ts`) + table `device_tokens(id, userId, token UNIQUE, platform, createdAt, lastSeenAt)` avec index `(userId, lastSeenAt)`. FK `userId` → users CASCADE.
  - Service `DeviceTokensService` (`backend/src/users/device-tokens.service.ts`) : `upsert/listForUser/deleteByToken/deleteAllForUser/findUserIdsWithToken`. L'upsert utilise INSERT ON DUPLICATE KEY UPDATE sur la colonne `token` unique → un appareil revendu réassocie automatiquement.
  - Endpoint `PATCH /users/me/fcm-token` mis à jour : accepte `{token, platform?, previousToken?, lastToken?}`. `{token: "abc"}` upsert ; `{token: null, previousToken: "x"}` supprime le device précis ; `{token: null}` supprime tous les tokens du user (logout final).
  - `NotificationsService.sendToUser` envoie en parallèle (`Promise.allSettled`) à tous les tokens du user, supprime ceux retournés invalides par FCM. **Rétro-compat** : si la table `device_tokens` est vide pour un user, fallback sur `User.fcmToken` legacy (anciens APK pas encore migrés).
  - **Rétro-compat mobile** : le champ `User.fcmToken` est conservé en DB (marqué `@deprecated` côté entité) et synchronisé sur le dernier token enregistré, jusqu'à migration mobile. Une migration de cleanup viendra plus tard.
  - Tests Jest : `device-tokens.service.spec.ts` (8 tests : upsert/listForUser/deleteByToken/deleteAllForUser/findUserIdsWithToken).
- [x] **Persistance des positions livreur** — fini le `Map` mémoire perdu au redéploiement
  - Nouvelle entité `DriverPosition` (`backend/src/entities/driver-position.entity.ts`) + table `driver_positions(id, livreurId UNIQUE, lat, lng, orderId nullable, createdAt, updatedAt)` avec index `(updatedAt)`. FK `livreurId` → users CASCADE. **Une seule ligne par livreur** (mise à jour à chaque émission `driver:location`).
  - Service `PositionsService` (`backend/src/orders/positions.service.ts`) : `upsertPosition` (INSERT ON DUPLICATE KEY UPDATE atomique) + `findRecentLivreurPositions(maxAgeMinutes=5)` (jointure `livreur` pour le fallback FCM).
  - Hook fire-and-forget dans `OrdersGateway.handleDriverLocation` : la `Map` mémoire est conservée pour le forwarding live (faible latence), et la position est persistée en parallèle.
  - **Filtre géo activé** dans `OrdersService.notifyOfflineLivreurs` : on lit `findRecentLivreurPositions(5)`, on filtre par haversine ≤ `NOTIFY_RADIUS_KM`. Fallback automatique sur le mode "notifier tous les livreurs avec fcmToken" si aucune position récente (post-redéploiement).
  - Migration combinée `backend/src/migrations/1777800000000-AddDriverPositionsAndDeviceTokens.ts` : crée les 2 tables en up(), down() inverse propre. S'applique automatiquement au prochain `flyctl deploy` (`migrationsRun: true` en prod).
  - Pas de table d'historique (`driver_position_history`) en V1 : volume de writes potentiellement élevé (~1 toutes les ~25 m parcourus), à ajouter plus tard si besoin tracking.
- [x] **Versioning d'API** — `app.setGlobalPrefix('v1')` synchronisé sur backend + mobile + admin
  - Backend : `backend/src/main.ts` → `app.setGlobalPrefix('v1', { exclude: [{ path: '/', method: RequestMethod.GET }] })`. La racine `/` reste accessible (health check pour UptimeRobot/BetterStack). Les WebSockets (namespace Socket.IO `/orders`) restent à la racine — ils ont leur propre système de routing, indépendant des controllers Nest, donc `setGlobalPrefix` ne les impacte pas. Les fichiers statiques `/uploads/*` restent eux aussi à la racine (servis par `ServeStaticModule`, hors du système de controllers).
  - Mobile : nouvelle constante `apiPrefix = '/v1'` dans `mobile_app/lib/config/env.dart`. `ApiClient._uri` concatène `apiPrefix`, donc tous les services qui passent par `ApiClient` (la majorité) sont préfixés automatiquement. Adaptés manuellement (HTTP direct hors `ApiClient`) : `services/auth_service.dart` (login/register), `screens/driver_profile_screen.dart` (upload photo profil), `services/shops_service.dart` (`_uploadImageRaw` pour photos boutiques/produits). NE PAS préfixer (déjà vérifié) : sockets dans `controllers/order_socket_controller.dart` + `services/chat_service.dart`, et toutes les `NetworkImage('$apiUrl/uploads/...')` dans les écrans (favorites, shop_list, shop_detail, merchant_home, merchant_product_form, driver_profile).
  - Admin : nouvelle propriété `apiPrefix: '/v1'` dans `environment.ts` et `environment.prod.ts`. Adaptés (préfixés) : `auth/auth.service.ts`, `orders.service.ts`, `users/users.service.ts`, `shops/shops.service.ts`, `reports/reports.service.ts`, `audit-logs/audit-logs.service.ts`, `shared/messages.service.ts`. NE PAS préfixer : `shared/live-status.service.ts` (Socket.IO), `shops/shops.component.ts:144` (URL de logo `/uploads/...`).
  - Vérifications : 96/96 jest passent, `flutter analyze` 8 issues préexistantes (aucune nouvelle), `flutter test` 10/10, `npm run build -- --configuration production` OK (seuls les 2 warnings préexistants NG8107 sur `main-layout.component.html`).
  - **Note de déploiement** : déployer le backend AVANT le mobile/admin. Si déployé dans l'autre ordre, les clients qui pointent sur `/v1` recevront 404 jusqu'à ce que le backend bascule. Pas de migration DB. Pas de regénération d'APK dans cette session (à faire ensuite : `flutter build apk --release`). Les 1-2 utilisateurs en phase de test devront réinstaller l'APK.
- [x] **Sentry / error tracking** — intégration complète backend + mobile + admin
  - Backend : `@sentry/nestjs` + `SentryGlobalFilter` via `APP_FILTER` (DI). Init conditionnel sur `SENTRY_DSN`. Fix critique : filtre n'est plus instancié manuellement (évite le crash `applicationRef undefined`).
  - Flutter : `sentry_flutter` init conditionnel sur `--dart-define=SENTRY_DSN`. `attachScreenshot: true`.
  - Angular : `@sentry/angular` + `ErrorHandler` + `TraceService` dans `app.config.ts`.
- [ ] **HA backend** — Fly.io tourne avec 1 seule VM, downtime au moindre crash
  - Passer à 2 VMs + Redis Adapter pour Socket.IO

---

## 🟡 MOBILE — Refactor & dette technique

- [ ] **Appliquer les Flutter Skills installés** (cf. `.agents/skills/`)
  - [x] `flutter-setup-declarative-routing` → migrer vers `go_router`
  - [x] `flutter-implement-json-serialization` → `json_annotation` + `build_runner` + `json_serializable` ajoutés. 6 modèles migrés (Product, User/AuthResult, RatingStats, Rating, OrderHistoryItem, ChatMessage, Shop/ShopCategory). `.g.dart` générés. `flutter test` 10/10 ✅
  - [ ] `flutter-apply-architecture-best-practices` → découper UI / ViewModel / Repository
- [ ] **Découper les gros écrans monolithiques**
  - [ ] `order_screen.dart` (530 lignes)
  - [ ] `chat_screen.dart` (625 lignes)
  - [ ] `driver_screen.dart` (517 lignes)
  - [ ] `merchant_home_screen.dart` (579 lignes)
- [x] **Unifier les sockets** — `driver_screen.dart` ouvre son propre socket au lieu de réutiliser `OrderSocketController`
  - Fichier : `mobile_app/lib/driver_screen.dart`
  - **Refactor effectué** : `driver_screen.dart` n'importe plus `socket_io_client` directement. Il instancie `OrderSocketController` et écoute trois streams (`newOrderAvailable$`, `orderAccepted$`, `connected$`). L'émission `driver:location` passe par `_socketCtrl.emitDriverLocation(lat, lng, heartbeat: ...)`.
  - **Streams/méthodes ajoutés à `OrderSocketController`** :
    - `Stream<NewOrderEvent> newOrderAvailable$` (pas filtré sur `activeOrderId` — toutes les nouvelles courses doivent apparaître dans le radar livreur)
    - `Stream<void> connected$` (équivalent de l'ancien `socket.onConnect` — déclenche `_startLocationUpdates()` une fois la connexion établie)
    - `void emitDriverLocation(double lat, double lng, {bool heartbeat = false})` (encapsule `socket.emit('driver:location', ...)`)
    - Classe d'event `NewOrderEvent { orderId, raw }` (parsing tolérant `id`/`orderId`).
    - `orderAccepted$` existait déjà côté client : il filtre par `activeOrderId` quand celui-ci est défini ; côté livreur on ne le définit jamais, donc TOUTES les acceptations passent — exactement ce qu'il faut pour retirer une course du radar quand un autre livreur la prend.
  - **Handlers `socket.on(...)` / `socket.emit(...)` supprimés de `driver_screen.dart`** :
    - `socket.onConnect((_) => _startLocationUpdates())` → sub `_socketCtrl.connected$`
    - `socket.on('newOrderAvailable', ...)` → sub `_socketCtrl.newOrderAvailable$`
    - `socket.on('orderAccepted', ...)` → sub `_socketCtrl.orderAccepted$`
    - `socket.emit('driver:location', {lat, lng})` (× 2 sites : `_emitPosition` + heartbeat) → `_socketCtrl.emitDriverLocation(...)`
    - `socket?.disconnect()` → `_socketCtrl.dispose()` dans `dispose()`
  - **Géofencing pickup préservé intégralement** : `_currentPickupLat/Lng`, `_geofenceOrderId`, `_geofenceTriggered`, `_pickupGeofenceMeters = 80`, `_checkPickupGeofence`, `_suggestArrival`, `_confirmArrival`, `_resetGeofenceState`, callback `_onGeofenceTransitioned`, `GlobalKey<ScaffoldMessengerState>`, edge case "déjà sur place à l'acceptation" — tout est resté en place. La logique du dialog `_showSuccessDialog` (StatefulBuilder, transitions avec `dialogProcessing`) est inchangée.
  - Heartbeat 90 s, `distanceFilter: 25`, chargement de `currentDriverId` via `AuthService().getCurrentUser()` : préservés.
  - `flutter analyze` : 9 warnings/infos préexistants, aucun introduit (l'ancien `library_prefixes` sur `IO` a même disparu de `driver_screen.dart` puisque l'import a été retiré). `flutter test` : 10/10 passent.
- [x] **Refonte UX multi-commandes client** — StatefulShellRoute 4 onglets (Session 19)
  - [x] `OrderSocketController` : `Set<String> _watchedOrderIds` + `watchOrder/unwatchOrder/clearWatchedOrders/_shouldEmit()`
  - [x] `ActiveOrdersStore` (ChangeNotifier) : liste ≤ 5 commandes, bootstrap, `onOrderCreated`, `onOrderCancelled`
  - [x] `ClientServices` : registre statique (socket + store + pendingShopSelection ValueNotifier)
  - [x] `OrderTrackingScreen` : suivi par `orderId`, filtrage stream, ETA polling
  - [x] `ClientShellScreen` (StatefulShellRoute 4 branches) : boot ClientServices, badge Commandes
  - [x] `HomeTab` : formulaire pur + AutomaticKeepAliveClientMixin + bascule vers onglet Commandes après submit
  - [x] `OrdersTab` : AnimatedBuilder sur ActiveOrdersStore, cartes avec badges de statut, limite 5
  - [x] `ShopsTab` : wrapper ShopListScreen + ValueNotifier pendingShopSelection → HomeTab
  - [x] `ShopListScreen` : paramètres `onProductSelected` + `hideBackButton`
  - [x] `app_router.dart` : routes client shell (4 branches), tracking `:orderId`, redirects
  - [x] `client_profile_screen.dart` : `ClientServices.reset()` au logout
  - [x] `order_history_screen.dart` : paramètre `embedInTab` (masque Scaffold/AppBar)
  - [x] `driver_screen.dart` : IndexedStack 3 onglets (Radar + Mes courses + Profil), `_currentTabTitle()`
  - [x] Smoke tests intégration mis à jour (HomeTab / DriverScreen / MerchantHomeScreen)
  - [x] `flutter analyze` : 10 issues toutes préexistantes (0 introduit). `flutter test` : 10/10

- [~] **Tests Flutter** — il n'y a que `widget_test.dart` par défaut
  - Skill : `flutter-add-widget-test` + `flutter-add-integration-test`
  - [x] Premier test widget : `OrderAcceptedSection` (annulation) — `test/widgets/order_accepted_section_test.dart`
  - [x] Test widget : `OrderFormSection` (rendu vide, loading, estimation, ShopOriginBanner) — `test/widgets/order_form_section_test.dart`
  - [x] Test widget : `OrderHistoryScreen` (état de chargement initial) — `test/widgets/order_history_screen_test.dart`
  - [x] **Tests d'intégration** (dossier `mobile_app/integration_test/`) :
    - [x] Setup : ajout `integration_test: { sdk: flutter }` dans `pubspec.yaml` dev_dependencies + création du dossier `integration_test/` avec un `README.md` (instructions, patterns, limitations).
    - [x] `login_flow_test.dart` — présence des composants UI (PhoneField, mot de passe, bouton, lien création), validation champs vides → snackbar d'erreur, état `_isLoading` après tap, navigation vers RegisterScreen.
    - [x] `create_order_flow_test.dart` — smoke test minimal : `OrderScreen` se construit sans crasher avec un mock `geolocator` qui simule "GPS indisponible".
    - [x] `home_screen_smoke_test.dart` — aiguillage par rôle (CLIENT → OrderScreen, LIVREUR → DriverScreen, COMMERCANT → MerchantHomeScreen, ADMIN → placeholder neutre, storage vide → fallback).
    - **Limitations explicites** (cf. `integration_test/README.md`) : pas de mock réseau (les tests ne valident que les états d'UI / chemins d'erreur, pas les happy paths), pas de mock GPS détaillé (juste "service indisponible"), pas de mock WebSocket, pas de pumpAndSettle (sockets/timers ouvrent des Futures qui ne settle jamais). Pour des tests E2E plus complets (avec un vrai backend), il faudra refactor `AuthService`/`ApiClient` pour injecter un `http.Client` ou setup un backend de test.
    - **Comment lancer** : `flutter test integration_test/` sur device/émulateur connecté (NE PAS lancer en `flutter test` simple — les tests d'intégration ont besoin d'un device).
    - Vérifications : `flutter analyze integration_test/` → No issues found. `flutter analyze` du projet → 9 issues toutes préexistantes (aucune introduite). `flutter test test/` → 10/10 OK.
- [x] **Retirer les `print()` en prod** — ex: `driver_screen.dart:81` (remplacé par `debugPrint`)

---

## 🟡 ADMIN — Améliorations

- [x] **Audit log admin** — qui a approuvé/rejeté une boutique, marqué une commission payée, etc.
  - Backend implémenté (entité + service + endpoints + hooks dans shops/reports). UI admin pour visualiser à faire dans une autre tâche.
  - Entité `AdminAuditLog` + migration `1777400000000-AddAdminAuditLog.ts` (table `admin_audit_logs`, FK `adminId`→users SET NULL, indexes (adminId, createdAt) et (targetType, targetId)).
  - Module `audit-log` exposant `GET /admin/audit-logs` (ADMIN only) avec pagination + filtres (adminId, targetType, action, from, to).
  - Hooks fire-and-forget dans `shops.service.adminApprove/Reject/Suspend` et `reports.service.markPaid`. Signatures enrichies d'`adminId` (extrait via `user.id ?? user.sub` côté controllers).
  - Tests Jest : 74/74 (3 tests `audit-log.service.spec.ts` couvrent `log()` succès/null/erreur silencieuse et `list()` paginée + filtres ; `shops.service.spec.ts` adapté aux nouvelles signatures).
  - **UI admin disponible** : nouveau composant `admin-dashboard/src/app/audit-logs/audit-logs.component.ts/html/css` + service `audit-logs.service.ts`. Route `/audit-logs` ajoutée dans `app.routes.ts` (lazy load), lien "Journal d'audit" (icône `clipboard-list`) dans la sidebar (`layout/main-layout.component.ts`). Tableau avec filtre par action (ALL + 6 actions), filtres "Du"/"Au", pagination Précédent/Suivant + "Page X sur Y", skeleton loading, état vide via `EmptyStateComponent`. Métadonnées affichées en JSON formaté dans `<pre>`. Badge coloré par action (vert/rouge/jaune/bleu). "Admin supprimé" si `admin` null. Build prod OK (51s, aucune nouvelle erreur).
- [x] **Filtres avancés** sur `/orders` admin (date, statut, livreur, client)
  - Implémenté côté admin sur `/archives` : sélecteur de statut (PENDING/ACCEPTED/IN_PROGRESS/COMPLETED/CANCELLED/ALL), date "Du"/"Au", bouton Réinitialiser, pagination (Précédent/Suivant + page X sur Y). Service `OrdersService.getOrdersPaged({page,limit,status,from,to})` ajouté avec rétro-compat (déballe l'ancien array brut). Filtres "livreur"/"client" non implémentés (pas dans la spec backend actuelle).
- [x] **Statistiques par livreur** (temps moyen de course, taux d'annulation, note moyenne)
  - [x] Note moyenne et nombre d'avis (colonne dans `/users`, via `GET /users/:id/ratings/stats`)
  - [x] Nombre de courses terminées (colonne "Courses" dans `/users`)
  - [x] Temps moyen de course (colonne "Temps moyen" dans `/users`, format intelligent `X min` / `Yh Zmin`)
  - [x] Taux d'annulation (colonne "Taux d'annulation" dans `/users`, badge coloré vert<5% / jaune 5-15% / rouge>15%)
  - Endpoint utilisé : `GET /users/:id/stats` (nécessite le backend récemment ajouté avec timestamps de transition `acceptedAt`/`completedAt` sur `DeliveryOrder` + endpoint dédié). Service admin : `UsersService.getUserExtendedStats(userId)` dans `admin-dashboard/src/app/users/users.service.ts`. Fallback gracieux si l'endpoint n'est pas encore déployé : on retombe sur `GET /users/:id/ratings/stats` pour conserver la note moyenne, et les 3 nouvelles colonnes affichent `—`. L'ancienne méthode `getRatingStats` est conservée pour rétro-compat.
  - **Backend livré** : `RatingsService.getExtendedStats(userId)` (combine `getUserStats` + 2 agrégats SQL via QueryBuilder TypeORM sur `delivery_orders`) ; route `GET /users/:userId/stats` dans `ratings.controller.ts` (tout user authentifié, `ParseUUIDPipe`). Timestamps `acceptedAt/inProgressAt/completedAt` ajoutés sur `DeliveryOrder` (entité + setters dans `OrdersService.acceptOrder` via `() => 'CURRENT_TIMESTAMP'` et dans `updateStatus` via `new Date()`). Migration combinée `1777900000000-AddTimestampsAndFavoriteShops.ts` (en haut de l'ordre d'exécution prochaine après les soft-delete + driver positions). 4 tests Jest dans `ratings.service.spec.ts` (user vide, completed avec durée moyenne, cancellationRate, totalAssigned=0).
  - Filtre "afficher seulement les livreurs avec taux d'annulation > X%" : non implémenté (peut être ajouté plus tard si besoin).
- [x] **Sélecteur d'indicatif téléphonique (country code picker)** côté admin
  - Composant standalone `PhoneInputComponent` créé dans `admin-dashboard/src/app/shared/phone-input/` (TS + HTML + CSS + `countries.ts`).
  - Implémente `ControlValueAccessor` → utilisable avec `formControlName` / `[(ngModel)]`. Émet la valeur internationale concaténée (`+22890123456`).
  - Dropdown avec recherche par nom/code, drapeau emoji + code, ~22 pays (12 africains prioritaires + diaspora). Soft warning visuel si longueur hors min/max du pays sélectionné. Default `+228` (Togo).
  - **Intégré dans** : `auth/login/login.component.html` (champ téléphone admin). Les composants `users` et `shops` n'ont pas de formulaire de création/édition de téléphone côté admin → pas d'autres intégrations possibles aujourd'hui. À réutiliser dès qu'un formulaire d'édition de profil/boutique est ajouté.
  - Build prod OK. Pas de tests dédiés (sortie de scope, voir 🟡 ADMIN tests).

---

## 🛠 DEVOPS

- [x] **CI/CD GitHub Actions** — 3 workflows créés (backend-ci.yml, admin-ci.yml, flutter-ci.yml). Tests sur tous les PRs, déploiements sur push main uniquement. Secrets à configurer: FLY_API_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GOOGLE_SERVICES_JSON
- [x] **Pattern CORS preview Cloudflare** — supporter `*.pages.dev` (regex) pour les previews admin
  - Helper partagé `backend/src/common/cors.ts` (`loadCorsConfig`, `isOriginAllowed`, `hasAnyCorsConfig`).
  - Nouvelle env var `FRONTEND_URL_PATTERNS` (regex string séparées par virgules). Combinée avec `FRONTEND_URLS` existante (origines exactes). Si une origin matche soit l'une soit l'autre → autorisée.
  - Appliqué dans `main.ts` (HTTP CORS via callback) et `orders.gateway.ts` (`resolveWsCorsOrigin` refactorisé en callback Socket.IO).
  - Exemple à pousser sur Fly.io : `flyctl secrets set FRONTEND_URL_PATTERNS="^https://[a-z0-9-]+\\.zonzon-admin\\.pages\\.dev$" --app zonzon-backend`
  - Tests Jest : `backend/src/common/cors.spec.ts` (11 tests : parsing env, regex invalides ignorées, matching exact/pattern, origin absente, hasAnyCorsConfig).
- [x] **Monitoring uptime** — endpoint `GET /` retourne JSON `{status, uptime, timestamp, env}` prêt pour UptimeRobot/BetterStack. Configurer le monitor sur `https://zonzon-backend.fly.dev/` avec keyword `"ok"`

---

## 💎 FONCTIONNALITÉS FUTURES (idéation)

- [ ] **Annulation no-show / dédommagement** — si client annule après livreur en route, le livreur a perdu du temps
- [x] **Historique des courses** — écran dédié côté client/livreur (au-delà de la course active)
  - Mobile : `mobile_app/lib/screens/order_history_screen.dart` + modèle `models/order_history_item.dart`
  - Source : `GET /orders/mine` (rôle déjà géré côté backend)
  - Filtres client : `Toutes` / `En cours` (PENDING/ACCEPTED/IN_PROGRESS) / `Terminées` (COMPLETED/CANCELLED)
  - Détails au tap : `showModalBottomSheet` (description, raison d'annulation, contrepartie)
  - Accès CLIENT : icône `Icons.history` dans `OrderHeader` (à gauche du logo)
  - Accès LIVREUR : tuile "Mes courses" dans l'onglet "Mon Profil" entre les stats et les infos perso
- [x] **Favoris boutiques** côté client — UI mobile faite + **backend livré** (entités + endpoints + service)
  - **Backend** : nouvelle entité `backend/src/entities/favorite-shop.entity.ts` (table `favorite_shops`, UNIQUE `(userId, shopId)`, index `(userId, createdAt)`, FK CASCADE vers `users` et `shops`). Méthodes `ShopsService.addFavorite/removeFavorite/listFavorites/isFavorite` (insert idempotent via try/catch sur ER_DUP_ENTRY ; vérif shop APPROVED sur add ; jointure shop+APPROVED sur list, ordre `createdAt DESC`). Routes dans `shops.controller.ts` : `GET /shops/favorites`, `POST /shops/:id/favorite`, `DELETE /shops/:id/favorite` (déclarées AVANT le pattern catch-all `@Get(':id')`). Migration combinée `1777900000000-AddTimestampsAndFavoriteShops.ts` (créée la table dans le même up()). Wiring : `FavoriteShop` ajouté dans `app.module.ts` (entities) et `shops.module.ts` (`forFeature`). 8 tests Jest dans `shops.service.spec.ts` (add succès, idempotent ER_DUP_ENTRY, NotFound, remove succès, remove no-op, listFavorites filtre APPROVED, isFavorite true/false).
  - Mobile : nouvelles méthodes `ShopsService.getFavorites/getFavoriteIds/addFavorite/removeFavorite` dans `lib/services/shops_service.dart` (idempotents : 409 swallow sur add, 404 swallow sur remove).
  - Mobile : bouton cœur sur chaque carte de `lib/screens/shop_list_screen.dart` (top-right Stack overlay) avec optimistic update + revert sur erreur. Le `Set<String>` des IDs favoris est chargé une seule fois au bootstrap pour éviter un appel API par item.
  - Mobile : bouton cœur dans l'AppBar de `lib/screens/shop_detail_screen.dart` (état initial reçu via constructeur depuis `ShopListScreen`, sinon fetch au `initState` via `getFavoriteIds()`). Callback `onFavoriteChanged` pour synchroniser le Set côté liste sans refetch.
  - Mobile : nouvel écran `lib/screens/favorites_screen.dart` (états loading / erreur "Réessayer" / vide ("Aucun favori pour le moment") / liste, `RefreshIndicator` pull-to-refresh, retrait via bouton cœur ou long-press avec snackbar de confirmation).
  - Mobile : accès depuis l'AppBar de `ShopListScreen` (icône cœur rouge `Icons.favorite` dans `actions`).
- [ ] **Multi-produits / panier** dans une commande boutique
- [x] **Estimation de temps d'arrivée** (ETA) basée sur la position du livreur
  - **Backend** : nouvel endpoint `GET /orders/:id/eta` (auth client/livreur/admin gérée dans le service via `ForbiddenException`, `ParseUUIDPipe`). Méthode `OrdersService.computeEta(orderId, actor)` : selon le statut (ACCEPTED → livreur→pickup ; IN_PROGRESS → livreur→delivery ; autres → `unavailable`), récupère la dernière position persistée du livreur via `PositionsService.findLatestForLivreur(livreurId)` (1 ligne par livreur en base, table `driver_positions`). Position fraîche (< 5 min) → `basedOn: 'driver_position'` ; sinon, en IN_PROGRESS on retombe sur les coords pickup (`basedOn: 'pickup'`), en ACCEPTED on retourne `unavailable`. Distance via `haversineKm` (`backend/src/common/geo.ts`), ETA = `Math.max(1, round(distanceKm / 25 * 60))` en minutes (vitesse moyenne 25 km/h pour les motos à Lomé). Pas d'appel ORS pour rester gratuit (refresh toutes les 30s × N clients).
  - **Mobile** : nouveau service `lib/services/eta_service.dart` (classe `EtaResult` exposant `distanceKm`, `etaMinutes`, `basedOn`, `fetchedAt`, getters `isAvailable` et `isFallback`). `OrderScreen` (`lib/order_screen.dart`) ajoute champ `_eta`, timer `_etaTimer` (30s), méthodes `_startEtaPolling/_stopEtaPolling/_refreshEta`. Démarré à la réception de `orderAccepted$`, refresh immédiat à chaque `driverPosition$` (la position du livreur vient d'évoluer côté backend), refresh aussi sur transition IN_PROGRESS (la cible change pickup→delivery), stoppé sur COMPLETED/CANCELLED et dans `_resetAfterCancellation`. `_eta` est passé à `OrderAcceptedSection` qui le forward à `LiveTrackingBanner` (`lib/widgets/order_screen_widgets.dart`). Affichage : badge `_EtaBadge` "horloge + ~X min" dans le bandeau de tracking, couleur cyan `#0EA5E9` quand basé sur la position du livreur, gris `#94A3B8` + icône `warning_amber_rounded` quand fallback pickup. Texte secondaire grisé en mode fallback.
  - **Tests Jest** : 110/110 passent (était 96, +7 tests ETA dans `orders.service.spec.ts` couvrant ACCEPTED+position fraîche, IN_PROGRESS+position fraîche, PENDING→unavailable, ACCEPTED sans position fraîche, IN_PROGRESS sans position fraîche → fallback pickup, Forbidden, NotFound, admin autorisé). `flutter analyze` 8 issues préexistantes, aucune nouvelle. `flutter test` 10/10.
  - **Hors scope** : pas d'utilisation d'ORS pour le routing (trop coûteux avec un refresh toutes les 30s × N clients), pas d'ETA côté livreur (l'écran livreur reste sur le radar), pas de regénération d'APK.
- [ ] **Mode hors-ligne** côté livreur (cache de la course, sync à la reconnexion)
- [x] **Géofencing arrivée** — auto-passage en `IN_PROGRESS` quand le livreur arrive au pickup
  - **Soft-trigger avec confirmation** (pas de transition automatique sans clic livreur — risque de fausse arrivée GPS).
  - Implémentation mobile : `mobile_app/lib/driver_screen.dart` — quand une course passe `ACCEPTED` (dialog ouvert), on stocke `_currentPickupLat/Lng` et `_geofenceOrderId`. Dans `_emitPosition()`, on calcule `Geolocator.distanceBetween(...)` ; à ≤ 80 m, on déclenche `_suggestArrival()` qui pousse un `SnackBar` non-bloquant ("✅ Vous êtes arrivé(e). Marquer comme « En cours » ?") avec un bouton **Démarrer** qui appelle `_updateStatus(orderId, 'IN_PROGRESS')` et notifie le dialog ouvert via `_onGeofenceTransitioned`.
  - Edge cases gérés : check immédiat sur la dernière position connue à l'acceptation (cas du livreur déjà sur place) ; reset auto à COMPLETED/CANCELLED ou nouvelle course ; un seul trigger par course (`_geofenceTriggered`) ; transition manuelle via le dialog désactive le futur trigger ; échec serveur ré-arme le trigger.
  - `ScaffoldMessenger` dédié via `GlobalKey` pour que le SnackBar s'affiche par-dessus le dialog modal.
- [x] **Évaluation par étoiles avec catégories** (ponctualité, communication, courtoisie)
  - **Backend** : 3 colonnes nullable `punctualityScore`, `communicationScore`, `courtesyScore` (TINYINT 1-5) ajoutées sur l'entité `Rating` (`backend/src/entities/rating.entity.ts`). `score` (note globale) reste **inchangé** : c'est la note principale, les sous-catégories sont strictement additionnelles.
  - **Migration** `backend/src/migrations/1778000000000-AddRatingCategories.ts` : ajoute les 3 colonnes en `up()`, les drop en `down()`. Sera appliquée au prochain `flyctl deploy --app zonzon-backend` (`migrationsRun: true` en prod).
  - **DTO** `submit-rating.dto.ts` : 3 nouveaux champs optionnels `@IsOptional() @IsInt() @Min(1) @Max(5)`.
  - **Service** `RatingsService.submitRating` : persiste les 3 nouveaux scores avec fallback `?? null`. `getUserStats` enrichi : ajoute `punctualityAverage`, `communicationAverage`, `courtesyAverage` (null si aucune note de la catégorie reçue, sinon moyenne arrondie à 0.01) — utile pour la prochaine évolution stats admin.
  - **Mobile** : `lib/models/rating.dart` (3 champs `int?` + `RatingStats` étendue avec moyennes catégorie), `lib/services/ratings_service.dart` (`submit` accepte les 3 nouveaux paramètres et les omet du body si null), `lib/screens/rating_screen.dart` (3 nouvelles sections **Ponctualité ⏱️ / Communication 💬 / Courtoisie 🤝** avec étoiles cliquables, sous-titres explicites, en-tête "Évaluez ces aspects (optionnel)"). Re-cliquer sur la même étoile la réinitialise (= note effacée → null envoyé au backend). `Column` enveloppé dans `SingleChildScrollView` pour absorber la hauteur supplémentaire des sections.
  - **Rétro-compat** : les anciennes notes (avant migration) gardent leur `score` global ; les colonnes catégorie sont `NULL`. Les anciens APK qui n'envoient pas les sous-notes continuent de fonctionner sans changement (DTO `@IsOptional()` + service utilise `?? null`). `getUserStats` retourne les 3 moyennes catégorie à `null` si aucune note de catégorie n'a été reçue par l'user.
  - **Tests Jest** : 110/110 (était 96, +14 tests). Nouveau fichier `ratings.service.spec.ts` enrichi : `submitRating` avec catégories, `submitRating` sans catégories (rétro-compat), `submitRating` avec sous-ensemble partiel, `getUserStats` avec mix (catégories partielles), `getUserStats` user vide (toutes les moyennes catégorie null), `getUserStats` rétro-compat (aucune catégorie → null). Tests `getExtendedStats` existants adaptés aux nouvelles colonnes du raw row.
  - **Vérifications** : `npm run build` OK, `npx jest` 110/110 passent, `flutter analyze` 8 issues préexistantes (aucune nouvelle), `flutter test` 10/10 passent.
  - **Hors scope** : pas de modif `orders/*` ni `order_screen.dart` (autre agent ETA), pas de modif `integration_test/` (autre agent), pas d'UI admin pour visualiser les moyennes catégorie (à faire plus tard avec `getUserStats` étendue), pas de regénération d'APK.

---

## ⏰ À REPROGRAMMER (post-tests utilisateurs)

> Reportées explicitement par le PO car non prioritaires pendant la phase de tests actuelle. Le paiement initial se fait à la livraison, et chez le commerçant directement par mobile money sur son numéro perso.

- [ ] **🔴 Système de paiement intégré (Mobile Money TMoney/Flooz/Mixx)**
  - Aujourd'hui : paiement à l'arrivée + transfert direct au commerçant
  - Plus tard : intégration TMoney / Flooz / Mixx by YAS ou agrégateur (PayDunya, CinetPay)
  - Champs à ajouter : `paymentStatus`, `paymentMethod`, `paymentReference` sur `DeliveryOrder`
- [ ] **🔴 Vérification OTP SMS à l'inscription**
  - Aujourd'hui : compte créé sans confirmation du numéro
  - Risque : faux comptes, fraude
  - Plus tard : Twilio / Africa's Talking / Sinch + endpoints `/auth/otp/request` + `/auth/otp/verify`
- [ ] **🟠 Refresh tokens**
  - Aujourd'hui : JWT 7 jours sans rotation
  - Plus tard : access token court (15 min) + refresh token long révocable
- [ ] **🟡 Promo codes / parrainage / fidélité**
  - Levier de croissance pour le lancement

---

## ✅ DÉJÀ FAIT (références)

Pour l'historique complet, voir la section "Historique des sessions" dans [PROGRESS.md](PROGRESS.md).

- [x] Déploiement backend Fly.io + admin Cloudflare + base TiDB
- [x] Système de notation post-livraison (entité, module, écran mobile)
- [x] Migration ORSM → OpenRouteService (free tier)
- [x] Onglet "Mon Profil" livreur (photo, véhicule, stats)
- [x] Création répertoires `uploads/` au démarrage
- [x] Fix message chat pas reçu côté client (badge non-lu)
- [x] Fix double-clic annulation livreur (StatefulBuilder)
- [x] Fix MIME multipart upload photo produit
- [x] Modération boutiques côté admin (PENDING/APPROVED/REJECTED/SUSPENDED)
