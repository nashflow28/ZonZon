# Revue complète ZonZon — 26 juillet 2026

Revue exhaustive des 4 applications du monorepo (~68 000 lignes) menée par 11 agents
en lecture seule sur des zones disjointes, puis **vérification indépendante des
findings critiques** par lecture directe du code et du source des dépendances.

**Aucun fichier applicatif n'a été modifié pendant la revue.**

---

## 1. État de santé — mesuré, pas supposé

| Application | Build | Tests | Analyse |
|---|---|---|---|
| `backend` | ✅ `nest build` | ✅ **386/386** unitaires (23 suites) + **58/58 e2e** (8 suites) | — |
| `mobile_app` | ✅ | ✅ **42/42** | ✅ `flutter analyze` : **0 problème** |
| `pwa` | ✅ prod | — | — |
| `admin-dashboard` | ⚠️ prod | — | Bundle initial **611,7 kB** > budget 500 kB |

**Dépendances** : admin et PWA à 0 vulnérabilité. Backend : 7 en production (6 *high*),
toutes sur la chaîne transitive `brace-expansion → minimatch → glob → rimraf → google-gax`
(DoS de parsing) plus `typeorm` sur `migration:generate`, qui est un outil de développement.
Impact réel faible.

**Secrets** : aucun `.env`, `firebase-adminsdk.json`, keystore ou clé privée suivi par git.
Aucun secret en dur. `JWT_SECRET` protégé par de vrais garde-fous au démarrage.

**Le vert des tests ne dit rien de la sécurité** : les 444 tests passent alors que plusieurs
failles critiques sont présentes. Le repo de test en mémoire ignore `relations` et `select`,
donc **aucun test e2e ne peut détecter une sur-exposition de données**.

---

## 2. Synthèse

**~235 findings** : ~22 critiques, ~87 majeurs, ~90 mineurs, ~36 améliorations.

Les 9 findings ci-dessous ont été **vérifiés ligne par ligne** par mes soins, pas seulement
rapportés. Ce sont ceux qui doivent être traités en premier.

---

## 3. Critiques vérifiés

### 3.1 🔴 Sentry Session Replay enregistre les pièces d'identité des livreurs

**Fichier** : `admin-dashboard/src/main.ts:13-16`

```ts
Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
...
replaysSessionSampleRate: 0.1,
```

Vérifié :
- Le DSN est **actif en production** (`admin-dashboard/src/environments/environment.prod.ts:5`)
- `maskAllText: false` → tout le texte du DOM est capturé (noms, téléphones, adresses,
  contenu des conversations client↔livreur affiché dans le panneau de détail)
- `blockAllMedia: false` → **les images aussi**
- `replaysSessionSampleRate: 0.1` → 10 % des sessions admin enregistrées **en continu**,
  pas seulement en cas d'erreur
- `driver-validation.component.ts:186` (`preloadIdCardPhotos`) charge **automatiquement les
  CNI de tous les livreurs en attente** dès l'ouverture de l'écran, sans aucun clic

Le backend protège pourtant ce champ avec soin : `select: false` sur la colonne, bucket privé,
accès restreint à l'admin ou au propriétaire. **Cette protection est intégralement annulée
côté navigateur** : des cartes d'identité togolaises peuvent être transmises et conservées
chez un tiers (Sentry, région DE).

**Correctif** : `maskAllText: true`, `blockAllMedia: true`. Charger la CNI à la demande
plutôt qu'en préchargement. Enjeu réglementaire autant que technique.

---

### 3.2 🔴 Un client peut geler définitivement sa propre commande

**Fichiers** : `backend/src/orders/orders.controller.ts:137`, `orders.service.ts:67,106,1472`

Chaîne d'exploitation complète, vérifiée aux 4 maillons :

1. `@Patch(':id/status')` **n'a aucun `@Roles`** → tout utilisateur authentifié y accède
2. Le contrôle d'acteur autorise `isClient` (`:1472`)
3. `ALLOWED_TRANSITIONS[PENDING]` contient `ACCEPTED` (`:67`)
4. `LIVREUR_ONLY_STATUSES` **ne contient pas** `ACCEPTED` (`:106`)

Un client envoie `PATCH /v1/orders/<id>/status {"status":"ACCEPTED"}`. La commande passe à
`ACCEPTED` **avec `livreur = null`**. Conséquences en cascade :

- `findAvailable` filtre sur `PENDING` → la course devient invisible pour tous les livreurs
- `acceptOrder` renvoie 409 (l'`UPDATE` conditionnel exige `status = 'PENDING'`)
- Depuis `ACCEPTED`, plus aucune transition n'est possible : `LIVREUR_ONLY_STATUSES` bloque
  le client, et `isLivreur` est faux pour tout le monde puisque `livreur` est `null`

La commande est morte. Seul un admin peut la débloquer. Le même vecteur permet à un client de
geler la livraison d'un commerçant — qui, lui, ne peut même pas l'annuler (voir §4.1).

**Correctif** : ajouter `ACCEPTED` à `LIVREUR_ONLY_STATUSES`, ou mieux, modéliser la table de
transitions sous la forme `{ from, to, actors }` — c'est précisément la dispersion de la
logique d'autorisation entre trois structures qui a laissé passer ce trou.

---

### 3.3 🔴 Le jeton de preuve OTP est utilisable comme jeton d'accès

**Fichiers** : `backend/src/auth/whatsapp-otp.service.ts:98-101`, `auth/jwt.strategy.ts:20-26`,
`users/users.service.ts:420`

Trois défauts qui se combinent :

1. Le `verificationToken` est signé avec **le même `JwtService`, donc le même `JWT_SECRET`**
   que les jetons d'accès, et sa payload `{ purpose, phone }` **n'a pas de `sub`**
2. `JwtStrategy.validate(payload: any)` appelle `findOne(payload.sub)` **sans jamais vérifier
   que `sub` existe**
3. `UsersService.findOne(undefined)` ne lève pas

Pour le point 3, j'ai lu le source de **TypeORM 0.3.30 installé** :
- `EntityManager.findOne` ne lève que si `options.where` est falsy — `{ id: undefined }` est
  truthy, donc pas d'erreur
- `SelectQueryBuilder` ligne 2496 : `invalidWhereValuesBehavior.undefined` vaut `"ignore"`
  par défaut → la condition est **omise du WHERE**
- `invalidWhereValuesBehavior` **n'est pas configuré** dans `app.module.ts`

Résultat : `SELECT ... WHERE deletedAt IS NULL LIMIT 1` → **le premier utilisateur de la
table**, souvent le compte admin historique.

**Précondition** : `WHATSAPP_OTP_ENABLED=true`. Aujourd'hui `false` dans `.env.example`.
C'est donc une **faille latente, armée au prochain déploiement Meta**.

**Correctif** : secret dédié + `audience` pour le jeton de preuve, et refus de toute payload
sans `sub` dans `validate()` (défense en profondeur indispensable dans les deux cas).

---

### 3.4 🔴 `GET /orders` expose toute la base de commandes à n'importe quel livreur

**Fichier** : `backend/src/orders/orders.controller.ts:87`

```ts
@Roles(UserRole.ADMIN, UserRole.LIVREUR)
@Get()
findAll(@Query() query: ListOrdersDto) { return this.ordersService.findAll(query); }
```

`findAll` ne filtre que sur `status` et `createdAt` — **aucun filtre par acteur** — et charge
`relations: ['client','livreur','merchant','run']`. Un livreur pagine et aspire toutes les
livraisons de la plateforme : adresses, `clientPhone`, `clientName`, prix, plus les entités
`User` complètes des clients et commerçants.

Vérifié : **aucun front n'appelle cette route côté livreur**. Le retrait de `UserRole.LIVREUR`
est sans régression fonctionnelle.

---

### 3.5 🔴 `orderAccepted` diffuse la commande complète à tous les livreurs connectés

**Fichier** : `backend/src/orders/orders.gateway.ts:328`

```ts
const payload = { orderId, livreurId, livreur, order };
this.server.to(`role:${UserRole.LIVREUR}`).emit('orderAccepted', payload);
```

`order` est l'entité chargée avec toutes ses relations. Chaque acceptation diffuse donc à
**tous les livreurs connectés** : adresses de retrait et de livraison, téléphone et nom du
client, prix, et l'identité complète du livreur gagnant. Un livreur n'a qu'à laisser son socket
ouvert pour collecter en continu le carnet clients et le plan de charge de la concurrence.

C'est la même fuite qu'en §3.4, mais **en temps réel et sans même appeler une route HTTP**.

**Correctif** : n'émettre que `{ orderId, taken: true }` vers `role:LIVREUR` — l'objectif est
seulement de retirer la carte du radar — et réserver le payload riche aux rooms `user:`.

---

### 3.6 🔴 PWA : la tab bar iOS a 15 px de hauteur utile

**Fichiers** : `pwa/src/app/shared/tab-bar/tab-bar.component.ts:21,40`, `pwa/src/styles.css:28,96`

`height: 50px` + `box-sizing: border-box` global + `.zz-safe-bottom { padding-bottom: env(safe-area-inset-bottom) }`.
Sur iPhone à home indicator (34 px), la boîte de contenu vaut `50 − 1 − 34 = 15 px` pour une
icône de 24 px et un libellé de 10 px.

Icônes et libellés débordent sur la barre d'accueil, et **la cible tactile fait 15 px de haut**
contre les 44 px exigés par les HIG — sur l'élément de navigation principal des trois espaces.
Invisible sur simulateur non encoché (safe area = 0), d'où un bug qui passe en développement.

**Correctif** : `height: calc(50px + var(--zz-safe-bottom))`.

Deux agents indépendants ont trouvé ce défaut. Le même mécanisme (une règle de composant qui
écrase une classe utilitaire globale par spécificité) touche aussi **le header des 3 shells** et
**les écrans Login/Register** : le grand titre passe sous l'encoche.

---

### 3.7 🔴 Mobile : se tromper de mot de passe déconnecte l'utilisateur

**Fichiers** : `mobile_app/lib/services/api_client.dart:105`,
`mobile_app/lib/widgets/change_password_dialog.dart:33,75`,
`backend/src/auth/auth.service.ts:103`

`ApiClient._send()` traite **tout** 401 comme une session expirée → `handleUnauthorized()` →
purge du JWT, suppression du token FCM, `dispose()` du socket, redirection vers `/login`.

Or le backend renvoie **401** pour « Mot de passe actuel incorrect », et le dialogue de
changement de mot de passe passe bien par `ApiClient` (vérifié aux deux extrémités).

L'utilisateur se trompe d'une lettre → il est déconnecté et **ne reçoit plus aucune
notification** jusqu'à sa prochaine connexion. Pour un livreur en course, c'est une perte de
session en pleine livraison.

**Correctif** : côté backend, renvoyer 403 (ou 400) pour un mot de passe actuel invalide et
réserver 401 à l'authentification du porteur. C'est le correctif le plus propre : il vaut pour
tous les clients.

---

### 3.8 🔴 Mobile : le socket meurt définitivement après ~40 s de coupure

**Fichiers** : `mobile_app/lib/controllers/order_socket_controller.dart:230,350`, `main.dart:66`

`setReconnectionAttempts(8)` avec un backoff plafonné à 5 s. Vérifié dans le source du package
`socket_io_client-3.1.4` : passé ce seuil, `reconnecting = false` et **plus aucune tentative
automatique n'a lieu**. Le seul chemin de reprise est `resynchronize()`, appelé uniquement sur
`AppLifecycleState.resumed`.

Un livreur perd la 4G plus de ~40 s (tunnel, zone blanche, bascule Wi-Fi→données). L'app reste
au premier plan, le réseau revient — **rien ne se reconnecte**. Le GPS n'arrive plus au serveur,
le client et le commerçant voient la position figée jusqu'à la fin de la course.

Aggravant : `emitDriverLocation()` n'est pas marqué `volatile`, donc pendant la coupure les
positions **s'empilent sans limite** dans le `sendBuffer` et sont **rejouées en masse** à la
reconnexion — le backend les horodate à la réception, donc le marqueur du livreur téléporte
sur tout le trajet passé.

**Correctif** : `setReconnectionAttempts(double.infinity)` (le défaut Socket.IO), et
`if (_socket?.connected != true) return;` avant l'`emit` — une position GPS périmée n'a aucune
valeur.

---

### 3.9 🔴 Admin : les statuts de paiement `CASH_ON_DELIVERY` et `REFUNDED` n'existent pas

**Fichiers** : `admin-dashboard/src/app/orders.service.ts:43-48`,
`shared/order-detail/order-detail.component.ts:18-24`, `archives/archives.component.ts:205-214`

Le backend définit **7** `PaymentStatus`, l'admin en connaît **5**. Les deux manquants sont
`CASH_ON_DELIVERY` — le statut posé par le livreur à la livraison, **chemin nominal du paiement
cash au Togo** — et `REFUNDED`.

Conséquences vérifiées :
- Archives : la colonne Paiement affiche **« — »** pour une course pourtant encaissée
- Détail : le `<select>` n'a aucune `<option>` correspondante → **champ visuellement vide**
- L'admin, voyant un champ vide, sélectionne une valeur. Le backend accepte tout pour un ADMIN
  (`if (!isAdmin)` court-circuite les règles de transition) → **l'encaissement cash confirmé
  par le livreur est écrasé**

**Correctif** : ajouter les deux valeurs aux 4 emplacements, et typer les maps en
`Record<PaymentStatus, …>` pour que le compilateur détecte le prochain oubli.

---

### 3.10 🔴 La recherche de client du commerçant renvoie 400 en permanence

**Fichiers** : `backend/src/orders/dto/search-merchant-clients-query.dto.ts:15-19`,
`mobile_app/lib/services/merchant_orders_service.dart:269-278`, `backend/src/main.ts:88`

Le champ `limit` porte `@IsOptional() @IsInt() @Min(1) @Max(20)` **sans `@Type(() => Number)`**.

Vérifié aux 4 maillons :
- Le `ValidationPipe` global a `transform: true` mais **pas** `enableImplicitConversion`
  (`main.ts:88-93`, confirmé par grep sur tout `src/`)
- Les 5 autres DTO de query du projet ont tous `@Type(() => Number)` — `list-orders.dto.ts`
  porte même un commentaire expliquant que la conversion dépend des décorateurs
- Sans `@Type`, `limit` reste la **chaîne** `'8'` → `@IsInt()` échoue → **400**
- Le mobile envoie `limit=8` **par défaut et systématiquement**
  (`searchClients(String query, {int limit = 8})` → `?query=…&limit=$limit`)

Un commerçant tape ≥ 2 caractères dans le champ « client » → 400 → `MerchantOrderException`.
**La recherche de client existant n'a jamais fonctionné en production.** Aucun test e2e ne
couvre cette route.

C'est précisément la fonctionnalité signalée comme « non traitée » à la fin d'une session
antérieure : elle a bien été implémentée, mais elle est cassée par un décorateur manquant.

**Correctif** : ajouter `@Type(() => Number)` sur `limit`, à l'identique de
`list-orders.dto.ts:20-25`. Une ligne. Puis un test e2e sur cette route.

---

## 4. Majeurs structurants

### 4.1 Métier — le commerçant est le parent pauvre

| Problème | Fichier |
|---|---|
| Le commerçant créateur **ne peut pas annuler** sa propre livraison (`isMerchant` absent du contrôle d'acteur — seul endroit du code où il est oublié). Un test e2e contourne le 403 via un admin au lieu de le signaler. | `orders.service.ts:1469` |
| Le livreur ne peut **jamais confirmer un encaissement espèces** depuis la PWA : l'écran est en lecture seule. La chaîne d'encaissement est bloquée de bout en bout. | `pwa/.../driver/delivery-detail` |
| Le panneau paiement commerçant propose **7 statuts, dont 5 refusés** par le backend. | `pwa/.../merchant/delivery-detail.component.ts:17` |
| Le prix peut être **modifié après acceptation**, sans consentement ni notification du livreur (aucun `broadcastPriceUpdate` n'existe). Plancher à `@Min(0)`. | `orders.service.ts:1924` |
| Annulation client en `NEAR_CLIENT` : le livreur a le colis, il est à 200 m — **il ne pourra jamais être payé** (`updatePaymentStatus` exige `COMPLETED`, devenu inatteignable). | `orders.service.ts:86,1770` |

### 4.2 Concurrence et intégrité

- **`updateStatus` est un read-then-write sans garde** : pas de transaction, pas de clause
  `WHERE status = :previous`. « Livré » et « Annuler » simultanés → deux écritures, dernière
  gagne, `completedAt` renseigné sur une course `CANCELLED`. `acceptOrder`, lui, est exemplaire
  (verrou pessimiste + `UPDATE` conditionnel) — l'asymétrie est le problème.
- **Le test e2e « atomicité » ne prouve rien** : la transaction est un passthrough, le verrou
  est ignoré, les requêtes sont séquentielles. Le helper l'admet en commentaire.
- **Le repo de test avale les opérateurs inconnus** (`default: return true`) : un filtre de
  sécurité non reconnu laisse passer toutes les lignes, et les tests restent verts.

### 4.3 Base de données

- **La production est le seul environnement qui exécute les migrations.**
  `synchronize: NODE_ENV !== 'production'` est **fail-open** : toute valeur autre que
  `'production'` exacte déclenche un `ALTER TABLE` automatique par TypeORM. Les migrations
  tournent au boot, sans `release_command`, et ne sont pas idempotentes : une migration
  multi-instruction qui échoue à mi-parcours **empêche l'app de redémarrer, définitivement**.
- ~~**`1778500000000-AddExtendedOrderStatuses` insère des valeurs d'enum au milieu de la liste.**
  TiDB restreint le `MODIFY ENUM` à l'ajout en fin.~~
  **✅ VÉRIFIÉ EN PRODUCTION le 26/07/2026 — risque écarté.** `SHOW COLUMNS` renvoie bien les
  9 valeurs :
  `enum('PENDING','ACCEPTED','EN_ROUTE_PICKUP','AT_PICKUP','IN_PROGRESS','NEAR_CLIENT','COMPLETED','CANCELLED','FAILED')`.
  TiDB a accepté le réordonnancement. Confirmation fonctionnelle : une commande `FAILED` existe
  en base. Les 36 migrations sont appliquées.
  ⚠️ Ne pas en conclure que le réordonnancement est sûr en général — la prudence reste de
  n'ajouter qu'en fin de liste (c'est ce que fait `1780900000000`).
- **`AddShortTripPricing` écrase inconditionnellement `minPriceFcfa`** — la valeur réglée par
  l'admin est perdue au déploiement.
- **Aucun index sur `delivery_orders(status, createdAt)` ni `users(role, driverApprovalStatus,
  isAvailable)`** : le radar livreur et chaque création de course font un *full scan*.
- **Les `ON DELETE CASCADE` sur `users` sont morts** : `User` est en soft-delete, donc aucun
  `DELETE` physique ne survient jamais. La boutique d'un commerçant supprimé reste publique.
- Bon point notable : **zéro colonne d'entité absente des migrations, zéro migration orpheline**,
  15 enums TS↔SQL synchronisés, 36 migrations avec `down()` et grandfathering systématique.

### 4.4 Confidentialité

- **Trilatération de la position des livreurs** : `GET /orders/available-drivers` renvoie une
  `distanceKm` précise à 10 m depuis des coordonnées librement fournies par l'appelant. Trois
  requêtes suffisent à localiser exactement un livreur, sans aucune course en cours — ce qui
  contourne le « GPS strict » pourtant bien implémenté dans le gateway.
- **IDOR sur le token FCM** : `deleteByToken` ne filtre pas sur `userId`. Un utilisateur
  authentifié peut supprimer le token d'un autre et **le priver de toute notification**.
- **`ContentType` d'un upload = valeur envoyée par le client**, avec cache public immuable d'un
  an. Un fichier nommé `.jpg` avec `Content-Type: text/html` devient une page HTML hébergée sur
  le domaine média.
- **Pièces d'identité legacy** : `openIdCardAsset` gère encore des URL absolues et des chemins
  `/uploads/` — l'héritage d'avant le durcissement. Aucune migration de nettoyage n'existe.
  À auditer en base : `SELECT id, idCardPhotoUrl FROM users WHERE idCardPhotoUrl NOT LIKE 'identity/%'`.
- **La consultation d'une CNI par un admin n'est pas auditée** — aucune action de ce type dans
  `AuditAction`.

### 4.5 Session

- **Un compte suspendu garde un accès complet jusqu'à 7 jours** : `JwtStrategy.validate` ne
  vérifie que l'existence de l'utilisateur, jamais son `status`. La suspension n'est effective
  que sur la création/acceptation de commandes.
- **Le changement de mot de passe n'invalide aucune session existante** — le geste réflexe après
  une compromission est sans effet.
- **Rate limiting probablement inopérant derrière Fly.io** : aucun `trust proxy` dans `main.ts`,
  donc `req.ip` est l'adresse du proxy et **tous les utilisateurs partagent le même compteur**.
  Le login serait plafonné à 5 tentatives/minute pour la plateforme entière.
  *À confirmer* en loguant `req.ip` et `req.headers['fly-client-ip']` en production.

### 4.6 Notifications

- **`void this.notifications.sendToUser(...)` sans `.catch()`** alors que `sendToUser` n'est pas
  rejet-safe. Sur Node 22, une *unhandled rejection* **termine le process**. Un timeout TiDB
  pendant un envoi de message redémarre la VM et fait tomber toutes les connexions Socket.IO.
  Le même fichier documente pourtant ce danger 50 lignes plus haut pour un autre hook.
- **Le fallback `User.fcmToken` legacy peut délivrer un message privé au téléphone d'un autre
  utilisateur** (téléphone partagé ou revendu — courant sur le marché visé).
- **PWA** : `orderAccepted` étant diffusé à tous les livreurs (§3.5), le pont de notifications
  affiche « Un livreur a accepté **votre** course » à **tous les livreurs**, à chaque acceptation.

---

## 5. Affichage et UI/UX

### 5.1 Crashs et écrans morts

| Symptôme | Fichier |
|---|---|
| **Crash définitif du profil** si le prénom ou le nom est vide : `('')[0]` → `RangeError`. Auto-infligé : le formulaire n'a aucune validation et le DTO backend accepte la chaîne vide. L'utilisateur ne peut même plus revenir corriger son nom. | `client_profile_screen.dart:294`, `driver_profile_screen.dart:521`, `merchant_profile_screen.dart:314` |
| **Un ADMIN connecté sur le mobile atterrit sur l'accueil client** (`default: return clientHome`) et enchaîne les 403 opaques. | `app_router.dart:68` |
| **Le modèle `User` Dart ignore `status`** : une suspension en cours de session est invisible côté app. | `models/user.dart` |
| **PWA — un livreur validé reste bloqué sur « En attente »** : `approvalStatus` vient du `localStorage`, `fetchMe()` n'est appelé que depuis l'écran Profil. Il ne verra jamais aucune course tant qu'il n'ouvre pas cet onglet par hasard. | `pwa/.../driver/radar.component.ts:39` |
| **PWA — chaque message de chat s'affiche en double** (écho serveur + insertion locale, et double room côté destinataire) → clés dupliquées, `@for … track m.id` cassé. | `pwa/.../chat.component.ts:203,235` |
| **PWA — le pull-to-refresh empêche de remonter dans la liste** : la directive lit `scrollTop` sur un élément qui n'est pas le conteneur scrollable, donc toujours 0 → `preventDefault()` annule le scroll natif vers le haut. | `pull-to-refresh.directive.ts:73` |

### 5.2 Débordements confirmés par structure de widget

Tous justifiés par des largeurs calculées sur 320/360 dp, cibles réelles du marché togolais :

- En-tête « ZonZon Express » de l'accueil client : `Row` non flexible dans un `Positioned`
  à largeur fixe — déborde dès `textScaler` 1.1
- Bouton « Discuter avec `<prénom>` » : prénoms composés (« Komlan-Édoh ») très courants
- Carte de course du radar : `formatFcfa(null)` renvoie « Montant à confirmer » (19 caractères),
  et `distanceKm` brut affiche littéralement **« null km »**
- Pastilles statut + paiement commerçant : « Arrivé au point de retrait » + « Payé à la
  livraison » = 301 px pour 300 px utiles
- Dialogue de course active : jusqu'à **7 boutons pleine largeur**, `AlertDialog` sans
  `scrollable: true` → « Signaler un échec » et « Annuler » deviennent inatteignables
- Cartes de commande PWA : `min-width: 0` manquant sur un flex item — l'ellipse ne se déclenche
  jamais et la page devient scrollable horizontalement

### 5.3 Le motif le plus répandu : erreur réseau = « aucune donnée »

Présent sur **au moins 8 écrans** dans les 3 fronts :

- Onglet Commandes : le store expose `lastError`, l'écran ne le lit jamais → « Aucune commande
  en cours ». Le client peut recommander en double.
- Liste des boutiques : `listPublic()` renvoie `[]` sur toute erreur → « Aucune boutique
  disponible » pendant un redéploiement. Le client conclut que ZonZon n'a aucun commerce.
- Accueil commerçant : `getMyShop()` renvoie `null` sur erreur **comme** sur 404 → écran
  d'onboarding « Créez ma boutique » à un commerçant qui en a une depuis six mois.
- Dashboard admin : `console.error` sans état d'erreur → « Aucune course en cours » + 0 FCFA
  pendant une panne. C'est le seul écran de supervision temps réel.
- Comptabilité admin : erreur et vide dans la même branche → « Aucune donnée pour cette période ».
- Stats livreurs admin : l'échec HTTP retombe sur un objet à zéro → **« 0,0 % d'annulation »
  avec un badge vert** pour tous les livreurs. Le commentaire du code promet « — », le code fait
  l'inverse.

### 5.4 Actions destructives sans garde-fou

- **Admin — modifier le tarif au km** : aucune confirmation, aucun récapitulatif. Une faute de
  frappe (2000 au lieu de 200) facture toutes les courses 10× jusqu'à ce que quelqu'un le
  remarque.
- **Admin — désactiver une zone** : `GET /zones` ne renvoie que les zones actives, donc la zone
  disparaît **définitivement** de l'interface. Le bouton « Activer » est du code mort. Seule une
  requête SQL directe permet de revenir en arrière.
- **Admin — « Marquer payée »** une commission : action financière irréversible, un clic, sans
  confirmation ni rappel du montant, et échec silencieux.
- **Admin — rejeter un livreur** : pas de confirmation, motif « optionnel » alors qu'il est
  affiché au livreur, et **aucun écran ne permet de revenir sur un refus**.
- **Admin — boutiques** : approve/reject/suspend sans callback `error`, sans `[disabled]`,
  sans confirmation. Double-clic → deux entrées d'audit.

### 5.5 Design system : `AppColors` utilisé par 1 fichier sur 40

`import 'theme/app_colors.dart'` n'apparaît que dans `widgets/status_timeline.dart`. Ailleurs,
les mêmes valeurs sont réécrites en dur : `0xFF0FB271` 45 fois dans un seul fichier, ~350
littéraux au total sur 25 fichiers.

La duplication **a déjà divergé** : `0xFFEAB308` et `0xFFF97316` pour des statuts, `0xFFFBBF24`
au lieu de `AppColors.mango`, `0xFF22414D` au lieu de `AppColors.line` (deux gris-bleus presque
identiques mais différents). Le fichier donne l'illusion d'un point de vérité unique.

Symétriquement, le **thème clair est déclaré mais jamais testé** : `phone_field.dart` fixe
`Colors.white` en couleur de texte, et l'`errorBuilder` du routeur rend du **texte blanc sur
fond blanc**. Un utilisateur Android en thème clair tape son numéro dans un champ où rien
n'apparaît.

---

## 6. Cohérence inter-applications

| Enum | Backend | Mobile | PWA | Admin |
|---|---|---|---|---|
| `OrderStatus` | 9 | ✅ 9/9 | ✅ | ⚠️ 9/9 en couleurs, **5/9 en filtre**, **4/9 en timeline** |
| `PaymentStatus` | 7 | ✅ 7/7 | ✅ | ❌ **5/7** |
| `UserRole` | 4 | ❌ **3/4** (ADMIN) | ✅ | ⚠️ 3/4 (COMMERCANT non filtrable) |
| `UserStatus` | 2 | ❌ **0/2** (champ absent) | — | ✅ |
| `DriverApprovalStatus` | 3 | ✅ | ✅ | ⚠️ **1/3 exploitable** (seuls les PENDING sont listables) |
| `AuditAction` | 10 | — | — | ❌ **6/10** (les 4 manquantes sont écrites en base et s'affichent en anglais brut) |

### 6.1 Endpoints

**Aucun appel front ne pointe vers une route inexistante ni n'utilise une mauvaise méthode HTTP**
— sur 70 routes backend et ~100 appels vérifiés. Le seul défaut de contrat est le §3.10.

7 routes backend sont **mortes** (jamais appelées par aucun front) : `GET /auth/me` (doublon
strict de `GET /users/me`), `PATCH /addresses/saved/:id`, `GET /users/:userId/ratings`,
`GET|DELETE /users/:id`, `POST /users/:id/restore`, `DELETE /vehicles/me`. Les trois dernières
sont des opérations admin destructrices sans aucun écran — à retirer ou à exposer.

### 6.2 Socket.IO

Les 9 événements sortants et 4 entrants sont cohérents en nom, casse et payload. Le gateway
n'a **aucun namespace** (racine `/`) et les 3 fronts s'y connectent correctement — contrairement
à ce qu'affirment `env.dart:8`, `PROGRESS.md:203` et `CLAUDE.md`, qui documentent un namespace
`/orders` inexistant. Sans impact runtime, mais toute personne s'y fiant cassera le temps réel.

**Trois flux temps réel sont morts :**

| Flux | Constat |
|---|---|
| **Le dashboard admin n'est pas temps réel** | Le backend n'émet **jamais** vers `role:ADMIN` (vérifié : 0 occurrence dans le gateway), et l'admin n'écoute aucun événement de commande. Le point vert « connecté » s'affiche pourtant, et les chiffres ne bougent qu'au clic manuel sur Rafraîchir. L'indicateur est activement trompeur. |
| **`chat:typing` / `chat:read` inertes dans la PWA** | Le mobile émet et écoute les deux. La PWA : 0 occurrence. Dans une conversation mobile↔PWA, l'utilisateur mobile n'a jamais de coche de lecture pour les messages lus depuis la PWA. |
| **`direct:message` écouté sans écran** | La PWA s'abonne et déclenche une notification locale, mais n'a **aucun écran de messagerie directe**. Le livreur reçoit « nouveau message » et n'a nulle part où le lire. |

### 6.3 Deux bombes à retardement de configuration

**La PWA n'implémente pas l'OTP WhatsApp.** `RegisterPayload` n'a pas de champ
`verificationToken` et aucun appel vers `/auth/otp/whatsapp/*` n'existe. Le mobile, lui, gère le
flux complet. Le jour où le template Meta est approuvé et `WHATSAPP_OTP_ENABLED` basculé à
`true`, **100 % des inscriptions PWA échoueront** en 400 « Validation WhatsApp requise », sans
aucun chemin de récupération — alors qu'Android continuera de fonctionner. Le bug apparaîtra en
production **sans le moindre changement de code**.

**La CI Flutter compile contre le mauvais backend.**
`.github/workflows/flutter-ci.yml:39` force
`--dart-define=API_URL=https://zonzon-backend.fly.dev`, ce qui **écrase** le `defaultValue`
correct de `env.dart`. La PWA et l'admin déployés parlent à OVH, l'APK produit par la CI parle
à Fly.io. Ce scénario s'est **déjà produit** (documenté dans `PROGRESS.md:397` : un APK jugé non
distribuable car la machine Fly retardait de plusieurs commits). Le `--dart-define` reproduit le
risque à chaque build.

### 6.4 Configuration

Les 3 fronts de production pointent bien sur `https://api.kore-innov.com`. Mais
**`pwa/ngsw-config.json`, `pwa/src/environments/environment.ts` et `CLAUDE.md` référencent
encore `zonzon-backend.fly.dev`** — le `dataGroup` du service worker est donc mort en
production, et tout `ng serve` local tape sur le backend de secours.

**`.env.example` couvre 27 variables sur 39 réellement lues.** Manquent notamment `DB_SSL`
(TiDB le refuse sans), `FRONTEND_URL_PATTERNS`, `SENTRY_DSN` et les 7 variables
`OBJECT_STORAGE_*`. Un environnement provisionné depuis ce fichier sert des chemins
`/uploads/*` éphémères au lieu de R2 : les photos disparaissent à chaque redéploiement.

**Résidus du retrait de la négociation de prix** : l'entité `order-price-proposal.entity.ts` et
la migration `AddOrderPriceProposals` subsistent. Une table sera créée en production pour rien.

**Longueur de mot de passe incohérente côté backend** : 6 caractères à l'inscription, 8 au
changement. Un utilisateur peut créer un compte avec un mot de passe qu'il ne pourra jamais
réutiliser. Les deux fronts valident correctement — c'est le backend qui est incohérent.

---

## 7. Ce qui est solide

La qualité de fond est réelle — les problèmes ci-dessus sont des angles morts, pas de la
négligence.

- **`acceptOrder` est exemplaire** : rechargement du livreur depuis la base (le JWT n'est jamais
  cru sur la validation), verrou pessimiste, re-contrôle sous verrou, `UPDATE` conditionnel,
  distinction correcte 404/403/409, et des commentaires qui expliquent le *pourquoi*.
- **Le « GPS strict » du gateway** : aucune position n'est relayée ni persistée sans course
  active, le forward est strictement ciblé sur les rooms concernées, avec réhydratation après
  redémarrage. **Aucune fuite de position vers les mauvais clients** — le risque n°1 de ce type
  d'application est correctement traité.
- **Cloisonnement du chat** : `chat:join` et `chat:typing` passent par une vérification en base.
  Aucun IDOR trouvé sur les endpoints de messages.
- **Matrice de paiement par acteur très rigoureuse**, avec anti-double-règlement.
- **Le prix n'est jamais influençable par le client** : `createOrder` ignore tout prix entrant.
- **Résilience externe** : ORS avec 3 tentatives, backoff, fallback Haversine, double cache 24 h.
- **Cohérence entités ↔ migrations parfaite** sur 29 entités et 36 migrations — rare à cette
  échelle, et cela élimine la classe de bug la plus coûteuse en production.
- **Défense en profondeur contre l'escalade de privilèges à l'inscription** : double barrière
  DTO + service, couverte par un test qui vérifie même l'absence d'accès à la base.
- **Zéro surface XSS** dans les 3 fronts : aucun `innerHTML`, `bypassSecurityTrust*` ou `eval`.
- **PWA** : `ChangeDetectionStrategy.OnPush` sur 100 % des composants, `100dvh` partout (jamais
  `100vh`), `prefers-reduced-motion`, `:focus-visible`, manifest complet avec icônes maskable.
- **Le service worker ne met aucune réponse d'API en cache** — le scénario « course terminée
  affichée comme active » est structurellement impossible.
- **Le web push est documenté avec une honnêteté remarquable** : le code explique ce qui ne
  marche pas (pas de VAPID, iOS ≥ 16.4 + installation obligatoire) et **bloque** plutôt que de
  promettre un abonnement qui échouerait silencieusement.
- **Mobile** : `flutter analyze` à 0 problème, JWT en `flutter_secure_storage`, parsers défensifs
  à ~95 %, token FCM enregistré au bon moment avec retry, clamp du `textScaler` à [0.85, 1.4].
- **Le tracking GPS hors course est réellement traité**, des deux côtés (garde côté app + refus
  côté backend).

---

## 8. Plan d'action

### Avant tout nouveau déploiement

1. **Masquer Sentry Session Replay** (§3.1) — 2 lignes, enjeu réglementaire.
2. **Fermer `CLIENT -> ACCEPTED`** (§3.2) — 1 ligne.
3. **Retirer `LIVREUR` de `GET /orders`** (§3.4) — 1 ligne, sans régression.
4. **Réduire le payload `orderAccepted`** vers `role:LIVREUR` (§3.5).
5. ~~**Vérifier l'enum en production**~~ ✅ **FAIT le 26/07** — les 9 valeurs sont bien
   présentes, TiDB a accepté la migration. Risque écarté (§4.3).
6. **Sauvegarder TiDB** avant le prochain déploiement. Correction : les 3 migrations que l'on
   croyait en attente **sont déjà appliquées** (36 au total en base) — elles étaient parties au
   déploiement du 14/07, `flyctl deploy` envoyant le répertoire de travail et non le commit git.
   La seule migration réellement en attente est `1780900000000-AddCommercantCancelledBy`
   (vérifié : `cancelledBy` n'a encore que 3 valeurs en base).

### Correctifs d'une ligne, à fort impact

7. **`@Type(() => Number)` sur `limit`** (§3.10) — débloque la recherche de client du
   commerçant, cassée depuis sa mise en service.
8. **Retirer `--dart-define=API_URL` de la CI Flutter** (§6.3) — le `defaultValue` est déjà
   correct, et le risque s'est déjà matérialisé une fois.

### Avant d'activer l'OTP WhatsApp — les deux ensemble, sinon rien

9. **Secret dédié pour le jeton de preuve + garde sur `payload.sub`** (§3.3). La faille est
   inerte tant que `WHATSAPP_OTP_ENABLED=false` ; elle s'arme à l'activation.
10. **Implémenter le flux OTP dans la PWA** (§6.3), sinon toutes les inscriptions iOS tombent
    le jour de la bascule.

### Fort rapport valeur/effort

11. `UsersService.findOne` : garde `if (!id)` + `invalidWhereValuesBehavior: 'throw'` (§3.3).
12. `JwtStrategy.validate` : refuser les comptes `SUSPENDED` (§4.5).
13. Backend : renvoyer 403 au lieu de 401 pour un mot de passe actuel invalide (§3.7).
14. Mobile : `setReconnectionAttempts(double.infinity)` + garde `connected` avant l'emit (§3.8).
15. Admin : ajouter `CASH_ON_DELIVERY` et `REFUNDED` (§3.9), et les 4 statuts de commande
    manquants dans le filtre, les couleurs et la timeline (§6).
16. PWA : `height: calc(50px + var(--zz-safe-bottom))` sur la tab bar, et intégrer
    `var(--zz-safe-top)` dans le `padding` des headers (§3.6).
17. Un helper `_initials()` unique, partout — 3 écrans crashent aujourd'hui (§5.1).
18. `.catch()` sur tous les `void sendToUser(...)` + rendre `sendToUser` non-rejetable (§4.6).
19. Scoper `deleteByToken` sur `userId` — IDOR sur les notifications (§4.4).
20. Confirmer l'état des pièces d'identité legacy en base (§4.4) :
    `SELECT id, idCardPhotoUrl FROM users WHERE idCardPhotoUrl NOT LIKE 'identity/%';`

### Chantiers de fond

21. **Un état d'erreur par écran** — le défaut le plus répandu de l'application (§5.3).
22. **Confirmations sur les actions destructives de l'admin** (§5.4) — un composant partagé.
23. **Index sur `delivery_orders(status, createdAt)` et `users(role, …)`** (§4.3).
24. **`synchronize: false` partout + migrations en CI + `release_command`** (§4.3).
25. **Rendre `updateStatus` atomique** (§4.2), et faire échouer le repo de test sur opérateur
    inconnu plutôt que de laisser passer silencieusement.
26. **Combler les trous du parcours commerçant** (§4.1).
27. **Migrer sur `AppColors`** et trancher sur le thème clair — aujourd'hui déclaré mais
    inutilisable (§5.5).
28. **Décider du temps réel admin** : soit émettre vers `role:ADMIN`, soit retirer
    l'indicateur « live » qui est trompeur (§6.2).

---

*Revue menée le 26/07/2026. Les findings critiques ont été vérifiés par lecture directe du code
et, pour TypeORM et Socket.IO, du source des dépendances installées. Les points marqués
« à confirmer » nécessitent une observation en production.*
