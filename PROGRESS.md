# ZonZon — Journal de progression

> **RÈGLE ABSOLUE** : Toute instance de Claude Code travaillant sur ce projet **doit lire ce fichier + `TODO.md` au démarrage** et **les mettre à jour à chaque avancée importante** avant de terminer la session.
>
> - `PROGRESS.md` (ce fichier) = état du projet, URLs, commandes, historique des sessions
> - [`TODO.md`](TODO.md) = tableau des tâches façon Trello avec cases à cocher

---

## Contexte du projet

**ZonZon** est une application de livraison pour le Togo (signifie "mouvement" en langue locale).

### Stack technique
| Composant | Technologie |
|-----------|-------------|
| Backend | NestJS 11 + TypeORM + MySQL + Socket.IO + Firebase Admin |
| Admin | Angular 21 + Tailwind CSS |
| Mobile | Flutter (Android) |
| Base de données | TiDB Serverless (compatible MySQL) |
| Hébergement backend | Fly.io (Paris, CDG) |
| Hébergement admin | Cloudflare Pages |
| Notifications push | Firebase Cloud Messaging (FCM) |
| Routing/Distances | OpenRouteService (free tier, clé déjà configurée) |

---

## Analyse d'écart — Cahier des charges V1 (2026-07-05)

> Décision : architecture V1 **conservée** — Flutter (client/livreur/commerçant) + Angular (admin). Pas de réécriture PWA maintenant (le CDC demande une PWA ; écart assumé pour la V1). Backlog priorisé dans [`TODO.md`](TODO.md) (section « BACKLOG V1 »).
>
> **Mise à jour distribution (2026-07-10)** : Android = app Flutter native (APK) — **aucune PWA Android nécessaire**. iOS = **PWA à développer après la V1 Android** (contourne compte développeur Apple + macOS). Tarif tranché : **200 FCFA/km** (CDC source §4 mis à jour, config backend déjà alignée).

**Déjà couvert** : auth 4 rôles · livraison à la demande client→livreur (Type 2) · suivi GPS temps réel (Socket.IO + positions persistées + ETA + géofencing) · messagerie par livraison (client↔livreur) · 5 statuts de commande · notifications FCM · historique client/livreur · tarification à la distance · dashboards client/livreur/admin · véhicule moto/voiture/tricycle. Bonus au-delà du V1 : notation étoiles, favoris boutiques, catégories/produits, commissions/reports, audit log, soft-delete, CI/CD, Sentry.

**Manques V1 identifiés** (→ backlog priorisé) :
- **P1** : validation admin obligatoire des livreurs ; disponibilité livreur (disponible/indisponible) ; blocage des livreurs non validés/indisponibles (voir + accepter).
- **P2** : livraison commerçant→client (Type 1) — le commerçant ne peut aujourd'hui PAS créer de livraison (`POST /orders` réservé `@Roles(CLIENT)`, pas de champ commerçant/créateur sur `DeliveryOrder`) ; rattachement client par compte ou téléphone.
- **P3** : attribution manuelle d'un livreur ; relation livreur affilié à un commerçant ; tarif configurable **200 FCFA/km** (aujourd'hui `PRICE_PER_KM = 150` en dur) + ajustement manuel ; statuts de livraison étendus (arrivé retrait, colis récupéré, proche client, échoué) ; `paymentStatus` ; zones/quartiers de Lomé.
- Profil livreur incomplet vs CDC : manquent photo pièce d'identité et zone habituelle (à intégrer avec P1/P3).

**Contrainte de toutes les évolutions V1** : ne pas casser tracking GPS, Socket.IO, FCM, messagerie client↔livreur, admin dashboard.

---

## Infrastructure déployée

| Service | URL / Détail | Status |
|---------|-------------|--------|
| **Backend** | `https://zonzon-backend.fly.dev` | ⏸️ Suspendu (scale 0 depuis 2026-06-02 — réactiver avec `flyctl scale count 1 --app zonzon-backend`) |
| **Admin** | `https://zonzon-admin.pages.dev` | ✅ Live |
| **Base de données** | TiDB Serverless, cluster `zonzon-db`, AWS Frankfurt | ✅ Active |
| **Firebase** | Projet `zonzon-4eb31`, compte `koreinnovation28@gmail.com` | ✅ Configuré |
| **Fly.io** | App `zonzon-backend`, compte `koreinnovation28@gmail.com` | ✅ Actif |
| **Cloudflare** | Projet `zonzon-admin`, compte `koreinnovation28@gmail.com` | ✅ Actif |

### Comptes utilisés
- **Email principal projet** : `koreinnovation28@gmail.com`
- **Firebase** : `koreinnovation28@gmail.com`
- **Fly.io** : `koreinnovation28@gmail.com`
- **Cloudflare** : `koreinnovation28@gmail.com`
- **TiDB Cloud** : `koreinnovation28@gmail.com`

---

## Fichiers de configuration importants

### Backend (`/backend/`)
- `.env` — Variables d'environnement locales (DB locale, JWT, ORS key)
- `firebase-adminsdk.json` — Clé privée Firebase Admin SDK (NE PAS COMMITTER)
- `fly.toml` — Configuration Fly.io (min_machines_running=1 pour WebSocket)
- `Dockerfile` — Multi-stage build Node 20 Alpine

### Mobile (`/mobile_app/`)
- `lib/config/env.dart` — URL API (`defaultValue: 'https://zonzon-backend.fly.dev'`) + `apiPrefix = '/v1'` (préfixe HTTP, NON utilisé par les sockets ni les uploads)
- `android/app/google-services.json` — Config Firebase Android

### Admin (`/admin-dashboard/`)
- `src/environments/environment.prod.ts` — `apiUrl: 'https://zonzon-backend.fly.dev'` + `apiPrefix: '/v1'`
- `src/environments/environment.ts` — `apiUrl: 'http://localhost:3050'` + `apiPrefix: '/v1'`

---

## Variables d'environnement Fly.io (secrets)

Ces secrets sont configurés sur Fly.io via `flyctl secrets set` :

```
NODE_ENV=production
PORT=3050
DB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=4EN5bTCQp8Z1WTX.root
DB_PASSWORD=*** (confidentiel)
DB_DATABASE=zonzon_db
DB_SSL=true
JWT_SECRET=*** (confidentiel)
ORS_API_KEY=*** (confidentiel)
COMMISSION_RATE=0.35
UPLOAD_DIR=uploads
NOTIFY_RADIUS_KM=5
FRONTEND_URLS=https://zonzon-admin.pages.dev
FRONTEND_URL_PATTERNS=^https://[a-z0-9-]+\.zonzon-admin\.pages\.dev$  (optionnel, regex pour previews Cloudflare)
FIREBASE_CREDENTIALS_JSON=*** (contenu du fichier firebase-adminsdk.json)
```

---

## Commandes essentielles

### Builder l'APK de production
```powershell
cd C:\laragon\www\ZonZon\mobile_app
flutter build apk --release `
  --dart-define=API_URL=https://zonzon-backend.fly.dev `
  "--dart-define=SENTRY_DSN=https://5b733a06f8e026418f487fe2335679b3@o4511315040337920.ingest.de.sentry.io/4511324268724304"
# APK généré : build\app\outputs\flutter-apk\app-release.apk (≈58 MB)
```
> **Note** : `env.dart` pointe par défaut sur `https://zonzon-backend.fly.dev`. `--dart-define=API_URL` est optionnel. `--dart-define=SENTRY_DSN` active le reporting d'erreurs Sentry (recommandé en prod).

### Builder l'APK pour tests locaux
```powershell
flutter build apk --release --dart-define=API_URL=http://<TON_IP_LOCAL>:3050
```

### Déployer le backend
```powershell
cd C:\laragon\www\ZonZon\backend
flyctl deploy --app zonzon-backend
```

### Déployer l'admin
```powershell
cd C:\laragon\www\ZonZon\admin-dashboard
npm run build -- --configuration production
npx wrangler pages deploy dist/admin-dashboard/browser --project-name zonzon-admin
```

### Lancer en local (dev)
```powershell
# Backend
cd C:\laragon\www\ZonZon\backend && npm run start:dev

# Flutter sur émulateur
flutter run -d emulator-5554 --dart-define=API_URL=http://10.0.2.2:3050

# Flutter sur téléphone physique
flutter run -d <DEVICE_ID> --dart-define=API_URL=http://<TON_IP>:3050
```

### Voir les logs du backend en prod
```powershell
flyctl logs --app zonzon-backend --no-tail
```

---

## Rôles utilisateurs

| Rôle | Valeur en DB | Description |
|------|-------------|-------------|
| Client | `CLIENT` | Passe des commandes de livraison |
| Livreur | `LIVREUR` | Accepte et effectue les livraisons |
| Commerçant | `COMMERCANT` | Gère une boutique |
| Admin | `ADMIN` | Accès complet via admin-dashboard |

---

## Architecture mobile (Flutter)

| Écran | Fichier | Rôle |
|-------|---------|------|
| Login | `lib/screens/login_screen.dart` | Connexion |
| Register | `lib/screens/register_screen.dart` | Inscription |
| Home (client) | `lib/home_screen.dart` | Écran principal client |
| Order | `lib/order_screen.dart` | Suivi de commande client |
| Driver | `lib/driver_screen.dart` | Radar + profil livreur (bottom nav) |
| Driver Profile | `lib/screens/driver_profile_screen.dart` | Profil, véhicule, stats livreur |
| Merchant Home | `lib/screens/merchant_home_screen.dart` | Tableau de bord commerçant |
| Rating | `lib/screens/rating_screen.dart` | Notation post-livraison |

---

## Endpoints backend principaux

> **⚠️ Versioning** : depuis la session "Versioning API /v1" (2026-05-01), toutes les routes HTTP sont préfixées par `/v1` (ex: `https://zonzon-backend.fly.dev/v1/auth/login`). Exceptions : la racine `/` (health check, non préfixée) et les fichiers statiques `/uploads/*` (servis par `ServeStaticModule`, non préfixés). Les WebSockets Socket.IO (namespace `/orders`) restent à la racine `wss://zonzon-backend.fly.dev` — ils ont leur propre système de routing indépendant des controllers Nest. Les routes du tableau ci-dessous sont listées sans le préfixe pour rester lisibles.

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/auth/register` | Inscription |
| POST | `/auth/login` | Connexion |
| GET | `/auth/me` | Infos utilisateur connecté |
| PATCH | `/users/me` | Modifier prénom/nom ✅ (ajouté) |
| POST | `/users/me/photo` | Upload photo de profil |
| GET | `/vehicles/me` | Infos véhicule livreur |
| PUT | `/vehicles/me` | Modifier/créer véhicule |
| POST | `/orders` | Créer une commande |
| POST | `/orders/estimate` | Estimer le prix d'une livraison |
| GET | `/orders/mine` | Mes commandes |
| POST | `/orders/:id/accept` | Accepter une course (livreur) |
| PATCH | `/orders/:id/status` | Changer statut commande |
| GET | `/users/:id/ratings/stats` | Stats de notation d'un utilisateur |

---

## WebSocket (Socket.IO)

- **Namespace** : `/orders`
- **Événements livreur** : `driver:location` (position GPS temps réel)
- **Événements chat** : `chat:join`, `chat:leave`, `chat:typing`
- **Fly.io** : configuré avec `min_machines_running=1` et `auto_stop_machines='off'` pour garder les WebSockets persistants

---

## Points d'attention / Limitations connues

| Problème | Statut | Solution |
|----------|--------|---------|
| Photos uploads éphémères sur Fly.io | ⚠️ À corriger | Ajouter un volume Fly ou migrer vers Cloudflare R2 / Supabase Storage |
| Mode développeur Windows requis pour Flutter | ✅ Activé | Paramètres → Pour les développeurs |
| Windows Defender bloque le build Flutter | ✅ Résolu | Dossiers `build/` et `.gradle` exclus |
| APK buildé sans `--dart-define` → URL localhost | ✅ Corrigé | `env.dart` pointe maintenant sur prod par défaut |

---

## Flutter Skills installés

Installés dans `.agents/skills/` via `npx skills add flutter/skills --skill '*' --agent universal --yes`

| Skill | Priorité | Usage |
|-------|----------|-------|
| `flutter-apply-architecture-best-practices` | 🔴 Critique | Refactoriser en couches UI → ViewModel → Repository |
| `flutter-setup-declarative-routing` | 🔴 Critique | Remplacer navigation manuelle par go_router |
| `flutter-implement-json-serialization` | 🔴 Critique | Générer fromJson/toJson automatiquement |
| `flutter-fix-layout-issues` | 🟡 Utile | Corriger overflows et unbounded constraints |
| `flutter-build-responsive-layout` | 🟡 Utile | Adapter UI aux différentes tailles d'écran |
| `flutter-add-widget-test` | 🟡 Utile | Tests unitaires des composants UI |
| `flutter-add-integration-test` | 🟢 Plus tard | Tests de flux complets |
| `flutter-setup-localization` | 🟢 Plus tard | i18n (app déjà en français) |
| `flutter-add-widget-preview` | 🟢 Plus tard | Prévisualisation de widgets |
| `flutter-use-http-package` | 🟢 Plus tard | Déjà utilisé dans le projet |

---

## Historique des sessions

### Session 38 (2026-07-10) — Revue robustesse mobile : 7 constats corrigés (session/push, paiement espèces, chat, FCM, routes)
- **P0 fuite inter-session + push après 401** : `AuthService.logout()` et `handleUnauthorized()` libèrent `ClientServices` (socket partagé + store des commandes actives) — un autre compte reconnecté dans le même processus ne revoit plus l'état du précédent. Sur 401, nouveau `PushService.invalidateLocalToken()` : `FirebaseMessaging.deleteToken()` local (le JWT mort interdit le nettoyage serveur) → les pushs de l'ancien compte n'atteignent plus l'appareil, resync complète au login suivant.
- **P0 paiement espèces client↔livreur** : le backend autorisait déjà client/livreur sur `PATCH /orders/:id/payment-status` mais AUCUNE UI ne l'appelait hors commerçant. Livreur : bouton « Paiement reçu (espèces) » dans le dialog de course active + prompt de confirmation au COMPLETED (→ `CASH_ON_DELIVERY`). Client : « J'ai payé en espèces » sous le badge paiement du suivi (→ `PAID`, avec confirmation). Propagation temps réel via `orderPaymentUpdated` (session 36).
- **P1 photo inscription livreur non contournable** : en cas d'échec de l'upload post-inscription, boucle bloquante (dialog non dismissible « Réessayer / Changer de photo ») au lieu du « continuer avec avertissement ».
- **P1 chat vivant** : `ChatService` expose `orderStatus$` (écoute `orderStatusUpdated` — le socket chat est dans la room `user:<id>`) ; `ChatScreen` remplace le statut figé passé en paramètre par un état vivant → bandeau « Conversation fermée » + disparition de la saisie dès la fin de course, sans rouvrir l'écran.
- **P2 FCM robuste** : `_syncedToken` n'est marqué synchronisé QUE sur réponse 2xx ; sinon retry unique différé (45 s) conditionné à l'existence d'une session. `onTokenRefresh` ne pré-renseigne plus `_syncedToken`.
- **P2 accusé de lecture honnête (groupe)** : `GET /orders/:id/messages` renvoie désormais `readBy: string[]` (jointure receipts). Mobile : `ChatMessage.readBy` + enrichissement live via `chat:read` (readerId) ; destinataires connus via `GET /orders/:id/conversation` (+ lecteurs observés). Indicateur : `done` = envoyé, `done_all` estompé = lu par une partie, `done_all` plein = lu par tous les destinataires connus ; fallback ancienne sémantique si participants inconnus.
- **P2 durcissement routes/socket** : redirect par rôle sur les routes plates (`/shops`, `/favorites` → CLIENT ; `/driver/profile` → LIVREUR ; `/history` → CLIENT+LIVREUR ; `/notifications` multi-rôles). `OrderSocketController._disposed` : un `init()` lancé sans await (écrans commerçant) ne crée plus de socket orphelin si le dispose est passé entre-temps.
- **Fichiers touchés** : backend `src/messages/messages.service.ts` (+spec) ; mobile `services/auth_service.dart`, `services/push_service.dart`, `services/chat_service.dart`, `controllers/order_socket_controller.dart`, `models/message.dart`, `screens/chat_screen.dart`, `screens/register_screen.dart`, `screens/order_tracking_screen.dart`, `widgets/order_screen_widgets.dart`, `driver_screen.dart`, `router/app_router.dart`.
- **Vérifications** : backend build OK, jest **355/355** (+2), e2e **56/56** ; mobile `flutter analyze` 10 alertes préexistantes (0 nouvelle), `flutter test` **11/11**.

### Session 37 (2026-07-10) — Clôture des derniers écarts CDC : photo inscription livreur, tarif 200, décision PWA iOS
- **Photo de profil obligatoire à l'inscription livreur (CDC §2)** : `RegisterScreen` affiche pour le rôle LIVREUR un sélecteur de photo (aperçu circulaire, `image_picker`) ; le submit est bloqué tant qu'aucune photo n'est choisie ; après `POST /auth/register`, la photo est envoyée sur `POST /users/me/photo` avec le token fraîchement persisté. Si l'upload échoue (réseau), le compte reste créé et un message invite à compléter la photo depuis le profil (non bloquant).
- **Tarif tranché : 200 FCFA/km conservé** (décision PO du 2026-07-10). Le CDC source (§4 Grille tarifaire) est mis à jour avec une note de décision ; aucun changement de code nécessaire (`PricingConfig` défaut 200, fallback `PRICE_PER_KM = 200`, tarif ajustable par l'admin + overrides par zone).
- **Décision distribution / PWA** documentée (CDC §5, TODO, ce fichier) : Android = app Flutter native (APK), qui couvre tout le CDC — pas de PWA Android ; iOS = PWA à développer après la V1 Android (évite compte développeur Apple + macOS). Item backlog ajouté dans `TODO.md`.
- **Fichiers touchés** : `mobile_app/lib/screens/register_screen.dart`, `Cahier des Charges - App de Livraison Togo (Kaled).md`, `TODO.md`, `PROGRESS.md`.
- **Vérifications** : `flutter analyze --no-pub lib` → 10 alertes préexistantes, 0 nouvelle ; `flutter test` → 11/11 OK.
- **Conclusion de cette session** : les écarts alors connus étaient marqués clos. Cette conclusion est invalidée par la revue indépendante de la Session 38, qui a identifié des cas d'échec et de cycle de session non couverts.

### Session 38 (2026-07-10) — Revue indépendante mobile vs CDC après les correctifs
- **Verdict : FAIL / pas prêt pour un PASS CDC complet.** Les correctifs annoncés côté commerçant sont bien présents : statut d'affiliation réel, accept/refus livreur, recherche client, prix manuel, statuts/paiement commerçant, profil commerçant, conversation du commerçant et statistiques. Le tarif 200 FCFA/km, le GPS limité à la course active et la visibilité du paiement client sont aussi cohérents avec le CDC.
- **P0 confirmés** :
  - `AuthService.handleUnauthorized()` efface seulement les credentials. Le registre statique `ClientServices` (socket + `ActiveOrdersStore`) n'est réinitialisé que par le logout volontaire du profil client. Après un 401 puis une connexion client dans le même processus, le nouveau client peut réutiliser le socket et les commandes actives du précédent. Le token FCM n'est pas non plus supprimé localement lors de ce logout forcé.
  - Les commandes Type 2 sont créées avec `paymentStatus=UNPAID` et le backend ne fait aucune transition automatique à la fin de course. Dans le mobile, seul `MerchantOrdersService` appelle `PATCH /orders/:id/payment-status` : ni le client ni le livreur ne peut confirmer le paiement espèces.
- **P1 confirmés** :
  - La photo du livreur n'est obligatoire que dans le sélecteur local. `RegisterScreen` crée/persiste le compte avant l'upload et continue explicitement en cas d'échec de la photo ; cela ne respecte pas le prérequis CDC de photo à l'inscription.
  - `ChatScreen` garde un `orderStatus` figé. Côté client/commerçant, un statut terminal reçu pendant le chat ne ferme pas le composer ; le backend refuse alors le message et le mobile l'affiche seulement comme échec. Le livreur possède déjà une fermeture spécifique de son dialog/chat.
- **P2 confirmés** : `_syncedToken` FCM est renseigné même après un échec réseau/HTTP sans retry dans le processus ; le double-check du chat multi-participants signifie seulement « lu par au moins un destinataire » ; les routes plates ne sont pas filtrées par rôle ; un `OrderSocketController.init()` en vol peut aboutir après son `dispose()`.
- **Vérifications exécutées** : `flutter analyze --no-pub` => 10 avertissements préexistants, aucune erreur ; `flutter test --no-pub` => 11/11 ; `npm test -- --runInBand orders.service.spec.ts messages.service.spec.ts merchant-drivers.service.spec.ts` => 163/163. `flutter build apk --debug --no-pub` n'a pas abouti avant le timeout local de 5 minutes et aucun appareil Android n'était connecté (Windows/Chrome/Edge seulement).
- **Fichiers de suivi modifiés** : `TODO.md`, `PROGRESS.md`. Aucun code applicatif n'a été modifié durant cette revue.

### Session 36 (2026-07-10) — Correction des 8 findings de la revue Session 35 (P0/P1/P2)
- **Les 7 findings + les fixtures e2e sont corrigés.** Détail :
  - **P0 restauration course livreur** : `DriverScreen._restoreActiveOrder()` lit `/orders/mine` au boot (compte validé), détecte la course active la plus récente (ACCEPTED→NEAR_CLIENT) et rouvre le dialog de progression complet (`_showActiveOrderDialog`, ex-`_showSuccessDialog`, titre « Course en cours » en mode restauration). Géofencing réarmé si la course est encore ACCEPTED.
  - **P0 annulation distante** : `statusUpdates$` désormais écouté côté livreur (le backend n'émet `orderStatusUpdated` qu'aux parties de la course). Statut terminal distant → fermeture du dialog non-dismissible (avec `popUntil` pour dépiler un chat ouvert au-dessus), snackbar via `_messengerKey`, arrêt géofence/GPS ; statut non terminal → synchro `dialogStatus`. Garde `dialogClosed` contre la double fermeture (transition locale + écho socket).
  - **P0 atomicité une-course-active** : `acceptOrder` exécute re-contrôle « course active » + UPDATE atomique dans `ordersRepository.manager.transaction` avec verrou pessimiste (`findOne(User, { lock: pessimistic_write })`) sur la ligne du livreur — deux accepts simultanés du même livreur sur deux commandes distinctes sont sérialisés, le second reçoit `ConflictException`. Le contrôle hors transaction est conservé comme fast-path. Tests : race simulée (re-contrôle sous verrou) + vérification de la prise du verrou ; mocks unitaires et in-memory e2e câblés avec un `manager.transaction` passthrough.
  - **P1 normalisation téléphone** : `searchClients` utilise `replace(/[^0-9]/g, '')` (le `RegExp('[^0-9]')` sans flag ne retirait que le premier séparateur).
  - **P1 diffusion paiement** : nouvel event `orderPaymentUpdated` (gateway `broadcastPaymentUpdate` appelé par `updatePaymentStatus` → client/livreur/commerçant). Mobile : stream `paymentUpdates$` dans `OrderSocketController`, consommé par `order_tracking_screen` (client), le dialog livreur (badge paiement live) et `merchant_orders_screen` (liste + détail).
  - **P1 lecture chat par participant** : nouvelle entité/table `message_read_receipts` (PK `messageId`+`userId`, FKs CASCADE, migration `1780000000000` avec backfill client+livreur des messages déjà lus). `markAsRead` insère des receipts pour CE participant (INSERT … orIgnore) et `unreadCountForUser` compte via la jointure receipts — la lecture par un participant ne consomme plus le non-lu des autres. `Message.readAt` conservé (sémantique « lu par au moins un destinataire », rétro-compat coche « lu » mobile), `broadcastChatRead` inchangé.
  - **P2 GPS strict mobile** : le tracking (position stream + heartbeat 90 s) ne démarre plus à la connexion socket mais à l'ouverture du dialog de course active (accept ou restauration) et s'arrête à sa fermeture (`_stopLocationUpdates`). À la reconnexion socket, le GPS n'est relancé que si une course est active.
  - **P2 fixtures e2e** : le repo in-memory `usersRepo` applique le défaut DB `User.status=ACTIVE` au save (comme la colonne MySQL) → attribution manuelle réparée.
- **Fichiers touchés** :
  - backend : `src/orders/orders.service.ts` (transaction accept + broadcast paiement), `src/orders/orders.gateway.ts` (`broadcastPaymentUpdate`), `src/users/users.service.ts` (regex), `src/messages/messages.service.ts` (receipts), `src/entities/message-read-receipt.entity.ts` (nouveau), `src/entities/message.entity.ts` (doc readAt), `src/migrations/1780000000000-AddMessageReadReceipts.ts` (nouveau), `src/app.module.ts`, `src/messages/messages.module.ts`, specs orders/gateway/messages, `test/test-helpers.ts`
  - mobile : `lib/driver_screen.dart` (restauration, statuts distants, cycle de vie GPS, paiement live), `lib/controllers/order_socket_controller.dart` (`paymentUpdates$`), `lib/screens/order_tracking_screen.dart`, `lib/screens/merchant/merchant_orders_screen.dart`
- **Vérifications exécutées** :
  - backend : `npm run build` → **OK** ; `npx jest` → **353/353 OK (19 suites)** (343 → 353, +10) ; `npm run test:e2e` → **56/56 OK** (54 → 56)
  - mobile : `flutter analyze --no-pub lib` → **10 alertes préexistantes, 0 nouvelle** ; `flutter test` → **11/11 OK**
- **Notes migration/prod** : la migration `1780000000000` tourne automatiquement au déploiement (`migrationsRun` en prod). Le verrou pessimiste s'appuie sur le mode transactionnel pessimiste (défaut TiDB) — pas de changement de config requis.
- **Résiduel** : items « CDC source — inscription livreur » et « Décision PO — tarif » toujours ouverts (arbitrage produit) ; tests widget/intégration Flutter dédiés aux nouveaux flux toujours manquants (item `[~]` existant).

### Session 35 (2026-07-10) — Revue de conformité mobile/backend après correctifs
- **Verdict : FAIL ciblé / non prêt pour un PASS CDC complet**. Les correctifs commerçant et transverses de la session 34 sont réellement présents et les contrats mobile/backend sont cohérents, mais la revue fraîche a identifié des risques résiduels importants sur la reprise de course livreur et la concurrence.
- **Conforme vérifié** : affiliation avec statut PENDING/ACTIVE/REJECTED et accept/refus mobile ; conversation commerçant branchée ; prix manuel + raison ; client existant par recherche ; zones envoyées à l'estimation/création ; statuts/paiement affichés ; profil et stats commerçant ; gains livreur ; tracking GPS/ETA commerçant ; session/FCM et navigation notification.
- **Findings nouveaux / résiduels** :
  - HIGH CONFIRMED : après redémarrage de l'app mobile pendant une course, le livreur ne recharge aucune course active (`DriverScreen` ne lit que `/orders/available`) et ne peut plus reprendre les actions de statut ; l'historique est en lecture seule ;
  - HIGH CONFIRMED : une annulation client d'une course ACCEPTED n'est pas consommée par `DriverScreen` (`statusUpdates$` non écouté) ; le dialog livreur est non dismissible et reste sur un statut obsolète ;
  - HIGH PROBABLE : la règle « une seule course active par livreur » fait un check puis un UPDATE sans transaction/verrou sur le livreur ; deux acceptations concurrentes de deux commandes distinctes peuvent toutes deux passer ;
  - MEDIUM CONFIRMED : `UsersService.searchClients` retire un seul séparateur du téléphone (`replace(RegExp('[^0-9]'), '')`) ; une recherche comme `+228 90-12.34` reste mal normalisée ;
  - MEDIUM CONFIRMED : le statut de paiement client/livreur n'est pas diffusé en temps réel ; l'écran de suivi client et le dialog livreur peuvent rester sur `UNPAID` jusqu'à réouverture/rechargement ;
  - MEDIUM CONFIRMED : `Message.readAt` reste global au message, donc en conversation à 3 un participant peut marquer le message lu pour tous ;
  - LOW CONFIRMED : le GPS mobile livreur démarre dès la connexion socket, même sans course active ; le backend ignore ces positions, mais batterie et permission sont consommées inutilement ;
  - conformité source toujours ouverte : photo de profil obligatoire à l'inscription livreur absente ; tarif source 150 FCFA/km différent de la configuration V1 à 200 ; commissions hebdomadaires filtrées par `createdAt` au lieu de `completedAt` (`TO_VALIDATE`).
- **Vérifications exécutées** :
  - backend unitaires : `npm test -- --runInBand` → **343/343 OK (19 suites)** ;
  - backend build : `npm run build` → **OK** ;
  - backend e2e : `npm run test:e2e -- --runInBand` → **54/56 OK** ; 2 échecs de fixture sur l'attribution manuelle, car le repo in-memory n'applique pas le défaut DB `User.status=ACTIVE` attendu par le nouveau contrôle ;
  - mobile : `flutter test` → **11/11 OK** ; `flutter analyze --no-pub lib` → **10 alertes préexistantes, 0 erreur** ;
  - aucun device Android connecté : tests d'intégration Flutter non exécutés.

### Session 34 (2026-07-10) — Correctifs finaux mobile/backend après revue CDC
- **Verdict : PASS sur les manques bloquants et majeurs identifiés dans la revue mobile**. Les flux commerçant et transverses signalés la veille ont été corrigés et revalidés.
- **Correctifs livrés** :
  - session mobile/401 : `GoRouter.refreshListenable` branché sur `AuthService.sessionListenable`, donc retour immédiat au login après expiration/logout ;
  - FCM : `PushService` supprime uniquement le token du device courant (`previousToken`) et resynchronise correctement après logout/login dans le même processus ;
  - commerçant : recherche/sélection d’un client existant (`GET /orders/merchant-clients/search`), saisie téléphone via `PhoneField`, prix manuel envoyé à la création, zones pickup/destination envoyées au backend, et sélection de livreur filtrée (actif/disponible/non occupé) ;
  - backend commande : `assignPreferredLivreur` vérifie le propriétaire commerçant (ou admin), `computeEta` autorise le commerçant créateur, et le gateway réhydrate la course active d’un livreur après redémarrage avant de forwarder/persister sa position ;
  - détail commerçant : carte de trajet, position live livreur, ETA et conversation multi-participants désormais exploitables depuis l’app ;
  - chat : `FAILED` ferme aussi la conversation côté mobile/backend, `chat:typing` est protégé par contrôle d’appartenance ;
  - paiements/statuts : mapping centralisé `OrderStatusUtils`/`PaymentStatusUtils` réutilisé côté commerçant/client avec statuts étendus et visibilité paiement.
- **Fichiers majeurs touchés** :
  - backend : `src/orders/orders.service.ts`, `orders.controller.ts`, `orders.gateway.ts`, `src/users/users.service.ts`, `src/messages/messages.service.ts`, `src/orders/dto/search-merchant-clients-query.dto.ts`
  - mobile : `lib/router/app_router.dart`, `lib/services/push_service.dart`, `lib/services/merchant_orders_service.dart`, `lib/services/zones_service.dart`, `lib/screens/client/home_tab.dart`, `lib/screens/merchant/create_delivery_screen.dart`, `lib/screens/merchant/merchant_orders_screen.dart`, `lib/screens/chat_screen.dart`
- **Vérifications exécutées** :
  - backend ciblé : `npm test -- --runInBand src/orders/orders.gateway.spec.ts src/orders/orders.service.spec.ts src/messages/messages.service.spec.ts` → **171/171 OK**
  - backend build : `npm run build` → **OK**
  - mobile : `flutter test` → **11/11 OK**
  - mobile : `flutter analyze --no-pub lib` → **10 alertes préexistantes/non bloquantes, 0 erreur**
- **Résiduel non bloquant** :
  - il manque encore des tests widget/intégration Flutter dédiés pour couvrir les nouveaux flux commerçant/affiliation/notif tap/conversation ;
  - la contradiction documentaire sur le tarif source (150) vs décision backlog/config (200 FCFA/km) reste à arbitrer côté PO, mais l’implémentation mobile/backend est cohérente entre elles.

### Session 33 (2026-07-09) — Revue mobile complète vs CDC après correctifs
- **Verdict : FAIL / non prêt pour validation finale**, malgré un cœur client/livreur solide et les correctifs commerçant désormais présents. Les flux conformes vérifiés incluent double géolocalisation, description colis, premier livreur atomique, statuts étendus, paiement visible, WhatsApp, affiliation invite/accept, profil commerçant, prix manuel, stats et chat commerçant.
- **Findings confirmés** :
  - session supprimée sur `401` mais `GoRouter` non rafraîchi ; l'utilisateur peut rester sur un écran protégé ;
  - logout FCM envoie `{token:null}` et supprime tous les devices, tandis que `PushService._initialized` empêche une resynchronisation fiable après logout/login dans le même processus ;
  - téléphone client commerçant non normalisé (`+228`) + aucun vrai sélecteur de compte : un client existant peut être traité comme invité ;
  - `available-drivers` ne filtre ni compte suspendu ni course active, ce qui permet de réserver une livraison à un livreur qui ne pourra pas l'accepter ;
  - suivi GPS/ETA commerçant absent du mobile et ETA backend non autorisé au commerçant ;
  - tarification par zone inactive dans les parcours mobile (`pickupZoneId`/`destinationZoneId` jamais envoyés) ;
  - mapping GPS `activeOrders` uniquement en mémoire : après restart/deploy backend, une course déjà active n'est plus reconnue par le gateway ;
  - chat multi-participants encore partiel (`FAILED` ne ferme pas l'envoi, typing sans authz, `readAt` global et non par participant) ;
  - inscription livreur sans photo de profil immédiate, contrairement au CDC source ; tarif source 150 FCFA/km contradictoire avec la décision V1 actuelle à 200 FCFA/km.
- **Qualité / vérifications exécutées** :
  - `flutter analyze --no-pub lib` : 10 alertes préexistantes/non bloquantes, aucune erreur ;
  - `flutter test` : 11/11 OK, mais aucune couverture des flux récents affiliation/notifs/commerçant/chat ;
  - `backend npm run build` : OK ;
  - `npm test -- --runInBand src/messages/messages.service.spec.ts src/orders/orders.service.spec.ts src/orders/orders.gateway.spec.ts` : 161/161 OK ;
  - `flutter build apk --release` : premier essai bloqué par un `GeneratedPluginRegistrant.java` ignoré et obsolète qui incluait `integration_test`; après `flutter clean`, suppression de l'artefact et régénération correcte, second essai sans erreur mais non terminé avant le timeout de 10 min. Validation APK release donc `TO_VALIDATE` sur cette machine.

### Session 32 (2026-07-09) — Durcissement mobile/session/notifs + cohérence chat multi-participants
- **Notifications push enfin opérationnelles de bout en bout** :
  - `mobile_app/lib/main.dart` écoute désormais l’état de session et appelle réellement `PushService.init()` après authentification ou restauration de session.
  - Nouveau `mobile_app/lib/services/notification_navigation_service.dart` : un tap sur notif FCM ou notif persistée redirige vers l’écran utile (`tracking` client, détail livraison commerçant, home livreur).
  - `mobile_app/lib/screens/notifications_screen.dart` n’est plus une liste morte : le tap marque lu puis ouvre le flux concerné.
  - `mobile_app/lib/screens/merchant/merchant_profile_screen.dart` expose maintenant un accès notifications (avec badge non-lu), ce qui manquait au rôle commerçant.
- **Session mobile plus robuste** :
  - `mobile_app/lib/services/api_client.dart` ajoute timeout HTTP global (15 s) et purge automatique de session sur `401`.
  - `mobile_app/lib/services/auth_service.dart` publie désormais les changements de session (`ValueNotifier`) pour que le routeur/app réagisse immédiatement à un JWT expiré/révoqué.
  - `mobile_app/lib/router/app_router.dart` refuse en plus les deeplinks de rôle incohérents (client → espace commerçant, etc.).
- **Commerçant et client remis en cohérence métier** :
  - `mobile_app/lib/screens/merchant/merchant_orders_screen.dart` supporte un `orderId` initial (deep link notif), écoute le socket pour refresh live, et permet enfin d’ajuster **paiement** et **prix** depuis le détail d’une livraison.
  - `mobile_app/lib/screens/merchant/create_delivery_screen.dart` accepte maintenant aussi un **`clientId` existant** en plus du téléphone, conformément au backend `POST /orders/merchant`.
  - `mobile_app/lib/screens/merchant_home_screen.dart` recharge aussi ses stats/listes sur `orderAccepted` / `orderStatusUpdated`.
  - `mobile_app/lib/services/active_orders_store.dart` retire maintenant correctement les courses `FAILED` de la liste active client.
  - `mobile_app/lib/screens/order_tracking_screen.dart` + `backend/src/orders/orders.service.ts` gardent l’ETA actif sur les statuts étendus (`EN_ROUTE_PICKUP`, `AT_PICKUP`, `NEAR_CLIENT`) au lieu de tomber silencieusement en “plus d’ETA”.
  - `mobile_app/lib/utils/order_status_utils.dart` couvre désormais aussi `CASH_ON_DELIVERY` et `REFUNDED`.
- **Chat multi-participants moins trompeur côté backend** :
  - `backend/src/messages/messages.service.ts` et `backend/src/orders/orders.gateway.ts` notifient maintenant **tous** les participants actifs/autres parties d’une conversation, pas uniquement le binôme client↔livreur.
  - Les read receipts sont aussi rediffusés à tous les destinataires concernés.
  - `backend/src/messages/messages.service.spec.ts` mis à jour pour couvrir ce contrat.
- **Vérifications** :
  - `flutter analyze --no-pub` : toujours 10 warnings/infos préexistants, aucune nouvelle erreur.
  - `flutter test` : **11/11** OK.
  - `backend` : `npm run build` OK ; `npm test -- --runInBand src/messages/messages.service.spec.ts` OK.

### Session 31 (2026-07-09) — Mobile commerçant/livreur/client : correctifs post-P3/post-V1
- **Affiliations commerçant/livreur enfin cohérentes** :
  - `mobile_app/lib/services/merchant_drivers_service.dart` parse désormais `status` sur les affiliations commerçant (`PENDING/ACTIVE/REJECTED/REMOVED`) et expose aussi le flux livreur `GET/PATCH /drivers/me/affiliations`.
  - `mobile_app/lib/screens/merchant/merchant_drivers_screen.dart` n’annonce plus un faux succès : une invitation `PENDING` affiche maintenant « invitation envoyée » + badge de statut.
  - `mobile_app/lib/screens/driver_profile_screen.dart` affiche les invitations commerçants reçues avec **Accepter** / **Refuser** explicites ; le livreur peut donc enfin faire aboutir le flux backend d’affiliation depuis le mobile. Bonus : **gains estimés** ajoutés (somme des courses `COMPLETED`) dans les stats du profil livreur.
- **Commerçant : création/lecture des livraisons remise à niveau** :
  - `mobile_app/lib/services/merchant_orders_service.dart` + `lib/screens/merchant/create_delivery_screen.dart` envoient maintenant `priceFcfa` et `priceReason` (ajustement manuel du prix côté commerçant, avec traçabilité backend déjà en place).
  - `mobile_app/lib/screens/merchant/merchant_orders_screen.dart` a été réécrit : statuts étendus centralisés via `OrderStatusUtils`, badge `paymentStatus`, cartes détaillées, agrégats (**aujourd’hui / terminées / montant**), et détail de commande avec accès réel à la conversation.
  - `mobile_app/lib/screens/merchant_home_screen.dart` affiche ces stats agrégées dans les actions rapides.
- **Conversation multi-participants réellement branchée côté mobile** :
  - Nouveau `mobile_app/lib/services/conversation_service.dart` pour consommer `GET /orders/:id/conversation`, `POST /participants`, `DELETE /participants/me`.
  - Le détail d’une livraison commerçant permet maintenant de **rejoindre / quitter / ouvrir** la conversation de la commande ; les participants actifs sont listés.
  - `mobile_app/lib/screens/chat_screen.dart` affiche désormais le nom de l’expéditeur sur les bulles entrantes, ce qui évite l’ambiguïté quand plusieurs participants parlent dans la même conversation.
- **Visibilité paiement / profils** :
  - `mobile_app/lib/screens/order_tracking_screen.dart` + `lib/widgets/order_screen_widgets.dart` montrent désormais le **statut de paiement** côté client pendant le suivi.
  - `mobile_app/lib/screens/order_history_screen.dart` affiche le badge de paiement pour tous les rôles (plus seulement le livreur).
  - **Nouveau** `mobile_app/lib/screens/merchant/merchant_profile_screen.dart` + route `merchantProfile` dans `lib/router/app_router.dart` ; bouton profil ajouté dans `merchant_home_screen.dart`.
- **Vérifications** :
  - `flutter analyze` : **10 issues**, niveau revenu aux alertes non bloquantes/préexistantes.
  - `flutter test test/` : **11/11** ✅.
- **Reste découvert / non traité dans cette session** :
  - pas encore de recherche/sélection d’un client existant par ID côté création commerçant ;
  - pas encore de notification in-app dédiée à la validation/refus admin d’un livreur ;
  - optimisation batterie GPS livreur non retouchée (le backend filtre déjà hors course active).

### Session 30 (2026-07-08) — Direction A « Évolution » (design, vague 1+2) + APK
- Suite au choix de la **Direction A** (thème sombre conservé mais élevé — cf. proposition design). Deux agents lancés (Flutter/Angular) coupés par une limite de session → volet Flutter terminé à la main, volet Angular conservé (avait abouti).
- **Design tokens partagés** : `mobile_app/lib/theme/app_colors.dart` (`AppColors`) ↔ `admin-dashboard/src/styles.css` (`--zz-*`). Palette évoluée : bg `#0C1A22`, card `#122530`, line `#24404C`, go `#0FB271`, mango `#FF9E1B`, sky `#2E90FA`, coral `#F0453D`, textHi `#EAF2F0`, textMut `#8FA6AE`.
- **Re-skin Flutter (1:1)** : remap mécanique de 8 hexs de marque sur tout `lib/` (399 occ.) — `0F172A→0C1A22`, `1E293B→122530`, `10B981→0FB271`, `F59E0B→FF9E1B`, `0EA5E9/3B82F6→2E90FA`, `EF4444→F0453D`, `334155→22414D`. 0 ancienne valeur restante.
- **Composant signature** : `mobile_app/lib/widgets/status_timeline.dart` (`StatusTimeline`) — frise de progression (fait=vert / en cours=mangue / à venir=gris, terminal=corail), branchée sur `OrderStatusUtils`. Appliquée à l'écran de suivi client (`order_tracking_screen`, en tête du bottom sheet) et au dialog de course active livreur (`driver_screen`).
- **Angular** : `shared/status-colors.ts` (mapping unifié statut→variante `go/mango/sky/coral/mut`, partagé avec le mobile), tokens `--zz-*` dans `styles.css`, couleurs de marque nommées dans `tailwind.config.js`, badges de statut/paiement unifiés (archives, order-detail), fond d'app réchauffé.
- **Vérifs** : Flutter `analyze` 10 (préexistantes) / `test` 10/10 ; Admin `build --configuration production` OK. ⚠️ **Rendu visuel à confirmer sur device/navigateur** (non vérifiable ici).
- Reste vagues 3-4 (au besoin) : appliquer la nouvelle grammaire aux autres écrans une fois le rendu validé.

### Session 25 (2026-07-05) — Backend Priorité 3 complet (3 lots) + commits/push
- **Commits/push** : branche `feat/v1-priorities-1-2` poussée (audit + P1/P2). Nouvelle branche `feat/v1-priority-3` pour la P3.
- **Lot 1 — Tarif configurable + Zones** : entité `PricingConfig` (singleton, défaut **200 FCFA/km**, `minPriceFcfa` optionnel), `GET/PATCH /admin/pricing` (ADMIN), intégration dans `buildOrderPricing`/`estimateRoute` (cache 60s + fallback). Prix manuel commerçant (`priceFcfa?` sur create-merchant-order). Entité `Zone` + `GET /zones` (auth) + `POST/PATCH/DELETE /zones` (ADMIN) + seed des 16 quartiers de Lomé. Migrations 1778300000000, 1778400000000.
- **Lot 2 — Statuts étendus + paiement** : `OrderStatus` + `EN_ROUTE_PICKUP`/`AT_PICKUP`/`NEAR_CLIENT`/`FAILED` (rétro-compatible : `IN_PROGRESS` inchangé, chemin géofencing préservé). `ALLOWED_TRANSITIONS` étendue, `LIVREUR_ONLY_STATUSES`, messages FCM par statut. `PaymentStatus` (5 valeurs) + `PATCH /orders/:id/payment-status`. Migrations 1778500000000, 1778600000000.
- **Lot 3 — Attribution manuelle + livreurs affiliés** : entité `MerchantDriver` (M:N) + `GET/POST/DELETE /merchants/me/drivers` (COMMERCANT). `preferredLivreur` sur `DeliveryOrder` : `createOrder`/`createMerchantOrder` acceptent `preferredLivreurId` → réservation + broadcast ciblé (`dispatchNewOrder`) + FCM au livreur choisi. `findAvailable` exclut les courses réservées à un autre livreur ; `acceptOrder` refuse un non-preferred. `GET /orders/available-drivers` (affiliés en tête, tri distance) + `PATCH /orders/:id/assign`. Migrations 1778700000000, 1778800000000.
- **Vérifs** : après chaque lot, `npm run build` OK + `npx jest` vert (168 → 191 → **214/214**, 14 suites). Non-régression complète. 3 commits sur `feat/v1-priority-3`.
- **Fronts P3 (terminés)** :
  - **Admin** : écrans `/pricing` (édition tarif/km + prix min) et `/zones` (CRUD quartiers), liens sidebar (icônes `banknote`/`map-pin`) ; Archives affichent les statuts étendus (libellés FR) + colonne Paiement. Build prod OK.
  - **Mobile livreur** : `lib/utils/order_status_utils.dart` (libellés/couleurs FR de tous les statuts + paiement), boutons d'avancement dans le dialog de course active (`ACCEPTED → EN_ROUTE_PICKUP → AT_PICKUP → IN_PROGRESS → NEAR_CLIENT → COMPLETED`, + Échec/Annuler), coexistant avec le géofencing (inchangé) ; badge paiement. Modèle `order_history_item` : `paymentStatus`, `isFinished` inclut FAILED.
  - **Mobile commerçant** : `merchant_drivers_service`, `driver_picker_sheet` (choix d'un livreur disponible — affiliés en tête — à la création, transmis en `preferredLivreurId`), écran « Mes livreurs » (affiliation par téléphone). Routes go_router ajoutées.
  - Vérifs : admin build prod OK ; mobile `flutter analyze` 10 (préexistantes) / `flutter test` 10/10.
- **Priorité 3 : COMPLÈTE** (backend + tous les fronts). Reste hors-V1 : fallback auto livreur public si affiliés indisponibles (attribution auto avancée), tarification géographique par zone.

### Session 29 (2026-07-07) — Reste hors-V1 (affiliation, notifs, tarif zone, conversations) + APK
- **APK release** construit : `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (57.3 MB).
- **Déploiement backend/admin bloqué ici** : `flyctl` non authentifié + `wrangler` absent (auth OAuth interactive impossible en session non-interactive). Commandes fournies au user (backend d'abord → migrations auto, puis admin, puis APK). ⚠️ **17 migrations** (`1778100000000`→`1779900000000`) s'appliqueront au `flyctl deploy` — recommandé : backup TiDB avant.
- **Affiliation invite/accept** (§9.2) : `MerchantDriver.status` (PENDING/ACTIVE/REJECTED/REMOVED, soft-remove), invitation en PENDING, `GET/PATCH /drivers/me/affiliations` (accept/reject). `isAffiliated`=ACTIVE only. Migration `1779800000000`.
- **Notifs validation/refus livreur** (§14.1) : `setDriverApproval` notifie le livreur (cycle DI résolu via `forwardRef` + `@Optional`).
- **Tarif effectif par zone** (§7.3) : `buildOrderPricing` applique `pickupZone.basePrice` + `pricePerKmOverride` si définis, fallback global sinon.
- **Conversation multi-participants** (§13/§18.9-18.11, additif) : entités `Conversation`/`ConversationParticipant`, hook fire-and-forget au message (peuple la conversation sans toucher au flux d'envoi), `GET/POST/DELETE /orders/:id/conversation/...` (commerçant s'ajoute, admin litige). Migration `1779900000000`. Fix : le endpoint HTTP des messages autorise désormais aussi le **commerçant créateur** (cohérence avec la room chat). Le chat par room existant reste intact.
- **Vérifs finales indépendantes** : backend build + jest **333/333** (17→19 suites) + e2e **56/56**. Commits `1c518de` (affiliation/notifs/tarif) + final (conversations).
- **Bilan** : CDC V1 (P0/P1/P2) + les 4 items « après V1 » listés = **tous implémentés backend**. Restent : UI fronts pour ces derniers (affiliation invite/accept, participants conversation) et le déploiement prod (auth requise côté user).

### Session 28 (2026-07-07) — CDC V1 : P0 restant + P1 + P2 complets (backend + fronts)
- Suite de la Session 27 (audit `AUDIT_CDC_ZONZON_V1.md`). Orchestration en rounds séquentiels sous supervision (agents sonnet, périmètres disjoints, vérif + commit + push après chaque round).
- **Round A** — P0 fronts (admin suspension/réactivation dans `/users` ; mobile message « compte suspendu » au login) + **P1 backend** : `DeliveryStatusHistory` (`GET /orders/:id/history`), traçabilité prix (`estimatedPrice`/`priceWasManuallyAdjusted`/`price_changes`/`PATCH /orders/:id/price`), historique paiement (`payment_status_history`/`GET /orders/:id/payment-history`, enum + `CASH_ON_DELIVERY`/`REFUNDED`). Migrations `1779100000000`→`1779300000000`. jest **261/261**, e2e **49/49**. Commit `7b7ab6a`.
- **Round B1** — P2 : **Signalements** (`Signalement`, `POST/GET/PATCH /signalements`, migration `1779400000000`) + **Notifications persistées** (`notifications`, `GET /notifications`+read/read-all, persistance dans `sendToUser`, migration `1779500000000`). jest **274/274**, e2e **49/49**. Commit `ea774c1`.
- **Round B2** — P2 cœur : **zones enrichies** (`description`/`basePrice`/`pricePerKmOverride` + `pickupZone`/`destinationZone` sur la livraison + 6 quartiers) ; **livreur privé/public** (`User.isPublic`, exclu du broadcast si privé, `PATCH /users/me/visibility`) ; **GPS strict** (position ignorée hors course active, diffusée au client ET au commerçant) ; **commerçant dans le chat** (`isUserPartyToOrder`). Migrations `1779600000000`/`1779700000000`. jest **296/296**, e2e **56/56**. Commit `b520a23`.
- **Round C** — fronts P2 : **admin** écran `/signalements` + zones enrichies ; **mobile** toggle visibilité livreur, bouton « Signaler un problème » (tracking), écran + service notifications in-app.
- **Vérifs finales indépendantes** : backend build + jest **296/296** + e2e **56/56** ; admin build prod OK ; mobile analyze 10 (préexistantes) / test 10/10.
- **Bilan CDC V1** : P0/P1/P2 **complets** (backend + fronts). Restes explicitement hors-V1 (cf. `TODO.md`) : conversation multi-participants avec entités dédiées, flux d'affiliation invite/accept, tarification géographique effective par zone.

### Session 27 (2026-07-07) — Audit CDC V1 complet + Round P0 (suspension, course active, tests e2e, admin)
- **Audit** : `AUDIT_CDC_ZONZON_V1.md` créé (comparaison du CDC fonctionnel V1 détaillé avec l'existant, conformité ~68%). Écarts P0 (suspension compte, règle course active), P1 (historisation statuts/prix/paiement), P2 (signalements, conversation multi-participants, GPS strict, zones enrichies) au format §19.
- **Backend P0** (agent sonnet) : `User.status` (`ACTIVE`/`SUSPENDED`, migration `1779000000000`, grandfather ACTIVE) ; `PATCH /users/:id/suspend`+`/reactivate` (ADMIN, audit `USER_SUSPEND`/`USER_REACTIVATE`) ; blocage à la connexion + `createOrder`/`createMerchantOrder`/`acceptOrder`. Règle « une seule course active » dans `acceptOrder` (`ConflictException` si course `ACCEPTED…NEAR_CLIENT`). `jest` **232/232** (+11).
- **Tests e2e** (agent sonnet) : infra e2e hermétique (repos in-memory, sans DB) réparée + 25 scénarios §21.4 (`driver-validation`/`permissions`/`ownership` + `test-helpers.ts`). `TEST_PLAN_ZONZON_V1.md` créé. `app.e2e-spec` rendu hermétique. `npm run test:e2e` **37/37** (5 suites).
- **Admin** (agent sonnet) : détail livraison enrichi — édition `paymentStatus` + réassignation livreur (`available-drivers`). Build prod OK.
- **Supervision** : 3 agents sur périmètres disjoints (`backend/src`, `backend/test`, `admin-dashboard`), zéro collision. Vérifs consolidées indépendantes : backend build + jest 232/232 + e2e 37/37 ; admin build prod OK.
- **Restes (rounds suivants, cf. audit)** : P1 historisation (statuts/prix/paiement) ; P2 (signalements, conversation multi-participants, GPS strict + accès commerçant, zones enrichies, notifications persistées).

### Session 26 (2026-07-05) — Profil livreur complet (photo pièce d'identité + zone habituelle)
- **Backend** : `User.idCardPhotoUrl` (nullable), storage dédié `uploads/identity/` (`ensureUploadDirs` mis à jour), `POST /users/me/id-card-photo` (même contrat que `/me/photo`, sans restriction de rôle). `Vehicle.usualZone` (ManyToOne `Zone` nullable) + `usualZoneId` sur `PUT /vehicles/me` (`undefined` = inchangé, `null` = retire, uuid = assigne après vérif d'existence). `findPendingDrivers` charge `vehicle.usualZone` pour que l'admin voie le secteur du livreur en attente. Migration `1778900000000-AddDriverIdentityFields.ts` (postérieure à Zones pour la FK).
- **Admin** : écran `/driver-validation` complété — vignette cliquable de la pièce d'identité (ou alerte ambre « non fournie », signal fort avant approbation) ; zone habituelle affichée à côté du véhicule (`Moto · AB-1234 · Adidogomé`, ou « Zone non renseignée »). Icône `IdCard` enregistrée dans `shared/icons.ts`.
- **Mobile** : écran Profil livreur complété — section « Pièce d'identité » (vignette rectangulaire + bouton upload, aide contextuelle si compte non validé) au-dessus de la section véhicule ; dropdown « Zone habituelle » (zones actives via `GET /zones`, option « Aucune ») dans le formulaire véhicule, `usualZoneId` toujours envoyé explicitement (y compris `null`) pour permettre le retrait.
- **Vérifs indépendantes** : backend `build` OK + `jest` **221/221** (15 suites, +7 vs 214) ; admin `build --configuration production` OK ; mobile `flutter analyze` 10 (préexistantes) / `flutter test` 10/10. Non-régression complète (upload photo de profil, gestion véhicule, validation admin, flux P1/P2/P3 intacts).
- **Profil livreur CDC : désormais complet** (nom, téléphone, photo profil, photo pièce d'identité, véhicule type/plaque, zone habituelle, disponibilité — le permis reste volontairement non requis pour les motos, conforme au CDC).
- Commits sur `feat/v1-priority-3` : backend (`7847488`) + fronts (à suivre).

### Session 24 (2026-07-05) — Fronts P1 (mobile + admin) + Backend P2 (livraison commerçant→client)
- **Mobile P1 — disponibilité livreur** : modèle `User` étendu (`driverApprovalStatus`, `isAvailable`, `driverRejectionReason`), `DriverService.setAvailability` (`PATCH /users/me/availability`). Toggle disponibilité dans l'onglet **Radar** + écran **Profil**. 3 états gérés : non validé/refusé → bandeau (motif affiché), indisponible → état vide « Passez disponible… », disponible → radar normal. Le radar n'appelle `GET /orders/available` que si le livreur est APPROVED (évite le 403). `flutter analyze` 10 (préexistantes), `flutter test` 10/10.
- **Admin P1 — validation des livreurs** : nouveau module `admin-dashboard/src/app/drivers/` (service `drivers.service.ts` + composant `driver-validation/`). Écran `/driver-validation` : file d'attente `GET /users/drivers/pending`, cartes livreur (nom, téléphone, véhicule), boutons Approuver / Refuser (motif optionnel) via `PATCH /users/:id/driver-approval`. Lien sidebar « Validation livreurs » (icône `user-check` — enregistrée dans `shared/icons.ts`). Build prod OK.
- **Backend P2 — livraison commerçant→client (Type 1)** :
  - `DeliveryOrder` : + `merchant` (ManyToOne nullable), `clientPhone`, `clientName` ; `client` rendu **nullable**. Migration `1778200000000-AddMerchantOrders.ts` (FK `merchantId` ON DELETE SET NULL ; `clientId` passé nullable via drop/modify/re-add de la FK `FK_0034e09679836d41ff8f65be7ae`).
  - `POST /orders/merchant` (`@Roles(COMMERCANT)`) → `createMerchantOrder` : résout le client par `clientId` (doit être CLIENT) OU par `clientPhone` (rattache le compte si trouvé, sinon stocke `clientPhone`/`clientName` sans compte) ; calcul prix factorisé (`buildOrderPricing`, partagé avec `createOrder`) ; broadcast + FCM comme une commande client ; notif au client si compte rattaché.
  - `findForUser` : cas COMMERCANT → ses livraisons créées (`where merchant.id`). Règle « commerçant jamais livreur » préservée (`@Roles(LIVREUR)` sur `accept`).
  - `npm run build` OK, `npx jest` **147/147** (11 suites). Non-régression complète : tracking, Socket.IO, FCM, messagerie, création commande client (Type 2), admin.
- **Front commerçant P2 (Flutter)** : `merchant_orders_service.dart` (`createMerchantOrder` / `getMyMerchantOrders`), écran `create_delivery_screen` (client par téléphone/nom, retrait/livraison via `LocationPickerScreen`, estimation débouncée, `POST /orders/merchant`) et écran `merchant_orders_screen` (« Mes livraisons » via `GET /orders/mine`, statuts colorés, pull-to-refresh). Accès via une carte d'actions rapides en haut de `merchant_home_screen` (sans casser la gestion boutique/produits) + routes go_router `/home/merchant/create-delivery` et `/home/merchant/orders`. Modèle `order_history_item` étendu (`clientPhone`/`clientName`). `flutter analyze` 10, `flutter test` 10/10.
- **Bilan** : Priorité 1 **complète** (backend + fronts mobile & admin). Priorité 2 **complète** (backend + front commerçant mobile). Vérifs finales indépendantes : backend jest 147/147, admin build prod OK, mobile analyze 10 / test 10/10. Aucun commit (working tree). Reste P2 admin (optionnel, non prioritaire) et toute la Priorité 3.

### Session 23 (2026-07-05) — Backlog V1 (CDC) + Backend Priorité 1 : validation & disponibilité livreurs
- **Analyse d'écart CDC V1** consignée (section dédiée en haut de ce fichier) + **backlog V1 priorisé** dans `TODO.md` (P1/P2/P3). Décision : architecture Flutter + Angular conservée pour la V1 (pas de PWA maintenant).
- **Backend P1 implémenté** (via agent Sonnet, vérifié indépendamment) :
  - **Entité `User`** : `enum DriverApprovalStatus {PENDING, APPROVED, REJECTED}` + colonnes `driverApprovalStatus` (nullable), `driverRejectionReason` (nullable), `isAvailable` (boolean default false). Migration `1778100000000-AddDriverApprovalAndAvailability.ts` — **grandfather** : les livreurs déjà en base passent `APPROVED` + `isAvailable=1` (ne pas bloquer les testeurs actuels). Nouveaux livreurs → `PENDING` + indisponibles.
  - **Endpoints** : `PATCH /users/:id/driver-approval` (ADMIN, `{status, reason?}`, + audit log `DRIVER_APPROVE`/`DRIVER_REJECT`), `GET /users/drivers/pending` (ADMIN), `PATCH /users/me/availability` (LIVREUR, autorisé uniquement si `APPROVED`).
  - **Blocage dur** : `OrdersService.acceptOrder` recharge le livreur depuis la DB (le JWT ne porte que `{sub,phone,role}`) et lève `ForbiddenException` si non `APPROVED` ou non `isAvailable`. `findAvailable(livreur)` → `Forbidden` si non validé, `[]` si indisponible.
  - **Ciblage des notifications** : `broadcastNewOrder(order, eligibleDriverIds?)` reste **synchrone** (la Set d'éligibles est calculée en amont dans `createOrder` via `findEligibleLivreurIds`), n'émet qu'aux livreurs connectés ∩ éligibles ; sans la liste → comportement legacy conservé (rétro-compat tests). `notifyOfflineLivreurs` + `PositionsService.findRecentLivreurPositions` + `findLivreursWithFcmToken` filtrent désormais `APPROVED`+`isAvailable`.
  - **Non-régression** : tracking GPS, Socket.IO (`driver:location`/`driver:position`), FCM, messagerie client↔livreur, admin — intacts. `npm run build` OK, `npx jest` **138/138** (11 suites, +18 tests).
- **Reste P1** (fronts, non commencés) : toggle disponibilité dans l'UI livreur Flutter (⚠️ indispensable pour rendre les nouveaux livreurs opérationnels, `PENDING`+indispo par défaut) et écran admin de validation (Angular).

### Session 1 (2026-04-29 → 2026-04-30)
- Configuration Firebase (projet `zonzon-4eb31`, app Android, google-services.json, firebase-adminsdk.json)
- Déploiement backend sur Fly.io (Paris)
- Création base de données TiDB Serverless (Frankfurt)
- Déploiement admin Angular sur Cloudflare Pages
- Build APK Flutter release avec URL de prod

### Session 2 (2026-04-30)
- Amélioration interface livreur :
  - Ajout onglet "Mon Profil" (bottom navigation bar)
  - Upload photo de profil
  - Modification nom/prénom (nouveau endpoint `PATCH /users/me`)
  - Gestion véhicule (type, plaque, description)
  - Affichage stats (note moyenne, nombre d'avis)
  - Bouton déconnexion avec confirmation
- Ajout méthode `put()` dans `ApiClient`
- Redéploiement backend + rebuild APK

### Session 3 (2026-05-01)
- Correction bug APK : URL `127.0.0.1:3050` au lieu de l'URL de prod
  - Cause : APK buildé sans le flag `--dart-define`
  - Fix : `env.dart` defaultValue mis à jour → `https://zonzon-backend.fly.dev`
- Rebuild APK corrigé
- Création de `CLAUDE.md` et `PROGRESS.md` pour la continuité entre sessions Claude Code
- Installation de 10 Flutter Skills officiels dans `.agents/skills/` (flutter/skills repo)
- Création du compte admin : Malik ATCHA, +22890111111, rôle ADMIN en base TiDB
- Installation du MCP Context7 (`@upstash/context7-mcp`) :
  - `.mcp.json` créé à la racine du projet
  - `.claude/settings.local.json` mis à jour avec `enableAllProjectMcpServers: true`
- Mise à jour `CLAUDE.md` avec la table des Flutter Skills installés

### Session 5 (2026-05-01) — Création de TODO.md + fix bug radar livreur
- Création de `TODO.md` (Trello du projet, lié à `CLAUDE.md` et ce fichier).
- Update `CLAUDE.md` : règle obligatoire étendue → lire `PROGRESS.md` ET `TODO.md` au démarrage, cocher les tâches au fil de l'eau.
- **Bug critique fix : "course déjà prise" sur le radar livreur.**
  - Cause : `mobile_app/lib/driver_screen.dart` appelait `GET /orders` qui retournait toutes les courses (PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED). Le livreur essayait d'accepter des courses déjà prises.
  - Fix backend : nouvel endpoint `GET /orders/available` (rôle LIVREUR uniquement) qui filtre `status=PENDING AND livreur IS NULL`.
  - Fix mobile : `_loadAvailableOrders` pointe maintenant sur `/orders/available`.
- **Race-condition `acceptOrder` corrigée.**
  - Avant : `findOne` + check status + `save` (non atomique, 2 livreurs simultanés pouvaient passer le check).
  - Après : `UPDATE delivery_orders SET status='ACCEPTED', livreurId=:livreurId WHERE id=:id AND status='PENDING' AND livreurId IS NULL` via QueryBuilder. Si `affected===0` → ConflictException. 4 tests Jest ajoutés (succès, conflit, 404, concurrence).
- **Annulation côté client (mobile)** : bouton "Annuler la commande" dans `order_screen.dart` quand `_activeOrderStatus IN ('PENDING','ACCEPTED')`. Dialog avec message contextuel + champ "Raison" optionnel + reset complet de l'état après succès. Utilise l'endpoint backend déjà existant `PATCH /orders/:id/status`.
- Tests backend : 46/46 jest passent. `flutter analyze` : aucune nouvelle erreur introduite.
- ⚠️ APK **non régénéré** dans cette session (volonté user). À faire avant prochain test : `flutter build apk --release` + `flyctl deploy --app zonzon-backend`.
- 📋 Voir `TODO.md` pour la suite (pagination, helmet, soft-delete, FCM fallback offline, etc.).

### Session 6 (2026-05-01) — Sélecteur d'indicatif téléphonique (admin)
- **Nouveau composant standalone** `PhoneInputComponent` dans `admin-dashboard/src/app/shared/phone-input/`.
  - Fichiers : `phone-input.component.ts/html/css` + `countries.ts` (22 pays, TG/BJ/CI/GH/BF/NE/ML/SN/NG/CM/GA/GN + FR/BE/CH/DE/GB/US/CA/MA/DZ/TN).
  - Implémente `ControlValueAccessor` (CVA) → compatible Reactive Forms et `[(ngModel)]`. Émet la valeur internationale concaténée sans séparateurs (`+22890123456`).
  - UI : bouton drapeau + indicatif à gauche, input numérique à droite. Au clic, dropdown avec recherche (nom ou code) et liste scrollable (max-h 300px). Style cohérent admin (`bg-slate-800/50`, `text-sky-400`, `focus:ring-sky-500`). Soft-warning visuel si longueur hors min/max du pays.
  - Helpers `splitInternationalNumber` et `findCountryByDialCode` exportés depuis `countries.ts`.
- **Intégration** : `auth/login/login.component.ts/html` — l'input `<input type="tel">` du formulaire de connexion est remplacé par `<app-phone-input formControlName="phone">`. Les composants `users` et `shops` étant en lecture seule (pas de formulaire de création/édition téléphone), aucune autre intégration possible aujourd'hui.
- Build admin prod OK (`npm run build -- --configuration production`), seuls deux warnings préexistants sur `main-layout.component.html` (NG8107 sur `?.[0]`).

### Session 7 (2026-05-01) — Backend : pattern CORS preview + FCM fallback livreurs offline
- **Pattern CORS preview Cloudflare Pages.**
  - Nouveau helper partagé `backend/src/common/cors.ts` : `loadCorsConfig`, `isOriginAllowed`, `hasAnyCorsConfig`. Combine deux env vars : `FRONTEND_URLS` (origines exactes, déjà existante) + `FRONTEND_URL_PATTERNS` (regex strings séparées par virgules, NEW). Origin autorisée si présente dans l'une des deux. Origin absente (mobile/server-to-server) toujours autorisée.
  - `main.ts` : `enableCors({ origin: callback })` quand au moins une config existe ; sinon comportement permissif `true` (dev).
  - `orders.gateway.ts` : `resolveWsCorsOrigin()` refactorisé pour retourner soit `boolean` soit `(origin, cb) => cb(...)` — Socket.IO accepte les trois formes (boolean, list, function).
  - **Action déploiement** : `flyctl secrets set FRONTEND_URL_PATTERNS="^https://[a-z0-9-]+\\.zonzon-admin\\.pages\\.dev$" --app zonzon-backend` pour activer les previews Cloudflare.
- **FCM fallback livreurs offline.**
  - Nouvelle méthode `UsersService.findLivreursWithFcmToken()` (filtre `role=LIVREUR AND fcmToken IS NOT NULL`, ne sélectionne que `id, firstName, fcmToken`).
  - Nouvelle méthode privée `OrdersService.notifyOfflineLivreurs(order)` appelée en fire-and-forget après `broadcastNewOrder`. Filtre les livreurs déjà connectés au WS via `ordersGateway.isUserConnected(id)` (déjà notifiés par WS) et envoie une push FCM aux autres avec `{ kind: 'new_order', orderId }`. Body = "Pickup: <adresse>" (tronqué 80 chars). Logger `FCM fallback: X livreur(s) offline notifié(s)`.
  - **Limitation explicite** : pas de filtre géographique pour l'instant. Le filtre par rayon attendra la persistance des positions livreur (toujours en `Map` mémoire dans le gateway aujourd'hui).
- **Tests** : 66/66 jest passent (was 53). Ajouts :
  - `backend/src/common/cors.spec.ts` — 11 tests (parsing env, regex invalides ignorées, matching exact/pattern, origin absente).
  - 2 tests dans `orders.service.spec.ts` pour le fallback FCM (push aux offline, aucun envoi si tous online).
- `npm run build` : OK.
- TODO.md : "FCM fallback livreurs offline" et "Pattern CORS preview Cloudflare" cochés.

### Session 8 (2026-05-01) — Backend : soft-delete `User` & `DeliveryOrder`
- **Soft-delete TypeORM** sur les deux entités les plus sensibles (`User`, `DeliveryOrder`).
  - `@DeleteDateColumn deletedAt: Date | null` ajouté sur `backend/src/entities/user.entity.ts` et `delivery-order.entity.ts`.
  - Comportement par défaut : `find/findOne/findAndCount` excluent automatiquement les rows avec `deletedAt IS NOT NULL`. Pour les inclure → `withDeleted: true`. **Aucune modification requise** sur `OrdersService.findAll(query)` ni `OrdersService.findForUser(user)` : ils héritent du filtrage automatique, ce qui est le comportement souhaité.
- **Migration** `backend/src/migrations/1777626458400-AddSoftDelete.ts` : `ALTER TABLE users / delivery_orders ADD COLUMN deletedAt DATETIME(6) NULL`. Up + down. Sera appliquée au prochain `flyctl deploy` (`migrationsRun: true` en prod, cf. `data-source.ts`).
- **Endpoints admin** dans `users.controller.ts` :
  - `DELETE /users/:id` → `usersService.softDelete(id)` (positionne `deletedAt = NOW()`)
  - `POST /users/:id/restore` → `usersService.restore(id)` (remet `deletedAt = NULL`)
  - Tous deux protégés par `@Roles(UserRole.ADMIN)` + `ParseUUIDPipe`.
- **Pas d'endpoint soft-delete sur `DeliveryOrder`** : l'annulation existe déjà via `PATCH /orders/:id/status` (CANCELLED). Le soft-delete order admin pourra venir plus tard si besoin.
- **Vérification grep** : aucun `usersRepository.remove/delete` ni `ordersRepository.remove/delete` existant — donc rien à remplacer par `softRemove()`.
- **Tests** : `backend/src/users/users.service.spec.ts` créé (mock `softDelete` / `restore` du repo, 2 tests). Ne touche pas aux specs existantes.
- **Hors scope** (volontairement) : pas de modif `app.module.ts` (autre agent backend en parallèle sur l'audit log admin), pas de soft-delete sur Shop/Product/Rating/Message, pas de modifications mobile/admin.
- `npm run build` : OK.

### Session 9 (2026-05-01) — Backend : audit log admin
- **Nouvelle entité** `backend/src/entities/admin-audit-log.entity.ts` (table `admin_audit_logs`) avec colonnes `id` UUID, `adminId` (FK users SET NULL nullable), `action` varchar(64), `targetType` varchar(64), `targetId` varchar(64), `metadata` JSON nullable, `createdAt`. Indexes : `(adminId, createdAt)` et `(targetType, targetId)`. Type `AuditAction` exporté avec les actions actuellement supportées (`SHOP_APPROVE/REJECT/SUSPEND`, `COMMISSION_MARK_PAID`, `USER_DELETE/RESTORE` réservé pour future itération).
- **Migration** `backend/src/migrations/1777400000000-AddAdminAuditLog.ts` (CREATE TABLE + 2 indexes + FK SET NULL → users.id ; down inverse propre).
- **Module** `backend/src/audit-log/` : `audit-log.module.ts` (exporte le service), `audit-log.service.ts` (`log()` fire-and-forget avec `try/catch + Logger.warn` pour ne JAMAIS bloquer l'action métier ; `list()` paginée avec filtres `adminId`, `targetType`, `action`, `from`, `to` et retour `{items, total, page, limit, hasMore}`), `audit-log.controller.ts` (`@Controller('admin/audit-logs')` + `@Roles(ADMIN)` + `GET /` → `service.list(query)`), `dto/list-audit-logs.dto.ts` (mêmes conventions que `ListOrdersDto`, `class-validator`/`class-transformer`).
- **Wiring** `app.module.ts` : `AdminAuditLog` ajouté à `entities`, `AuditLogModule` ajouté à `imports`. Compatible avec les modifs de la session 8 sur `User` (soft-delete) — pas de conflit.
- **Hooks métier** :
  - `shops.service.ts` : injection de `AuditLogService`, signatures `adminApprove(id, adminId)` / `adminReject(id, adminId, reason?)` / `adminSuspend(id, adminId)` enrichies. Appel `void this.auditLog.log({...})` après le save. Metadata `{ reason }` pour SHOP_REJECT.
  - `reports.service.ts` : injection de `AuditLogService`, `markPaid(id, adminId)` enrichi. Metadata `{ commissionDue }`.
  - `shops.controller.ts` & `reports.controller.ts` : extraction de `adminId` via `(user.id ?? user.sub) as string` (cohérent avec `ShopsController.toActor`).
  - `shops.module.ts` & `reports.module.ts` : import de `AuditLogModule`.
- **Endpoint exposé** : `GET /admin/audit-logs?page&limit&adminId&targetType&action&from&to` (ADMIN only). Pas d'UI admin pour visualiser ces logs encore (autre tâche).
- **Tests** : 74/74 jest passent (était 71). `audit-log.service.spec.ts` ajouté (3 tests `log()` + 3 tests `list()` couvrant pagination, filtres, hasMore et le swallow d'erreur DB). `shops.service.spec.ts` adapté (mock `AuditLogService` injecté, assertions sur les payloads d'audit). `reports.service.spec.ts` adapté (provider `AuditLogService` mocké pour la résolution DI).
- **Hors scope** : pas de modif `user.entity.ts` ni `delivery-order.entity.ts` (autre agent), pas d'audit sur le soft-delete user (à ajouter dans une session future), pas de UI admin.
- **Déploiement Fly.io** : la migration s'applique automatiquement (`migrationsRun: true` quand `NODE_ENV=production`, cf. `app.module.ts`). Aucun secret à ajouter.
- `npm run build` : OK.

### Session 10 (2026-05-01) — Admin : stats étendues par livreur
- **Nouveau endpoint backend (autre agent)** : `GET /users/:id/stats` retournant `{ ratingAverage, ratingCount, completedCount, averageDurationMinutes, cancellationRate }`. Sera disponible au prochain `flyctl deploy --app zonzon-backend`.
- **Service admin** : `admin-dashboard/src/app/users/users.service.ts` enrichi.
  - Nouvelle interface `UserExtendedStats`.
  - Nouvelle méthode `getUserExtendedStats(userId)` qui appelle `/users/:id/stats`.
  - Méthode `getRatingStats` conservée pour rétro-compat + alias `getUserRatingStats`.
- **Composant `users.component.ts`** :
  - Cache `extendedStats` (au lieu de `ratingStats`) typé `Record<string, UserExtendedStats>`.
  - `loadDriverStats()` appelle `getUserExtendedStats` pour chaque livreur, avec **fallback gracieux** via `catchError` : si 404/500 (endpoint pas encore déployé), retombe sur `getRatingStats` pour conserver au moins la note moyenne ; les 3 nouvelles colonnes affichent `—`.
  - Helpers : `formatDuration(minutes)` (`X min` < 60, `Yh` ou `Yh Zmin` ≥ 60), `cancellationRateColor(rate)` (vert <5%, jaune 5-15%, rouge >15%), `cancellationBadge(u)`, `statsFor(u)`, `completedLabel(u)`, `durationLabel(u)`, `cancellationLabel(u)`.
  - Normalisation des payloads : `normalizeStats(raw)` détecte le format legacy (`average`/`count`) vs nouveau (`ratingAverage`/`completedCount`) pour ne rien casser.
- **Template `users.component.html`** :
  - 3 nouvelles colonnes après "Note moyenne" : **Courses** (icône `package` + nombre), **Temps moyen** (icône `clock` + durée formatée), **Taux d'annulation** (badge coloré arrondi). 
  - Pour les rôles non-LIVREUR (CLIENT, COMMERCANT, ADMIN) : affichage `—` cohérent avec le placeholder existant pour la note moyenne.
  - Skeleton loader passé de `cols=6` à `cols=9` ; `colspan` de "Aucun utilisateur trouvé" mis à jour de 6 à 9.
- **Hors scope** : pas de modif backend, pas de modif mobile, pas de page détail user avec graphiques, pas de tests Angular, pas de filtre "afficher seulement les livreurs avec taux d'annulation > X%".
- `npm run build -- --configuration production` : OK. Aucun nouveau warning. Seuls les 2 warnings NG8107 préexistants (`main-layout.component.html:51`) demeurent. Bundle `users-component` à 12.14 kB.

### Session 11 (2026-05-01) — Mobile : Favoris boutiques côté client
- **Nouveaux endpoints backend (autre agent en parallèle)** : `GET /shops/favorites`, `POST /shops/:id/favorite`, `DELETE /shops/:id/favorite`. Disponibles au prochain `flyctl deploy --app zonzon-backend`. UI mobile implémentée en assumant ces endpoints — pas de modification backend ni admin dans cette session.
- **Service `ShopsService`** (`mobile_app/lib/services/shops_service.dart`) : 4 nouvelles méthodes.
  - `Future<List<Shop>> getFavorites()` : throw en cas d'erreur (laisse l'écran appelant gérer le retry/affichage).
  - `Future<Set<String>> getFavoriteIds()` : silencieux (Set vide en cas d'erreur), utilisé par les listes pour pré-calculer l'état favori sans 1 appel par item.
  - `Future<void> addFavorite(String shopId)` : idempotent — 409 (déjà favori) silently swallowed.
  - `Future<void> removeFavorite(String shopId)` : idempotent — 404 (déjà retiré) silently swallowed.
- **Bouton cœur** dans `lib/screens/shop_list_screen.dart` (top-right de chaque carte via `Stack` + `Positioned`) : `Icons.favorite_border` (blanc/gris) → `Icons.favorite` (rouge `#EF4444`). Optimistic update + revert sur erreur + snackbar "Erreur, veuillez réessayer". `Set<String> _favoriteIds` chargé une fois au `_bootstrap()` (en parallèle de `_refresh()` via `Future.wait`).
- **Bouton cœur** dans l'AppBar de `lib/screens/shop_detail_screen.dart` (`actions:`). Constructeur accepte `isFavoriteInitial` + callback `onFavoriteChanged` pour synchroniser avec le Set côté liste sans refetch. Si pas d'état initial fourni, `getFavoriteIds()` au `initState`. Bouton désactivé tant que l'état favori n'est pas chargé pour éviter un toggle dans le vide.
- **Nouvel écran** `lib/screens/favorites_screen.dart` : AppBar "Mes favoris", états loading (`adaptiveLoader`) / erreur ("Réessayer") / vide ("Aucun favori pour le moment. Cliquez sur le ❤️ d'une boutique pour l'ajouter ici.") / liste. Carte dédiée `_FavoriteShopCard` reprenant le style de `ShopListScreen` (logo, nom, adresse, distance) avec un cœur rouge dédié pour retirer (long-press supporté aussi). `RefreshIndicator` pull-to-refresh. Au retour du `ShopDetailScreen`, refresh silencieux pour refléter un éventuel unfavorite.
- **Accès "Mes favoris"** : icône `Icons.favorite` rouge dans l'AppBar de `ShopListScreen` (action). L'écran `OrderScreen` n'a pas été modifié (tâche jugée "pas indispensable" — l'entrée vers les commerces se fait depuis `OrderScreen` puis la liste, et l'écran header est déjà rempli avec le bouton historique).
- **Style cohérent** : palette du projet (`#0F172A` fond, `#1E293B` cartes, `#0EA5E9` accent, `#10B981` shops, `#EF4444` favoris), helpers `pushAdaptive`/`adaptiveLoader`/`showAdaptiveSnack`/`hapticLight` du projet.
- **Vérifications** : `flutter analyze` 8 issues (était 9 — un warning `unused_field` éliminé dans `shop_detail_screen.dart` par nettoyage du `_loading` mort ; tous les autres warnings sont préexistants : `desiredAccuracy`, `library_prefixes` IO, etc.). `flutter test` 10/10 OK.
- **Hors scope** : pas de modif backend (autre agent), pas de modif admin, pas de regénération d'APK, pas de tests Flutter dédiés aux favoris (autre tâche), pas de notifications push pour les favoris, pas de partage / catégories de favoris.

### Session 12 (2026-05-01) — Backend : timestamps de transition + stats étendues + favoris boutiques
- **Timestamps de transition `DeliveryOrder`** : ajout de 3 colonnes nullable `acceptedAt`, `inProgressAt`, `completedAt` (`@Column({ type: 'datetime', nullable: true })`) dans `backend/src/entities/delivery-order.entity.ts`. Les setters dans `OrdersService` :
  - `acceptOrder` : enrichi le `set({...})` du `createQueryBuilder().update()` avec `acceptedAt: () => 'CURRENT_TIMESTAMP'` (timestamp DB pour rester cohérent avec l'UPDATE atomique).
  - `updateStatus` : `if (status === IN_PROGRESS) order.inProgressAt = new Date(); if (status === COMPLETED) order.completedAt = new Date();` avant `save(order)`.
  - Pas de `cancelledAt` (déjà couvert par `cancellationReason` + `cancelledBy` + `updatedAt`).
- **Endpoint stats étendues `GET /users/:userId/stats`** (tout user authentifié, `ParseUUIDPipe`) dans `backend/src/ratings/ratings.controller.ts`. Méthode `RatingsService.getExtendedStats(userId)` qui combine :
  1. `getUserStats(userId)` → `{ratingAverage, ratingCount}`
  2. QueryBuilder TypeORM agrégat : `SELECT COUNT(*) AS cnt, AVG(TIMESTAMPDIFF(MINUTE, acceptedAt, completedAt)) AS avgMin FROM delivery_orders WHERE livreurId=:userId AND status='COMPLETED' AND acceptedAt IS NOT NULL` → `completedCount` + `averageDurationMinutes` (null si aucune course).
  3. QueryBuilder agrégat (un seul round-trip) avec `SUM(CASE WHEN ... END)` : `cancelledByLivreurCount` (status=CANCELLED ET cancelledBy=LIVREUR) et `totalAssigned` (status IN ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED). `cancellationRate = cancelled / assigned` (0 si assigned=0). Réponse type `ExtendedUserStats` exportée du module.
- **Système Favoris boutiques (backend)** : nouvelle entité `backend/src/entities/favorite-shop.entity.ts` (`@Entity('favorite_shops')`, UNIQUE `(userId, shopId)`, index `(userId, createdAt)`, FK CASCADE `users` et `shops`).
  - `ShopsService` enrichi : `addFavorite(userId, shopId)` (vérif shop APPROVED → throw NotFoundException sinon ; `favoritesRepo.insert(...)` avec try/catch sur `ER_DUP_ENTRY` pour rester idempotent face aux double-clics), `removeFavorite` (no-op via `delete({userId, shopId})`), `listFavorites` (`createQueryBuilder` + `innerJoinAndSelect('f.shop', 'shop')` + `WHERE userId AND shop.status=APPROVED ORDER BY f.createdAt DESC`), `isFavorite` (count).
  - Routes ajoutées dans `shops.controller.ts` **avant** le pattern catch-all `@Get(':id')` : `GET /shops/favorites`, `POST /shops/:id/favorite`, `DELETE /shops/:id/favorite` (utilisateurs authentifiés ; `ParseUUIDPipe` sur les routes paramétrées). `CurrentUser()` extrait via `(user.id ?? user.sub) as string`.
- **Migration combinée** `backend/src/migrations/1777900000000-AddTimestampsAndFavoriteShops.ts` :
  - up() : `ALTER TABLE delivery_orders ADD COLUMN acceptedAt/inProgressAt/completedAt DATETIME NULL` + `CREATE TABLE favorite_shops (uuid id, varchar(64) userId/shopId, datetime(6) createdAt DEFAULT CURRENT_TIMESTAMP(6), UNIQUE (userId, shopId), INDEX (userId, createdAt))` + 2 FK CASCADE.
  - down() : drop FKs/indexes/table favorite_shops + drop des 3 colonnes timestamps.
  - Ordre d'exécution suivant les migrations existantes : `1776850595860-InitialSchema` → `1777303664742-AddShopsMessagesAddressesFcm` → `1777312383481-AddRatings` → `1777400000000-AddAdminAuditLog` → `1777626458400-AddSoftDelete` → `1777800000000-AddDriverPositionsAndDeviceTokens` → **`1777900000000-AddTimestampsAndFavoriteShops`** (nouvelle).
- **Wiring** : `FavoriteShop` ajouté à `entities` du `TypeOrmModule.forRoot` (`app.module.ts`) et à `forFeature([Shop, Product, FavoriteShop])` dans `shops.module.ts`.
- **Tests Jest** : 96/96 passent (était 92 avant cette session, +4 nouveaux tests pour `getExtendedStats` + 4 nouveaux pour favoris).
  - Nouveau fichier `backend/src/ratings/ratings.service.spec.ts` (4 tests : user vide → counts à 0 et averageDurationMinutes null ; user avec courses COMPLETED → durée moyenne et rating ; cancellationRate calculé ; totalAssigned=0 → rate=0 sans division par zéro).
  - `backend/src/shops/shops.service.spec.ts` enrichi : injection `mockFavoritesRepo` + provider `getRepositoryToken(FavoriteShop)`. 8 nouveaux tests pour les 4 méthodes favoris (succès + idempotence ER_DUP_ENTRY + NotFound + filtre APPROVED + isFavorite true/false).
- **Endpoints exposés (récap)** : `GET /users/:userId/stats`, `GET /shops/favorites`, `POST /shops/:id/favorite`, `DELETE /shops/:id/favorite`. UI mobile favoris déjà câblée par l'agent parallèle (cf. Session 11). UI admin stats étendues déjà câblée par l'agent parallèle (cf. Session 10).
- `npm run build` : OK. **Note de déploiement** : `flyctl deploy --app zonzon-backend` appliquera automatiquement la migration (`migrationsRun: true` quand `NODE_ENV=production`). Aucun secret à ajouter.

### Session 13 (2026-05-01) — Versioning d'API `/v1` synchro backend + mobile + admin
- **Backend** : `backend/src/main.ts` ajoute `app.setGlobalPrefix('v1', { exclude: [{ path: '/', method: RequestMethod.GET }] })`. La racine `/` reste accessible (health check uptime). Les WebSockets et `/uploads/*` ne sont pas concernés (hors système de controllers Nest). `npm run build` OK, `npx jest` 96/96 passent (aucun test ne fait d'appel HTTP réel à un controller — le prefix n'impacte donc pas leur exécution).
- **Mobile (Flutter)** : nouvelle constante `apiPrefix = '/v1'` dans `lib/config/env.dart`.
  - `lib/services/api_client.dart` : `_uri()` concatène désormais `apiPrefix` → tous les services qui passent par `ApiClient` (majorité du code) sont automatiquement préfixés.
  - Adaptés manuellement (appels HTTP directs hors `ApiClient`) : `lib/services/auth_service.dart` (login + register), `lib/screens/driver_profile_screen.dart` (upload photo `POST /users/me/photo` via MultipartRequest), `lib/services/shops_service.dart` (`_uploadImageRaw` pour photos boutiques/produits).
  - NE PAS préfixer (vérifié, intacts) : sockets dans `lib/controllers/order_socket_controller.dart` + `lib/services/chat_service.dart` (Socket.IO sur `apiUrl` brut), URLs d'images `'$apiUrl/uploads/...'` dans les écrans `favorites_screen.dart`, `shop_list_screen.dart`, `shop_detail_screen.dart`, `merchant_home_screen.dart`, `merchant_product_form_screen.dart`, `driver_profile_screen.dart`.
  - `flutter analyze` : 8 issues préexistantes, aucune introduite. `flutter test` : 10/10 passent.
- **Admin (Angular)** : nouvelle propriété `apiPrefix: '/v1'` dans `environment.ts` (dev pointant sur `http://localhost:3050`) et `environment.prod.ts` (prod sur `https://zonzon-backend.fly.dev`).
  - Services adaptés (préfixés) : `auth/auth.service.ts`, `orders.service.ts`, `users/users.service.ts`, `shops/shops.service.ts`, `reports/reports.service.ts`, `audit-logs/audit-logs.service.ts`, `shared/messages.service.ts`.
  - NE PAS préfixer : `shared/live-status.service.ts` (Socket.IO sur `environment.apiUrl` brut), `shops/shops.component.ts:144` (URL d'image logo `/uploads/...`).
  - `npm run build -- --configuration production` : OK. Aucun nouveau warning, seuls les 2 warnings NG8107 préexistants (`main-layout.component.html:51`).
- **Décision : `apiPrefix` séparé** plutôt que de muter `apiUrl` directement. Trois raisons :
  1. Les WebSockets Socket.IO et les URLs d'images `/uploads/*` doivent continuer à pointer sur `apiUrl` brut. Si on injecte `/v1` dans `apiUrl`, on casse les sockets et les images.
  2. Migration future vers `/v2` triviale : changer 1 constante côté admin, 1 constante côté mobile.
  3. Permet à un dev d'override `API_URL` au build (`--dart-define=API_URL=http://10.0.2.2:3050`) sans toucher au préfixe.
- **Risques résiduels** :
  - Les anciens APK (versions buildées avant cette session) appellent encore `/auth/login`, `/orders`, etc. → ils recevront 404. ✅ OK pendant la phase de tests (1-2 utilisateurs à prévenir, qui devront réinstaller l'APK).
  - Tout script ad-hoc (`curl`, Postman, scripts CI) qui appelle l'API sans `/v1` recevra 404. À mettre à jour.
  - Les éventuels tests E2E qui pointent sur des URLs HTTP en dur (aucun trouvé dans le repo aujourd'hui) seraient à adapter.
- **Note de déploiement** : ordre obligatoire pour éviter les 404 transitoires :
  1. `flyctl deploy --app zonzon-backend` (le backend accepte les deux : root `/` + préfixe `/v1`).
  2. `npm run build -- --configuration production && npx wrangler pages deploy dist/admin-dashboard/browser --project-name zonzon-admin` (admin pointe désormais sur `/v1`).
  3. `flutter build apk --release` puis distribuer le nouvel APK aux testeurs (ils doivent réinstaller).
  Inversion de l'ordre = clients qui appellent `/v1` reçoivent 404 jusqu'à ce que le backend bascule.
- **Hors scope** : pas de v2 d'API, pas de migration DB, pas de changement de logique métier, pas de regénération d'APK dans cette session (laissée au user).

### Session 14 (2026-05-01) — Mobile : tests d'intégration Flutter (squelette)
- **Nouveau dossier `mobile_app/integration_test/`** créé (n'existait pas avant). Setup `integration_test: { sdk: flutter }` ajouté dans `pubspec.yaml` (dev_dependencies). `flutter pub get` OK (7 nouvelles deps transitives : `process`, `sync_http`, `webdriver`, etc.).
- **3 fichiers de tests créés + 1 README** :
  - `login_flow_test.dart` (4 tests) : composants UI clés présents (PhoneField, champ mot de passe, bouton "Se connecter", lien "Créer un compte"), champs vides → snackbar d'erreur, état `_isLoading` après tap (loader visible), navigation vers `RegisterScreen`.
  - `create_order_flow_test.dart` (1 test) : smoke test minimal — `OrderScreen` se construit sans crasher quand `geolocator` est mocké comme "service indisponible".
  - `home_screen_smoke_test.dart` (5 tests) : aiguillage par rôle (CLIENT → OrderScreen, LIVREUR → DriverScreen, COMMERCANT → MerchantHomeScreen, ADMIN → placeholder neutre, storage vide → fallback). Mock de `current_user` via `flutter_secure_storage` (canal `plugins.it_nomads.com/flutter_secure_storage`).
  - `README.md` : instructions de lancement (`flutter test integration_test/` sur device/émulateur), explications des patterns de mock (`flutter_secure_storage`, `geolocator`), limitations explicites (pas de mock réseau, pas de mock WebSocket, pas de pumpAndSettle), roadmap pour aller plus loin.
- **Limitations explicites** (documentées dans le README) :
  - Pas de mock réseau : `AuthService` et `ApiClient` utilisent `package:http` en singleton → impossible à mocker sans refactor pour injecter un `http.Client`. Les tests ne valident que les chemins UI / erreurs.
  - Pas de mock GPS détaillé : on simule seulement "service indisponible" → l'écran retombe sur son fallback. Tester un flow GPS valide nécessiterait un mock complet retournant un `Position` fictif.
  - Pas de mock WebSocket : `OrderSocketController` ouvre un vrai socket sur l'URL de prod.
  - Pas de `pumpAndSettle` : les écrans réels ouvrent sockets/timers qui ne settle jamais → on utilise `tester.pump(Duration(...))` à la place.
- **Hors scope** (volontairement) : pas de modif des écrans Flutter (autres agents en parallèle sur ETA et évaluation par catégories), pas de modif backend, pas de modif admin, pas d'ajout d'autres dépendances que `integration_test`, pas de regénération d'APK, pas de tests E2E avec backend réel.
- **Vérifications** :
  - `flutter analyze integration_test/` → No issues found.
  - `flutter analyze` projet → 9 issues TOUTES préexistantes (aucune introduite par cette session).
  - `flutter test test/` → 10/10 OK (tests widgets non régressés).
  - `flutter test integration_test/` impossible à lancer ici (pas de device dans cet environnement). Le user pourra les exécuter avec `flutter test integration_test/` sur un émulateur ou device connecté.
- **Commande pour le user** : `cd C:\laragon\www\ZonZon\mobile_app && flutter test integration_test/` (avec un device Android connecté ou un émulateur en cours d'exécution).

### Session 15 (2026-05-01) — ETA basé sur la position du livreur (backend + mobile)
- **Backend** : nouvel endpoint `GET /orders/:id/eta` (`backend/src/orders/orders.controller.ts`, auth via `RolesGuard` + `ParseUUIDPipe`, autorisation client/livreur/admin contrôlée dans le service via `ForbiddenException`).
  - Méthode `OrdersService.computeEta(orderId, actor)` (`backend/src/orders/orders.service.ts`) :
    - Statut `ACCEPTED` → cible = pickup.
    - Statut `IN_PROGRESS` → cible = delivery.
    - Tout autre statut → `{ distanceKm: null, etaMinutes: null, basedOn: 'unavailable' }`.
    - Source de la position du livreur : `PositionsService.findLatestForLivreur(livreurId)` (1 ligne par livreur en base, table `driver_positions`, mise à jour à chaque émission `driver:location` WS). Si position fraîche (< 5 min) → `basedOn: 'driver_position'`. Sinon, en `IN_PROGRESS` on retombe sur les coords pickup (`basedOn: 'pickup'`, ETA approximatif), en `ACCEPTED` on retourne `unavailable`.
    - Distance via `haversineKm` (`backend/src/common/geo.ts`). ETA = `Math.max(1, round(distanceKm / 25 * 60))` minutes (vitesse moyenne 25 km/h pour les motos à Lomé). Pas d'appel ORS (refresh toutes les 30s × N clients, le coût des credits ORS exploserait).
  - Nouvelle méthode `PositionsService.findLatestForLivreur(livreurId)` (`backend/src/orders/positions.service.ts`) — trouve la ligne unique par livreurId.
- **Mobile** : nouveau service `lib/services/eta_service.dart` (classe `EtaResult` exposant `distanceKm`, `etaMinutes`, `basedOn`, `fetchedAt`, getters `isAvailable` et `isFallback`). `EtaService.fetchEta(orderId)` swallow les erreurs (un échec réseau ne doit pas bloquer le suivi de la course).
  - `OrderScreen` (`lib/order_screen.dart`) ajoute champ `_eta`, timer `_etaTimer` (30s), méthodes `_startEtaPolling/_stopEtaPolling/_refreshEta`. Démarre à la réception de `orderAccepted$`, refresh immédiat à chaque `driverPosition$` (la position vient d'évoluer côté backend), refresh aussi sur transition `IN_PROGRESS` (la cible change pickup→delivery). Stoppé sur `COMPLETED`/`CANCELLED` et dans `_resetAfterCancellation` (timer cancel + état remis à `null`).
  - `OrderAcceptedSection` (`lib/widgets/order_screen_widgets.dart`) accepte un nouveau paramètre optionnel `EtaResult? eta`, qu'il forward à `LiveTrackingBanner`. Le bandeau affiche maintenant un badge `_EtaBadge` "horloge + ~X min" en cyan `#0EA5E9` quand basé sur la position du livreur, gris `#94A3B8` + icône `warning_amber_rounded` quand fallback pickup. Le texte secondaire est grisé en mode fallback. La logique de fallback local "30 km/h × distance" est conservée pour les cas où le backend n'a pas encore renvoyé d'ETA.
- **Tests Jest** : 110/110 passent (était 96 avant cette session, +7 tests ETA dans `orders.service.spec.ts` couvrant ACCEPTED+position fraîche, IN_PROGRESS+position fraîche, PENDING→unavailable, ACCEPTED sans position fraîche, IN_PROGRESS sans position fraîche → fallback pickup, Forbidden, NotFound, admin autorisé). `flutter analyze` 8 issues préexistantes (aucune nouvelle). `flutter test` 10/10. `npm run build` OK.
- **Hors scope** : pas d'utilisation d'ORS pour le routing (trop coûteux), pas d'ETA côté livreur (l'écran livreur reste sur le radar — l'ETA c'est pour le client qui suit son colis), pas de regénération d'APK.

### Session 16 (2026-05-01) — Mobile : migration navigation vers go_router
- **Nouvelle dépendance** : `go_router: ^14.6.3` ajoutée dans `pubspec.yaml` (résolue en 14.8.1 via `flutter pub get`).
- **Nouveau fichier** `lib/router/app_router.dart` :
  - `GoRouter appRouter` (instance top-level) avec `initialLocation: '/'` et `redirect: _globalRedirect`.
  - `_globalRedirect` : lit `flutter_secure_storage` via `AuthService().getToken()` → redirige vers `/login` si non authentifié, vers `homeForRole(user.role)` si authentifié sur `/` ou sur une page d'auth.
  - Classe `AppRoutes` (constantes de routes) : `splash='/'`, `login='/login'`, `register='/register'`, `homeClient='/home/client'`, `homeDriver='/home/driver'`, `homeMerchant='/home/merchant'`, `shops='/shops'`, `favorites='/favorites'`, `history='/history'`, `driverProfile='/driver/profile'`. Helper statique `homeForRole(role?)`.
  - Routes sous `/home/client` (sous-routes) : `shops`, `favorites`, `history`.
  - Routes sous `/home/driver` (sous-routes) : `history`, `profile`.
  - Routes plates de commodité : `/shops`, `/favorites`, `/history`, `/driver/profile` (accessibles depuis n'importe quelle page sans connaître le rôle).
- **`lib/main.dart`** :
  - `MaterialApp(home: _AuthGate())` → `MaterialApp.router(routerConfig: appRouter)`.
  - `_AuthGate` (StatefulWidget qui lisait le token manuellement) supprimée — la logique est maintenant dans `_globalRedirect`.
  - Import `utils/platform_adapter.dart` retiré (plus nécessaire dans `main.dart`).
- **Appels de navigation mis à jour** (auth-flow uniquement — `context.go()` remplace `Navigator.pushAndRemoveUntil`) :
  - `lib/home_screen.dart` : `_logout` → `context.go(AppRoutes.login)`.
  - `lib/order_screen.dart` : `_logout` → `context.go(AppRoutes.login)`.
  - `lib/screens/login_screen.dart` : success → `context.go(AppRoutes.homeForRole(result.user.role))`. Lien "Créer un compte" → `context.push(AppRoutes.register)`.
  - `lib/screens/register_screen.dart` : success → `context.go(AppRoutes.homeForRole(user?.role))`.
  - `lib/screens/merchant_home_screen.dart` : `_logout` → `context.go(AppRoutes.login)`.
  - `lib/screens/driver_profile_screen.dart` : `_logout` → `context.go(AppRoutes.login)`.
- **`pushAdaptive` conservé pour les sub-écrans** : les navigations qui retournent une valeur typée (ex: `MerchantShopFormScreen` → `Shop?`, `LocationPickerScreen` → `Place?`, `ChatScreen`, `OrderHistoryScreen`, `ShopListScreen`, `ShopDetailScreen`, `RatingScreen`) utilisent toujours `pushAdaptive` car `context.push()` de go_router ne supporte pas les retours typés. Ce choix est correct et ne brise rien.
- **`test/widget_test.dart`** : ajout du mock du canal `flutter_secure_storage` (pattern identique à `order_history_screen_test.dart`) pour que `ZonZonApp` (qui utilise maintenant `MaterialApp.router`) puisse se construire sans `MissingPluginException` dans les tests.
- **Vérifications** :
  - `flutter pub get` : OK (go_router 14.8.1 résolu, 1 dépendance changée).
  - `flutter analyze` : 9 issues, TOUTES préexistantes (0 issue introduite). Les 2 nouveaux unused imports introduits en première passe (`home_screen.dart` dans le router, `platform_adapter.dart` dans `main.dart`) ont été retirés immédiatement.
  - `flutter test test/` : **10/10 passent**.
- **Hors scope** : pas de deep-linking Android (AndroidManifest), pas de migration des `pushAdaptive` sub-écrans (risque de régression sur les retours typés), pas de regénération d'APK.

### Session 4 (2026-05-01) — Corrections de bugs
- **Bug upload photo produit (400)** : `http.MultipartFile.fromPath` sans MIME explicite envoyait `application/octet-stream` → rejeté par le filtre multer. Fix : détection du MIME dans `shops_service.dart` et `driver_profile_screen.dart` avec `http_parser: MediaType`.
- **Aperçu local photo produit** : `NetworkImage('file://...')` ne fonctionne pas pour les fichiers locaux. Fix : `FileImage(File(path))` dans `merchant_product_form_screen.dart`.
- **Répertoires uploads manquants sur Fly.io** : ajout de `ensureUploadDirs()` dans `backend/src/main.ts` qui crée `uploads/{shops,products,avatars}/` au démarrage (évite les 500).
- **Messages chat pas reçus côté client** : `OrderSocketController` n'écoutait pas `chat:message`. Fix : ajout du stream `newChatMessage$`, badge rouge sur le bouton "Discuter" dans `OrderAcceptedSection`, compteur remis à zéro à l'ouverture du chat.
- **Annulation livreur "transaction refusée"** : le dialog était statique → deux clics simultanés possibles. Fix : `StatefulBuilder` avec état `dialogStatus` + `dialogProcessing`, boutons masqués/désactivés selon l'état courant, fermeture auto du dialog à COMPLETED/CANCELLED.
- Redéploiement backend + rebuild APK (52.3 MB)
- Nouvelles dépendances Flutter : `http_parser: ^4.0.2`, `mime: ^1.0.6`

### Session 18 (2026-05-03) — Fix Sentry crash + écran profil client

#### Fix critique : SentryGlobalFilter TypeError
- **Symptôme** : `TypeError: Cannot read properties of undefined (reading 'isHeadersSent')` sur chaque exception HTTP (`GET /robots.txt`, `POST /v1/auth/login`, etc.). Remontait dans Sentry et cassait silencieusement le filtre.
- **Cause** : `app.useGlobalFilters(new SentryGlobalFilter())` dans `main.ts` — instanciation manuelle = NestJS DI non invoqué = `applicationRef` `undefined` dans le filtre.
- **Fix** : supprimé de `main.ts`, ajouté `{ provide: APP_FILTER, useClass: SentryGlobalFilter }` dans `providers` de `app.module.ts` → DI injecte correctement `applicationRef`. Commentaire explicatif ajouté.
- **Fichiers modifiés** : `backend/src/main.ts`, `backend/src/app.module.ts`.
- **Commit** : `10ade33` — déployé sur Fly.io, 2 machines en `started` state ✅.

#### Écran profil client (nouvelle fonctionnalité)
- **Nouveau fichier** : `mobile_app/lib/screens/client_profile_screen.dart`
  - Avatar circulaire avec bouton caméra (upload via `POST /users/me/photo`).
  - Champs éditables prénom/nom (`PATCH /users/me`).
  - Numéro de téléphone en lecture seule.
  - Bouton "Mes commandes" → `OrderHistoryScreen`.
  - Bouton déconnexion avec dialog de confirmation → `context.go(AppRoutes.login)`.
  - Dark theme cohérent (`#0F172A` fond, `#1E293B` cartes, `#0EA5E9` accent).
- **`mobile_app/lib/router/app_router.dart`** : route `clientProfile = '/home/client/profile'` ajoutée.
- **`mobile_app/lib/order_screen.dart`** : méthode `_openProfile()` + passage à `OrderHeader`.
- **`mobile_app/lib/widgets/order_screen_widgets.dart`** : `OrderHeader` accepte `onOpenProfile` optionnel (icône `account_circle_outlined`).

#### GitHub + Déploiement
- Push GitHub : commit `10ade33` poussé sur `nashflow28/ZonZon` ✅.
- Deploy Fly.io : `flyctl deploy` terminé avec succès, 2 machines `zonzon-backend` healthy ✅.
- APK rebuild en cours (avec `--dart-define=SENTRY_DSN=...`).

#### Sentry DSNs configurés
| Projet | DSN |
|--------|-----|
| Backend Node.js | `https://57f59766a14c7d6f0ed519bb39e65889@o4511315040337920.ingest.de.sentry.io/4511324246245456` (secret Fly.io `SENTRY_DSN`) |
| Flutter mobile | `https://5b733a06f8e026418f487fe2335679b3@o4511315040337920.ingest.de.sentry.io/4511324268724304` (via `--dart-define=SENTRY_DSN`) |
| Angular admin | `https://73be5b88715e85b16f8ac95860977fe6@o4511315040337920.ingest.de.sentry.io/4511324274884688` (dans `environment.prod.ts`) |

### Session 20 (2026-06-02) — Pause infra Fly.io
- Facture Fly.io mai 2026 = **$7.46** (CPU shared $2.55 + RAM additionnelle $4.91 + bandwidth $0). Coût normal d'une VM idle 24/7 avec `min_machines_running=1` + `auto_stop_machines='off'` (config nécessaire pour Socket.IO live).
- **Backend suspendu** : `flyctl scale count 0 --app zonzon-backend` → machine `781425db176648` détruite. App, secrets, hostname et config préservés. Coût mensuel = $0 tant que `count=0`.
- **Pour reprendre** : `flyctl scale count 1 --app zonzon-backend` (+ `flyctl deploy` si nouvelle version à pousser).
- **Autres services audités** (aucun risque immédiat) : TiDB Cloud (free serverless, auto-pause si idle), Cloudflare Pages (free tier large), Firebase FCM (Spark gratuit), OpenRouteService (free 2K req/jour, pas de CB), Sentry (Developer free 5K events/mois, pas de CB), GitHub Actions (2000 min/mois, pas de CB par défaut). À vérifier régulièrement : `Settings → Billing` GitHub + Sentry pour confirmer absence de CB.

### Session 19 (2026-05-04) — Refonte UX multi-commandes client + DriverShell 3 onglets

#### Contexte
Demande UX en deux axes :
1. **Multi-commandes client** : supprimer le blocage de l'UI sur une seule commande active, passer à un shell 4 onglets avec suivi par orderId et limite de 5 commandes parallèles.
2. **DriverShell** : ajouter un 3ème onglet "Mes courses" entre Radar et Profil.

#### Phase 1 — OrderSocketController multi-room
- `String? activeOrderId` remplacé par `Set<String> _watchedOrderIds` dans `mobile_app/lib/controllers/order_socket_controller.dart`.
- Méthodes ajoutées : `watchOrder(orderId)`, `unwatchOrder(orderId)`, `clearWatchedOrders()`, `_shouldEmit(orderId?)`.
- Legacy setter `set activeOrderId(String?)` maintenu pour rétro-compat livreur (livreur ne définit jamais le set → tous les events passent).

#### Phase 2 — ActiveOrdersStore (ChangeNotifier)
- Nouveau fichier `mobile_app/lib/services/active_orders_store.dart`.
- `bootstrap(socketCtrl)` : charge `GET /orders/mine` (filtré sur statuts actifs ≤ 5) + subscribe aux streams socket.
- `onOrderCreated(raw)` / `onOrderCancelled(orderId)` : mutations + `notifyListeners()`.
- Constante `maxActiveOrders = 5`.

#### Phase 3 — OrderTrackingScreen
- Nouveau fichier `mobile_app/lib/screens/order_tracking_screen.dart`.
- Reçoit `orderId` en paramètre constructeur.
- Lit l'état initial depuis `ClientServices.activeOrders.findById(orderId)`.
- Tous les streams filtrés : `.where((e) => e.orderId == widget.orderId)`.
- ETA polling 30s + refresh sur `driverPosition$` et `IN_PROGRESS`.

#### Phase 4 — ClientShellScreen + 4 onglets
- Nouveau `mobile_app/lib/screens/client/client_shell_screen.dart` : boot `ClientServices` au `initState`, badge rouge sur l'onglet Commandes quand `isAtLimit`.
- Nouveau `mobile_app/lib/screens/client/home_tab.dart` : formulaire pur + `AutomaticKeepAliveClientMixin` + écoute `pendingShopSelection` ValueNotifier.
- Nouveau `mobile_app/lib/screens/client/orders_tab.dart` : `AnimatedBuilder` sur `ActiveOrdersStore`, cartes avec badges de statut, tap → `OrderTrackingScreen`.
- Nouveau `mobile_app/lib/screens/client/shops_tab.dart` : wrapper `ShopListScreen` + callback `onProductSelected` → `pendingShopSelection.value`.
- Modification `mobile_app/lib/screens/shop_list_screen.dart` : paramètres `onProductSelected` + `hideBackButton`.
- Nouveau registre statique `mobile_app/lib/services/client_services.dart` (socket + store + `ValueNotifier<PendingShopSelection?>`).

#### Phase 5 — Suppression anciens fichiers + adaptation router
- `lib/order_screen.dart` et `lib/home_screen.dart` supprimés.
- `lib/router/app_router.dart` réécrit : constantes `clientHome/clientOrders/clientShops/clientProfile`, `StatefulShellRoute.indexedStack` 4 branches, route tracking `:orderId` avec `parentNavigatorKey: _rootNavKey`.
- `lib/screens/client_profile_screen.dart` : `ClientServices.reset()` avant le logout.

#### Phase 6 — DriverShell 3 onglets
- `lib/driver_screen.dart` : `IndexedStack` à 3 enfants (`_buildRadar()` / `OrderHistoryScreen(embedInTab: true)` / `DriverProfileScreen()`), bottom-nav 3 items, méthode `_currentTabTitle()`.
- `lib/screens/order_history_screen.dart` : paramètre `embedInTab` — quand `true`, retourne directement le body sans `Scaffold`/`AppBar`.

#### Tests d'intégration mis à jour
- `integration_test/create_order_flow_test.dart` : remplace `OrderScreen` par `HomeTab`.
- `integration_test/home_screen_smoke_test.dart` : 3 tests directs `HomeTab / DriverScreen / MerchantHomeScreen` (l'aiguillage par rôle est maintenant dans `_globalRedirect`, non testable en smoke test sans mock auth).

#### Vérifications finales
- `flutter analyze` : 10 issues, TOUTES préexistantes (geolocator `desiredAccuracy`, Sentry `attachViewHierarchy`, unreachable switch default, library prefixes, unnecessary cast, string interpolation). Zéro issue introduite.
- `flutter test test/` : 10/10 passent.

#### Hors scope (validé mais non commencé)
- Backend machine à états élargie pour la validation commerçant (PENDING → MERCHANT_CONFIRMED → broadcast livreurs).
- Chat tri-participant (C↔M, C↔L, M↔L).
- Inbox commerçant (notifications commandes entrantes).

### Session 22 (2026-07-04) — Audit codex complet + corrections (Findings #1 à #8)

> Audit par triangulation des 3 stacks (backend, mobile, admin). 9 findings classés. Correctifs appliqués via 3 agents parallèles (1 par stack) + corrections manuelles. Verdict initial : FAIL (escalade ADMIN + suivi client cassé). Après correctifs : findings bloquants résolus. Seul reste ouvert le #6 (période de commission `createdAt` vs `completedAt`) — décision métier `TO_VALIDATE`, non corrigé volontairement.

#### Backend — Findings #1, #3, #4, #5, #7

- **Finding #1 (CRITICAL) — Escalade de privilèges à l'inscription** : `POST /v1/auth/register` acceptait n'importe quel `role`, y compris `ADMIN`.
  - `backend/src/auth/dto/register.dto.ts` : `@IsEnum(UserRole)` remplacé par `@IsIn(REGISTRABLE_ROLES)` où `REGISTRABLE_ROLES = [CLIENT, LIVREUR, COMMERCANT]` (ADMIN explicitement exclu). Nouveau type `RegistrableRole` exporté.
  - `backend/src/auth/auth.service.ts` : garde défensive en tête de `register()` — `if (dto.role === UserRole.ADMIN) throw new ForbiddenException(...)`. Defense in depth : même si le DTO est un jour modifié par erreur, le service refuse quand même.
  - Test ajouté dans `backend/src/auth/auth.service.spec.ts` : `register()` avec `role: ADMIN` → `ForbiddenException`, aucun accès DB (`findByPhone`/`createWithPassword` non appelés).
  - Rétro-compatible : CLIENT/LIVREUR/COMMERCANT + `vehicleType` optionnel pour LIVREUR inchangés.
- **Finding #5 (MEDIUM) — `chat:join` sans contrôle d'appartenance** : n'importe quel user authentifié pouvait rejoindre `order:<id>:chat` et lire les messages d'une commande qui ne le concernait pas.
  - `backend/src/orders/orders.gateway.ts` : injection de `@InjectRepository(DeliveryOrder)` directement dans `OrdersGateway` (pas de cycle avec `OrdersService` — `DeliveryOrder` est déjà dans `TypeOrmModule.forFeature` de `OrdersModule`). Nouvelle méthode privée `isUserPartyToOrder(orderId, userId, role)` (ADMIN autorisé sans requête DB ; sinon vérifie `order.client.id`/`order.livreur.id`). `handleChatJoin` passe en `async`, ne join la room que si autorisé, sinon log un warning et ignore silencieusement.
  - Tests ajoutés dans `backend/src/orders/orders.gateway.spec.ts` (mock du repository) : client autorisé, livreur autorisé, admin autorisé (sans requête DB), intrus refusé, commande introuvable refusée, pas de user authentifié refusé, `orderId` manquant no-op.
- **Finding #7 (INFO) — route morte** : `POST /reports/commissions/:id/pay` (`payCommission`) dupliquait `mark-paid` sans être appelée nulle part (grep exhaustif backend/admin-dashboard/mobile_app : aucun appelant). Supprimée de `backend/src/reports/reports.controller.ts`, `mark-paid` conservée intacte.
- **Finding #4 (MEDIUM) — test scaffold obsolète** : `backend/src/app.controller.spec.ts` testait `appController.getHello()` qui n'existe plus. Réécrit pour tester `getHealth()` (vérifie `{status: 'ok', uptime, timestamp, env}` via `expect.objectContaining`).
- **Finding #3 (HIGH) — vulnérabilités npm** : `npm audit fix` (sans `--force`) lancé dans `backend/`. Résultat : 40 → 18 vulnérabilités (ws/socket.io/engine.io, qs, typeorm SQL injection orderBy, protobufjs corrigés). Restent volontairement non corrigées (nécessitent `--force`/breaking changes) : `multer` (upgrade impliquerait `@nestjs/core@7.5.5`, régression majeure), `uuid` (upgrade impliquerait `firebase-admin@14.1.0`, breaking). `backend/package-lock.json` mis à jour.
- **Vérification finale** : `npm run build` OK. `npx jest` → **120/120 tests passent** (était 110 avant cette session : +10 nouveaux tests répartis entre `chat:join` et la garde ADMIN de `register`).
- **Hors scope** : pas de mise à niveau forcée des deps restantes (`multer`, `uuid`/`firebase-admin`) — à planifier séparément avec tests de non-régression dédiés vu le risque de breaking change.

#### Mobile — Finding #2

- **Problème (HIGH)** : `OrderTrackingScreen._refreshDetails()` (écran CLIENT) appelait `GET /orders`, route protégée par `@Roles(UserRole.ADMIN, UserRole.LIVREUR)` dans `backend/src/orders/orders.controller.ts:46` → 403 pour un CLIENT. En plus, `OrdersService.findAll` renvoie désormais un objet paginé `{items, total, page, limit, hasMore}` et non un array brut, donc même en cas de succès le parsing `if (list is! List) return;` faisait sortir la méthode silencieusement.
- **Correctif** : `mobile_app/lib/screens/order_tracking_screen.dart` — remplacé `_api.get('/orders')` par `_api.get('/orders/mine')` (ligne ~213) + mise à jour du commentaire de doc de `_refreshDetails()`. `GET /orders/mine` n'a pas de restriction de rôle et `OrdersService.findForUser` pour un CLIENT retourne un `find(...)` (array brut, relation `livreur` incluse) → le reste de la logique (`firstWhere`, extraction livreur/statut) reste valide sans autre changement.
- **Vérification exhaustive** : recherche de tous les `_api.get('...orders...')` dans `mobile_app/lib/` — aucun autre écran CLIENT n'appelle `GET /orders` brut. `driver_screen.dart` utilise `/orders/available` (LIVREUR, légitime), `active_orders_store.dart` et `order_history_screen.dart` utilisent déjà `/orders/mine`, `chat_service.dart`/`eta_service.dart` utilisent des sous-routes `/orders/:id/...` sans rapport.
- **Vérifications finales** : `flutter analyze` → 10 issues, toutes préexistantes (aucune nouvelle). `flutter test test/` → 10/10 ✅.

#### Admin — Finding #3

- **Vulnérabilités npm** : `npm audit fix` (sans `--force`) dans `admin-dashboard/`. Résultat : **25 → 13 vulnérabilités**. Corrigé : chaîne `ws` (via `engine.io-client`/`socket.io-client`, memory disclosure + DoS), `qs`, `sigstore`, `tar`. Restent volontairement (nécessitent bump majeur Angular/vite, breaking, + outillage build/dev non exposé en prod) : Angular core/compiler, `@angular/build`, `esbuild`, `piscina`, `undici`, `vite`/`launch-editor`, `@babel/core`. Seul `package-lock.json` modifié. Build prod OK (warnings NG8107 + budget bundle préexistants uniquement).

#### Doc — Finding #8

- Correction du tableau des rôles dans `PROGRESS.md` : le rôle marchand était documenté `MARCHAND` alors que le code utilise partout `COMMERCANT` (enum `UserRole`, mobile, router). Aligné sur `COMMERCANT`.

#### Non corrigé (volontaire)

- **Finding #6 (LOW, `TO_VALIDATE`)** : `ReportsService.weeklyReport` filtre les commissions par `createdAt` alors qu'une course peut être complétée une autre semaine (`completedAt` existe désormais). Décision métier à trancher avant correction.

### Session 17 (2026-05-01) — Sentry + monitoring + go_router + json_serializable + CI/CD

#### Backend
- **Health check amélioré** : `AppService.getHealth()` retourne `{ status: 'ok', uptime, timestamp, env }` au lieu de "Hello World!". `GET /` (non préfixé) est prêt pour UptimeRobot/BetterStack avec keyword `"ok"`.
- **Sentry intégré (backend)** : `@sentry/nestjs` + `@sentry/profiling-node` installés. Init conditionnelle sur `process.env.SENTRY_DSN` (inactif si non défini → développement non impacté). `tracesSampleRate`/`profilesSampleRate` à 0.1 en prod, 1.0 en dev. `SentryGlobalFilter` ajouté comme filtre global pour capturer les exceptions non gérées. `npm run build` OK.
  - **À faire** : `flyctl secrets set SENTRY_DSN="https://xxx@oXXXX.ingest.sentry.io/YYY" --app zonzon-backend`

#### Mobile (Flutter)
- **Sentry intégré (Flutter)** : `sentry_flutter: ^8.10.1` ajouté dans `pubspec.yaml` (résolu en 8.14.2). Constante `sentryDsn` dans `lib/config/env.dart` (lit `--dart-define=SENTRY_DSN`). `main()` → `Future<void>` avec `SentryFlutter.init()` conditionnel (si DSN non vide → wrap ; sinon `_runApp()` direct). Firebase background handler et `runApp` déplacés dans `_runApp()`. `flutter analyze` : 11 issues (toutes préexistantes). `flutter test test/` : 10/10 ✅.
  - **À faire** : ajouter `--dart-define=SENTRY_DSN=https://xxx@...` au build APK release.
- **json_serializable** : 6 modèles migrés. `.g.dart` générés via `dart run build_runner build --delete-conflicting-outputs`.
  - Migrations complètes : `Product`, `User`, `AuthResult`, `RatingStats` (toJson + fromJson générés).
  - Migrations partielles (`toJson` généré, `fromJson` manuel car objet imbriqué) : `Rating`, `OrderHistoryItem`, `ChatMessage`, `Shop`, `ShopCategory`.
  - Sans annotation (LatLng trop complexe) : `Place`, `SavedAddress`.
  - Nouveaux deps devDependencies : `build_runner: ^2.4.12`, `json_serializable: ^6.8.0`. Dep : `json_annotation: ^4.9.0`.
  - `flutter test test/` : 10/10 ✅.
- **go_router** (déjà documenté Session 16, migré dans cette session continue).

#### DevOps — CI/CD GitHub Actions
- **3 workflows créés** dans `.github/workflows/` :
  - `backend-ci.yml` : push/PR `backend/**` → Node.js 22 → `npm ci` → `npm run build` → `npm test` → (main only) `flyctl deploy --remote-only --app zonzon-backend`. Secret requis : `FLY_API_TOKEN`.
  - `admin-ci.yml` : push/PR `admin-dashboard/**` → Node.js 22 → `npm ci` → `npm run build --configuration production` → (main only) `wrangler pages deploy dist/admin-dashboard/browser --project-name=zonzon-admin`. Secrets requis : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  - `flutter-ci.yml` : push/PR `mobile_app/**` → Flutter stable → `flutter pub get` → `flutter analyze` → `flutter test test/` → (main only) decode `GOOGLE_SERVICES_JSON` + `flutter build apk --release --dart-define=API_URL=https://zonzon-backend.fly.dev` → upload artifact (30j rétention). Secret requis : `GOOGLE_SERVICES_JSON` (base64 du `google-services.json`).
  - Stratégie : **tests sur tous les push/PR** (pas de condition), **déploiements sur `push main` uniquement** (`if: github.ref == 'refs/heads/main' && github.event_name == 'push'`).
- **Secrets à configurer** dans GitHub repo settings (Settings → Secrets and variables → Actions) :
  | Secret | Valeur |
  |--------|--------|
  | `FLY_API_TOKEN` | `flyctl auth token` |
  | `CLOUDFLARE_API_TOKEN` | Token API Cloudflare (Edit Cloudflare Pages) |
  | `CLOUDFLARE_ACCOUNT_ID` | ID du compte Cloudflare |
  | `GOOGLE_SERVICES_JSON` | `base64 -i android/app/google-services.json` |
