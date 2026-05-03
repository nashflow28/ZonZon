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

## Infrastructure déployée

| Service | URL / Détail | Status |
|---------|-------------|--------|
| **Backend** | `https://zonzon-backend.fly.dev` | ✅ Live |
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
| Commerçant | `MARCHAND` | Gère une boutique |
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
