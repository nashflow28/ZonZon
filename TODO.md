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
> **Décision distribution (2026-07-10)** : Android = app Flutter native (APK, déjà réalisée — **pas de PWA Android**) ; iOS = **PWA à développer après la V1 Android** (évite compte développeur Apple + macOS). Voir CDC §5.
> Analyse d'écart complète : voir `PROGRESS.md` (section « Analyse d'écart CDC V1 »).
> **Contrainte absolue : ne rien casser** — tracking GPS, Socket.IO, FCM, messagerie client↔livreur, admin dashboard.
> Ordre d'exécution : **backend d'abord**, puis fronts (Flutter, Angular).

### 🆕 CDC V1 détaillé — audit `AUDIT_CDC_ZONZON_V1.md` (2026-07-07, conformité initiale ~68%)
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
- [x] **Post-V1 — Affiliation invite/accept** (`MerchantDriver.status`, endpoints livreur `GET/PATCH /drivers/me/affiliations`). *(2026-07-07)*
- [x] **Post-V1 — Notifs validation/refus livreur** (à l'approbation admin). *(2026-07-07)*
- [x] **Post-V1 — Tarif effectif par zone** (`basePrice`/`pricePerKmOverride` branchés dans `buildOrderPricing`). *(2026-07-07)*
- [x] **Post-V1 — Conversation multi-participants** (`Conversation`/`ConversationParticipant`, hook additif au message, endpoints `GET/POST/DELETE /orders/:id/conversation/...`, commerçant autorisé aussi sur les messages HTTP). *(2026-07-07)*
- [x] **Notifs validation/refus livreur in-app côté mobile** — notification persistée + centre de notifications + refresh de l'état livreur. *(2026-07-09)*
- [ ] **Reste (front/ops, plus tard)** : UI admin pour participants de conversation si souhaitée, déploiement prod (auth Fly/Cloudflare interactive requise).

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
- [x] **Correctifs mobile post-P3/post-V1 (2026-07-09)** — statut d’affiliation réel côté commerçant, accept/refus côté livreur, conversation multi-participants branchée côté mobile, prix manuel commerçant, statuts/paiement complets dans « Mes livraisons », paiement visible côté client, écran profil commerçant.
- [x] **Correctifs mobile post-audit (2026-07-09)** — FCM réellement initialisé après auth + navigation sur tap notification, logout auto sur 401/token expiré, détail commerçant deep-linkable et actions paiement/prix, refresh temps réel commerçant via socket, `FAILED` retiré des commandes actives client, ETA aligné sur les statuts étendus, labels paiement complétés, saisie `clientId` ajoutée dans la création commerçant. Build backend OK, `flutter test` OK, `flutter analyze` sans nouvelle erreur.
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
- [x] **Photo de pièce d'identité** — clé opaque `User.idCardPhotoUrl` (stockage privé `private_uploads/identity` / bucket privé `IDENTITY_STORAGE_*`), `POST /users/me/id-card-photo`, `GET /users/:id/id-card-photo` pour l'accès autorisé. Mobile : upload/aperçu dans l'écran Profil livreur. Admin : vignette chargée en blob authentifié + alerte si absente. *(2026-07-05, durci le 2026-07-11)*
- [x] **Zone habituelle** — `Vehicle.usualZone` (FK `Zone`), `usualZoneId` sur `PUT /vehicles/me`. Mobile : dropdown zones actives. Admin : affichée à côté du véhicule dans la validation. *(2026-07-05)*
- Vérifs : backend jest 221/221 (15 suites) ; admin build prod OK ; mobile analyze 10 (préexistantes) / test 10/10.

---

## 🔥 BUGS CRITIQUES (à corriger en priorité)

### Audit externe du 2026-07-27 — 4 affirmations sur 5 RÉFUTÉES
> ⚠️ Un rapport d'audit externe circulait avec 5 constats. Vérification faite contre le code :
> **seul le point « suppression de compte » était exact**. Ne pas rouvrir les autres. Détail et
> preuves fichier:ligne dans PROGRESS.md session 92.
- [x] **Suppression de compte in-app** *(2026-07-27)* — seul vrai bloquant Play Store. `DELETE /users/me` (ré-auth par mot de passe, anonymisation + soft-delete, 409 si course active, purge des fichiers du stockage) + bouton « Zone de danger » sur les 3 profils Flutter et PWA.
- [x] **Course annulée qui reste sur le radar livreur** *(2026-07-27)* — événement `orderUnavailable` sur transition PENDING → terminal + réconciliation périodique ajoutée au PWA. C'est le vrai bug que le rapport avait mal diagnostiqué.
- [x] **Signature release Android** *(2026-07-27)* — plus de repli silencieux sur la clé de debug, le build release échoue avec un message actionnable. ⚠️ Le job Flutter CI échouera si les secrets `ANDROID_KEYSTORE_*` ne sont pas configurés.
- [ ] **Dette RGPD restante après la suppression de compte** — `delivery_orders.clientPhone`/`clientName` non anonymisés ; `direct_messages`, `driver_positions`, signalements et ratings non purgés ; course PENDING réservée à un livreur supprimé qui reste bloquée. Voir PROGRESS.md session 92.

### 🔴 Revue complète (2026-07-26) — voir `REVUE_COMPLETE_2026-07-26.md`

**Bloquants avant tout nouveau déploiement**
- [x] Sentry admin : `maskAllText: true` + `blockAllMedia: true` (`admin-dashboard/src/main.ts:13`) — les CNI des livreurs sont capturées
- [x] Charger les CNI à la demande au lieu du préchargement (`driver-validation.component.ts:186`)
- [x] Ajouter `ACCEPTED` à `LIVREUR_ONLY_STATUSES` (`orders.service.ts:106`) — un client peut geler sa commande
- [x] Retirer `UserRole.LIVREUR` de `GET /orders` (`orders.controller.ts:87`) — aucun front ne l'appelle
- [x] Réduire le payload `orderAccepted` vers `role:LIVREUR` à `{orderId, taken}` (`orders.gateway.ts:328`)
- [ ] Vérifier en prod : `SHOW COLUMNS FROM delivery_orders LIKE 'status';` (enum inséré au milieu, TiDB)
- [ ] Sauvegarder TiDB avant déploiement (3 migrations non idempotentes en attente)

**Correctifs d'une ligne**
- [x] `@Type(() => Number)` sur `limit` (`search-merchant-clients-query.dto.ts:19`) — la recherche client commerçant renvoie 400 en permanence
- [x] Retirer `--dart-define=API_URL` de `.github/workflows/flutter-ci.yml:39` — la CI build contre le backend de secours

**Avant d'activer `WHATSAPP_OTP_ENABLED` — les deux ensemble**
- [x] Secret dédié + `audience` pour le jeton de preuve OTP, et garde sur `payload.sub` dans `jwt.strategy.ts:21`
- [x] Implémenter le flux OTP dans la PWA (sinon 100 % des inscriptions iOS tombent le jour de la bascule)

**Fort rapport valeur/effort**
- [x] `UsersService.findOne` : garde `if (!id)` + `invalidWhereValuesBehavior: 'throw'`
- [x] `JwtStrategy.validate` : refuser les comptes `SUSPENDED`
- [x] Backend : 403 au lieu de 401 pour un mot de passe actuel invalide (déconnecte l'utilisateur aujourd'hui)
- [x] Mobile : `setReconnectionAttempts(double.infinity)` + garde `connected` avant l'emit GPS
- [x] Admin : ajouter `CASH_ON_DELIVERY` et `REFUNDED` (4 emplacements)
- [x] Admin : les 4 statuts de commande manquants (filtre archives, couleurs dashboard, timeline détail) — une course FAILED reste en « courses en direct », une course NEAR_CLIENT affiche une timeline vide
- [x] PWA : `height: calc(50px + var(--zz-safe-bottom))` sur la tab bar + `--zz-safe-top` dans les headers
- [x] Helper `_initials()` unique — 3 écrans crashent sur un prénom vide
- [x] `.catch()` sur tous les `void sendToUser(...)` — une rejection non gérée tue le process
- [x] Scoper `deleteByToken` sur `userId` (IDOR notifications)
- [ ] Auditer les CNI legacy : `SELECT id, idCardPhotoUrl FROM users WHERE idCardPhotoUrl NOT LIKE 'identity/%';`
- [ ] Nettoyer les résidus de la négociation de prix (entité + migration `AddOrderPriceProposals`)
- [ ] Aligner `ngsw-config.json`, `pwa/environments/environment.ts` et `CLAUDE.md` sur `api.kore-innov.com`

**Chantiers de fond**
- [ ] Un état d'erreur par écran (8+ écrans affichent « aucune donnée » sur panne réseau)
- [ ] Confirmations sur les actions destructives de l'admin (tarif, zone, commission, refus livreur)
- [ ] Index `delivery_orders(status, createdAt)` et `users(role, driverApprovalStatus, isAvailable)`
- [ ] `synchronize: false` partout + migrations en CI + `release_command` Fly
- [ ] Rendre `updateStatus` atomique (UPDATE conditionnel comme `acceptOrder`)
- [ ] Repo de test : lever sur opérateur inconnu au lieu de `return true`
- [x] Parcours commerçant : annulation de sa propre livraison, encaissement cash côté livreur PWA
- [ ] Migrer sur `AppColors` (1 fichier sur 40 l'utilise) et trancher sur le thème clair
- [ ] Décider du temps réel admin : émettre vers `role:ADMIN` ou retirer l'indicateur « live »


- [x] **OPS — Déployer le backend temps réel/messagerie et installer l'APK** — Fly.io version 28 saine (`HTTP 200`), APK release généré puis installé et lancé via ADB sur le Samsung SM-S918B sans crash au démarrage. *(2026-07-14)*
- [x] **Temps réel et messagerie unifiée** — socket partagé avec initialisation atomique et resynchronisation au retour au premier plan, conversation directe unique par contact, contexte de course dans les messages, suppression locale des conversations et rafraîchissement ciblé commerçant. Backend build + Jest 383/383, Flutter analyze propre + tests 40/40. *(2026-07-14)*
- [x] **Suivi client — empêcher l'en-tête de masquer les contrôles de carte** — zone droite réservée au thème et au profil pendant une course active, composant Profil partagé avec l'accueil. `flutter analyze` OK, 38/38 tests. *(2026-07-14)*
- [x] **UI carte accueil — respecter la barre d'état** — bouton clair/sombre placé sous la zone sûre et bandeau ZonZon aligné sans chevauchement. *(2026-07-13)*
- [x] **Navigation client — déplacer Profil en haut** — retrait du menu inférieur, bouton à côté du thème de carte et retour explicite vers Accueil. *(2026-07-13)*
- [x] **Carte et navigation client — enrichir les repères et alléger le menu** — fond OSM détaillé en clair, attribution visible, libellés inférieurs masqués et icônes agrandies. *(2026-07-13)*
- [x] **Réseau mobile — gérer les échecs DNS Fly.io** — retry court uniquement sur `Failed host lookup`, message utilisateur lisible et protection contre les doubles commandes sur timeout. *(2026-07-13)*

### Audit global post-négociation (2026-07-12)

> Historique conservé. La négociation client/livreur décrite ci-dessous a été retirée le 2026-07-13 au profit de la tarification administrée.

- [x] **P0 — Ne jamais sérialiser les secrets User** — `password` et `fcmToken` hors sélection TypeORM par défaut, sélection explicite limitée à l'auth/FCM, assertions e2e. *(2026-07-12)*
- [x] **P0 — Activer la course Flutter après accord sur le prix** — restauration de la commande, panneau livreur et GPS déclenchés par les événements d'acceptation. *(2026-07-12)*
- [x] **P0 — Porter la négociation sur la PWA iOS** — proposition livreur, acceptation/refus client, événements socket, prix estimé masqué et tests HTTP. *(2026-07-12)*
- [x] **P0 — Empêcher les propositions bloquées** — TTL, invalidation, exclusion des livreurs actifs et filtrage radar pendant une offre en attente. *(2026-07-12)*
- [x] **P1 — Synchroniser le prix final Flutter** — payload complet dans `orderAccepted` et fusion du store/rechargement du suivi. *(2026-07-12)*
- [x] **P1 — Enforcer la limite de 5 commandes actives côté backend** — verrou client + comptage transactionnel, scénario e2e de refus de la sixième commande. *(2026-07-12)*
- [x] **P1 sécurité dépendances** — Multer/Nest, Firebase Admin et Angular mis à niveau ; audits production backend/admin à 0 vulnérabilité. *(2026-07-12)*
- [~] **P1 — Réparer la qualité automatisée** — test admin réparé et couverture PWA négociation ajoutée ; dette ESLint backend historique encore à traiter séparément sans masquer les règles.
- [x] **P2 — Renuméroter la migration de propositions** — migration déplacée vers `1780500000000`, après les migrations existantes. *(2026-07-12)*
- [x] **OPS — Aligner production et dépôt** — commits poussés, backend+migration déployés sur Fly.io, admin et PWA publiés sur Cloudflare Pages, APK release généré. *(2026-07-12)*

### Négociation du prix client/livreur (2026-07-12)

> Fonctionnalité obsolète et supprimée du backend, de Flutter et de la PWA le 2026-07-13. L'ancienne migration est conservée uniquement pour la compatibilité des bases déjà migrées.

- [x] **P0 — Backend propositions de prix** — proposition livreur historisée, acceptation/refus client transactionnel, attribution uniquement après acceptation, socket et notifications. *(2026-07-12)*
- [x] **P0 — Mobile livreur** — remplacer l'acceptation directe d'une course client par la saisie et l'envoi d'un prix. *(2026-07-12)*
- [x] **P0 — Mobile client** — masquer le prix estimé avant attribution et afficher l'acceptation/refus d'une proposition en temps réel. *(2026-07-12)*
- [x] **P1 — Suivi plein écran carte** — informations de course dans un panneau superposé rétractable, suivi commerçant et statuts vérifiés. *(2026-07-12)*
- [x] **Tests de non-régression** — concurrence, refus/remise au radar, acceptation/attribution, tournées commerçant et interfaces. *(2026-07-12)*

### Tarification administrée (2026-07-13)

- [x] **Supprimer la négociation client/livreur** — endpoints, services, événements Socket, DTO, interfaces Flutter/PWA et tests remplacés par l'acceptation directe du livreur.
- [x] **Règle tarifaire configurable** — 200 FCFA/km par défaut ; forfait 500 FCFA pour toute course jusqu'à 2,5 km inclus ; valeurs stockées dans `pricing_config`.
- [x] **Menu admin Tarifs** — édition du prix/km, du forfait courte distance et du seuil kilométrique, avec validation et résumé de la règle active.
- [x] **Migration et non-régression** — migration `1780700000000-AddShortTripPricing`, backend 381/381 + E2E 58/58, Flutter 38/38 + analyse sans erreur, builds admin et PWA réussis.
- [ ] **Déployer la tarification administrée** — backend Fly.io d'abord (migration automatique), puis admin Cloudflare/PWA et nouvel APK Flutter.

- [x] **P0 — Backend indisponible après messagerie directe** — `DirectMessagesService` requiert `UserRepository`, omis de `MessagesModule`; les requêtes client `/orders/mine` expiraient. Repository ajouté, backend redéployé et machine Fly redémarrée; health check `200`. *(2026-07-12)*

### Qualité UI mobile (2026-07-12)

- [x] **P0 — Fiabiliser le suivi GPS livreur** — stream auto-réparable, position fraîche périodique, suivi Android en service foreground et récupération HTTP de la dernière position persistée si un événement socket est manqué. *(2026-07-12)*
- [x] **P1 — Carte claire/sombre** — sélecteur persistant sur toutes les cartes Flutter, avec tuiles CARTO light et dark. *(2026-07-12)*
- [x] **P1 — Autocomplétion des lieux** — suggestions OSM préfixées dès 2 caractères via Photon (`Adi` → `Adidogomé`), filtrage Togo, classement/déduplication et protection contre les réponses réseau arrivant dans le désordre. *(2026-07-12)*

- [x] **Tournées commerçant multi-colis** — backend déployé avec migrations, suivi multi-course mobile corrigé, e2e complet, mode multi-colis PWA et APK release généré. *(corrigé le 2026-07-12, Session 64)*
- [x] **P0 — Déployer le backend des tournées avant l'APK** — migrations appliquées via Fly; production version 25, health `200`, `/v1/orders/runs/mine` répond désormais `401` sans JWT au lieu de `404`.
- [x] **P1 — Maintenir le suivi d'une tournée multi-colis côté livreur** — course terminale retirée du registre, GPS conservé tant qu'un arrêt reste actif, statuts/paiements socket propagés à toutes les courses.
- [x] **P1 — Réparer et étendre les tests e2e backend** — `DeliveryRunRepository` et recherche téléphone supportés par le harness; scénario deux colis/même livreur ajouté; e2e 57/57.
- [x] **P2 — Parité PWA iOS des tournées commerçant** — `runId`, création/réutilisation de tournée et mode « plusieurs colis » ajoutés; build et test PWA verts. Aucun projet Cloudflare Pages PWA n'existe encore (seul `zonzon-admin`).
- [x] **P2 — Réinitialiser la tournée mobile au changement de livreur** — `_runId` est invalidé au changement de livreur ou de point de retrait.
- [x] **Afficher le montant au livreur** — prix formaté dans le radar, les raccourcis actifs et le panneau de conduite; fallback « Montant à confirmer » si absent. *(2026-07-12)*

- [x] **Accès persistant course livreur** — le radar affiche une carte « Course en cours » qui rouvre le panneau complet (itinéraire, chat, statuts) après un retour arrière. *(2026-07-12)*

- [x] **Passe Material Design 3 / HIG iOS des parcours principaux** — thème M3 centralisé (app bars, cartes, champs, navigation, snackbars), navigation client/livreur adaptative (NavigationBar/CupertinoTabBar), formulaires et écrans auth/profil/historique/messagerie/commerçant rendus responsives et adaptés iOS. `flutter analyze` sans issue, `flutter test` 29/29, APK release construit. Validation visuelle sur un appareil iOS réel à effectuer avant une distribution iOS.
- [x] **Temps réel messages et statuts** — `direct:message` est consommé dans les conversations générales; les chats de course rattrapent l'historique après reconnexion; client, suivi de course et commerçant rechargent leurs données si une coupure Socket.IO a fait manquer un événement. `flutter analyze` sans issue, `flutter test` 29/29, APK release construit. *(2026-07-12)*
- [x] **Accès client à la messagerie** — cinquième onglet `Messages` ajouté au `StatefulShellRoute` client; il ouvre les fils généraux et les conversations par course, déjà autorisés pour le rôle CLIENT par le backend. `flutter analyze` sans issue, `flutter test` 29/29. *(2026-07-12)*
- [x] **Audit flux mobile (P1/P2)** — deep-link `direct_message` via contexte persisté, filtrage des courses liables dans un fil direct et erreur visible, fallback `clientPhone`, garde premier fix GPS, pagination complète/compteurs exacts, rôle contrepartiste des réponses rapides corrigés. *(2026-07-12)*

### Sécurité médias privés (2026-07-11)
- [x] **P0 — Pièces d'identité privées R2 / streaming authentifié** — stockage privé distinct `IDENTITY_STORAGE_*`, clé opaque persistée dans `users.idCardPhotoUrl` (`select: false`), endpoint `GET /users/:id/id-card-photo` réservé au propriétaire ou ADMIN, affichage admin/mobile en blob authentifié. Bucket R2 privé `zonzon-identity-private` et secrets Fly configurés. Aucun média public (avatars/logos/produits) n'a été modifié. *(2026-07-11)*

### Correction ciblée mobile (2026-07-11)
- [x] **P2 — Uniformiser les URLs média R2 dans les écrans favoris / boutiques / profil livreur** — `favorites_screen.dart`, `shop_list_screen.dart` et `driver_profile_screen.dart` utilisent maintenant `mediaUrl(...)` au lieu des concaténations directes `$apiUrl$logo` et `$apiUrl$idCardUrl`. Compatibilité conservée avec les URLs absolues et les chemins legacy `/uploads/*`. *(2026-07-11)*

### Revue robustesse mobile (2026-07-10) — correctifs de la session 38 validés
- [x] **P0 — Fuite inter-session client + push après 401** — `logout()` et `handleUnauthorized()` appellent désormais `ClientServices.reset()` (socket + commandes actives) ; sur 401, `PushService.invalidateLocalToken()` supprime le token FCM côté device (le serveur n'est plus joignable avec un JWT mort). *(2026-07-10)*
- [x] **P0 — Paiement espèces inexécutable client↔livreur** — livreur : bouton « Paiement reçu (espèces) » dans le dialog de course + confirmation proposée au moment du COMPLETED (→ `CASH_ON_DELIVERY`) ; client : action « J'ai payé en espèces » dans le suivi (→ `PAID`). Les deux passent par `PATCH /orders/:id/payment-status` (déjà autorisé côté backend) et se propagent par socket. *(2026-07-10)*
- [x] **P1 — Photo livreur contournable** — plus de « continue » silencieux : en cas d'échec d'upload après l'inscription, dialog bloquant (Réessayer / Changer de photo) jusqu'au succès. *(2026-07-10)*
- [x] **P1 — Chat figé sur le statut initial** — `ChatService` écoute `orderStatusUpdated` (le socket chat est dans la room `user:`) et `ChatScreen` ferme la saisie + affiche le bandeau dès qu'un statut terminal survient en direct. *(2026-07-10)*
- [x] **P2 — Synchronisation FCM fragile** — `_syncedToken` n'est renseigné que sur 2xx ; échec réseau/HTTP → retry différé (45 s) guardé par l'existence d'une session. *(2026-07-10)*
- [x] **P2 — Accusé de lecture groupe trompeur** — backend : `GET /orders/:id/messages` renvoie `readBy` (receipts par participant) ; mobile : `done_all` plein = lu par TOUS les destinataires connus (participants de la conversation), estompé = lu par une partie, `done` = envoyé. Fallback ancienne sémantique si participants inconnus. *(2026-07-10)*
- [x] **P2 — Routes plates + socket à durcir** — redirect par rôle sur `/shops`, `/favorites`, `/history`, `/driver/profile` (« /notifications » reste multi-rôles) ; `OrderSocketController` a un flag `_disposed` qui empêche un `init()` non attendu de créer un socket orphelin après `dispose()`. *(2026-07-10)*

### Revue post-correctifs (2026-07-10) — verdict FAIL
- [x] **P0 — Encadrer le paiement espèces par la fin effective de course et une reprise** — backend verrouillé par acteur/statut (`COMPLETED` requis hors admin), actions prématurées retirées du mobile, reprise ajoutée dans l'historique/détail client/livreur. *(2026-07-10)*
- [x] **P0 — Rendre la photo livreur atomique, contrôlée par le serveur et durable** — session mobile publiée seulement après upload réussi ; backend bloque approbation/disponibilité/prise de course sans photo. Stockage S3-compatible/R2 branché pour avatars, pièce, logo et produit; configuration des secrets Fly requise avant déploiement. *(2026-07-10)*
- [x] **P1 — Corriger le pre-prompt FCM** — `PushService` utilise maintenant la `rootNavigatorKey` du router pour le dialog de pré-permission. *(2026-07-10)*
- [x] **P1 — Rendre les destinataires de chat canoniques** — `ensureConversation()` matérialise systématiquement client, livreur et commerçant dans les participants. *(2026-07-10)*
- [x] **P1 — Protéger le cycle de vie de `ChatService`** — garde `_disposed` ajoutée autour du bootstrap async et du socket. *(2026-07-10)*
- [x] **P1 — Rendre la description du colis obligatoire** — validation `trim().isNotEmpty` côté client + `IsNotEmpty` sur les DTO backend client/commerçant. *(2026-07-10)*
- [~] **P2 — Couvrir les flux récents** — backend : **359 tests** verts; Flutter : toujours **11 widgets**. Ajouter plus tard des tests widget/intégration ciblés pour 401/logout, paiement espèces, inscription photo, FCM et chat groupe/terminal.
- [x] **P2 — Formater le mobile** — fichiers touchés formatés pendant cette session. *(2026-07-10)*

### Revue finale mobile/backend (2026-07-10) — verdict FAIL
- [x] **P0 — Unifier l'éligibilité effective des livreurs** — `ACTIVE`, validation, disponibilité, photo et visibilité publique sont appliqués aux broadcasts Socket.IO, aux FCM (global + géolocalisé) et au radar. Un livreur privé ne voit/accepte que ses courses réservées. *(corrigé le 2026-07-10)*
- [x] **P1 — Exclure les livreurs sans photo du choix manuel** — le sélecteur et la validation d'attribution manuelle excluent les profils sans photo, évitant les courses PENDING inacceptables. *(corrigé le 2026-07-10)*
- [x] **P1 — Traiter `REFUNDED` comme un paiement réglé dans le suivi vivant** — helper mobile partagé et écrans client/livreur alignés sur le backend. *(corrigé le 2026-07-10)*
- [x] **P1 — Valider les champs après trim côté backend** — adresses, description et messages exigent désormais au moins un caractère non blanc, avec tests de régression. *(corrigé le 2026-07-10)*
- [x] **P1 — Réparer les e2e livreur après l'obligation de photo** — fixtures enrichies avec une photo avant validation et cas explicite de refus sans photo. E2e 56/56. *(corrigé le 2026-07-10)*
- [x] **P2 — Rendre réellement fonctionnel « Quitter la conversation »** — la synchronisation de lecture préserve `leftAt`; seule une action explicite de rejoindre réactive un participant. *(corrigé le 2026-07-10)*
- [x] **P2 — Compléter les écarts UX restants** — action « Refuser » explicite dans le radar (masquage transparent jusqu'au prochain rafraîchissement), dashboard rafraîchi après création et montant limité aux livraisons terminées. *(corrigé le 2026-07-10)*

> **Historique remplacé par la revue ci-dessus :** les tâches non cochées qui suivent décrivent les constats antérieurs à `2f363dc`; elles ne doivent pas être traitées séparément. Les corrections initiales sont documentées comme terminées en Session 38 et les écarts encore ouverts sont ceux de la revue post-correctifs.

### Revue mobile vs CDC (2026-07-09) — verdict FAIL
- [x] **Revue post-correctifs rejouée (2026-07-10)** — contrats mobile/backend inspectés ; backend 343/343 unitaires + build OK ; Flutter 11/11 + analyze sans erreur ; e2e 54/56 (2 fixtures obsolètes). Verdict : correctifs commerçant conformes, mais PASS CDC complet refusé à cause des findings ci-dessous.
- [x] **P0 — Restaurer la course active côté livreur après redémarrage mobile** — `_restoreActiveOrder()` charge `/orders/mine` au boot, détecte la course active (ACCEPTED→NEAR_CLIENT) et rouvre le dialog de progression complet (titre « Course en cours »). *(2026-07-10)*
- [x] **P0 — Synchroniser l'annulation distante dans l'UI livreur** — `statusUpdates$` écouté ; statut terminal distant → fermeture du dialog non dismissible (popUntil du chat empilé inclus), snackbar, arrêt géofence + GPS ; statut non terminal → synchro de l'affichage. *(2026-07-10)*
- [x] **P0 — Rendre atomique la règle une-course-active** — `acceptOrder` fait le re-contrôle « course active » + UPDATE atomique dans une transaction avec verrou pessimiste (`SELECT … FOR UPDATE`) sur la ligne `users` du livreur ; tests dédiés (race simulée + prise du verrou). *(2026-07-10)*
- [x] **P1 — Corriger la normalisation de recherche client** — `replace(/[^0-9]/g, '')` (flag global) dans `searchClients` ; `+228 90-12.34` désormais bien normalisé. *(2026-07-10)*
- [x] **P1 — Diffuser les changements de paiement en temps réel** — event `orderPaymentUpdated` (gateway `broadcastPaymentUpdate` → client/livreur/commerçant), stream `paymentUpdates$` mobile consommé par le suivi client, le dialog livreur et la liste/détail commerçant. *(2026-07-10)*
- [x] **P1 — Lecture chat par participant** — table `message_read_receipts` (receipt par user/message, migration `1780000000000` + backfill), `markAsRead`/`unreadCountForUser` par participant ; `Message.readAt` conservé (sémantique « lu par au moins un destinataire », rétro-compat mobile). *(2026-07-10)*
- [x] **P2 — Réparer les fixtures e2e d'attribution manuelle** — le repo in-memory applique désormais le défaut DB `User.status=ACTIVE` à l'inscription ; e2e **56/56**. *(2026-07-10)*
- [x] **P2 — N'activer le GPS mobile livreur que pendant une course active** — position stream + heartbeat démarrés à l'ouverture du dialog (accept/restauration), arrêtés à sa fermeture (statut terminal local ou distant) ; reconnexion socket ne relance le GPS que si une course est active. *(2026-07-10)*
- [x] **Revue de conformité rejouée** — contrats mobile/backend inspectés, `flutter analyze --no-pub lib` (10 alertes non bloquantes), `flutter test` (11/11), backend `npm run build` + 161 tests commandes/gateway/messages OK. Build APK release non conclu après 10 min ; premier échec attribué à un registrant Flutter local obsolète, corrigé par nettoyage.
- [x] **P0 — Cycle session/FCM mobile** — `GoRouter.refreshListenable` branché sur la session ; suppression ciblée du token device (`previousToken`) ; resynchronisation du token possible après logout/login dans le même processus.
- [x] **P0 — Restaurer le tracking GPS après redémarrage backend** — le gateway réhydrate désormais la course active du livreur depuis la DB avant de forwarder/persister sa position.
- [x] **P1 — Fiabiliser la sélection commerçant** — recherche/sélection d’un client existant, saisie téléphone via `PhoneField`, filtre `available-drivers` sur compte actif + disponibilité + absence de course active.
- [x] **P1 — Suivi commerçant réel** — position live + ETA visibles dans le détail commerçant ; `GET /orders/:id/eta` autorisé au commerçant créateur.
- [x] **P1 — Activer les tarifs par zone dans le mobile** — sélection/envoi `pickupZoneId` / `destinationZoneId` côté client et commerçant, estimation alignée sur le pricing backend.
- [x] **P1 — Sécuriser la réassignation** — `PATCH /orders/:id/assign` vérifie désormais le commerçant propriétaire (ou admin).
- [x] **P2 — Sécuriser le chat multi-participants** — fermeture aussi sur `FAILED`, `chat:typing` autorisé seulement après contrôle d'appartenance, conversation commerçant réellement exploitable côté mobile.
- [x] **P2 — Couvrir les flux récents** — tests de régression ajoutés pour statuts terminaux de conversation et URLs média absolues/legacy; couverture backend stockage/utilisateurs/boutiques ajoutée. *(2026-07-10)*
- [x] **P0 — Purger complètement une session mobile invalide (401)** — `handleUnauthorized()` invalide le FCM local, appelle `ClientServices.reset()` (socket, commandes actives, sélection boutique) puis efface les credentials. *(vérifié le 2026-07-10)*
- [x] **P0 — Rendre le paiement espèces exécutable côté client/livreur** — actions client/livreur disponibles après `COMPLETED`, reprise depuis l’historique et visibilité cohérente du paiement. *(vérifié le 2026-07-10)*
- [x] **P1 — Rendre la photo réellement obligatoire à l'inscription livreur** — l’inscription ne publie plus la session avant upload réussi ; le backend bloque validation, disponibilité et acceptation sans photo. *(vérifié le 2026-07-10)*
- [x] **P1 — Fermer/synchroniser le chat client et commerçant au statut terminal** — `ChatScreen` écoute `orderStatusUpdated`, masque le composer et affiche l’état terminal. *(vérifié le 2026-07-10)*
- [x] **P2 — Fiabiliser le synchronisme FCM** — `_syncedToken` n’est défini qu’après 2xx et une tentative différée est programmée après échec. *(vérifié le 2026-07-10)*
- [ ] **P2 — Clarifier les accusés de lecture du chat multi-participants** — l'UI affiche `done_all` dès qu'un seul participant lit le message (`readAt` global). Afficher une sémantique « lu par au moins un » ou des reçus par participant.
- [ ] **P2 — Durcir les routes et le cycle de vie socket** — protéger aussi les routes plates par rôle (`/driver/profile`, `/shops`, etc.) et empêcher `OrderSocketController.init()` de créer un socket après son `dispose()` lors d'une sortie rapide.
- [x] **Décision PO — tarif CDC** — tranché : **200 FCFA/km** conservé. CDC source mis à jour (§4, note de décision du 2026-07-10) ; config backend (`PricingConfig` défaut 200) déjà alignée, tarif ajustable par l'admin. *(2026-07-10)*
- [x] **PWA iOS (après V1 Android)** — développée en 5 rounds (voir section « 🍏 PWA iOS » ci-dessous), 3 rôles (client/livreur/commerçant), auth+infra temps réel/carte/chat, finition PWA (install/offline/web push défensif/polish HIG). *(2026-07-12)*

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
  - Changement sécurisé du mot de passe (`PATCH /auth/password`) avec vérification de l'ancien secret
  - Affichage téléphone normalisé et indicatif Togo par défaut dans les champs de saisie
  - Accès à l'historique des commandes (`OrderHistoryScreen`)
  - Déconnexion avec dialog de confirmation
- [x] **Routage** : route `clientProfile = '/home/client/profile'` dans `app_router.dart`
- [x] **Accès** : icône `account_circle_outlined` dans `OrderHeader` → `_openProfile()` dans `order_screen.dart`
- [x] **Correctifs profil et saisie téléphone (2026-07-16)** — changement de mot de passe partagé client/livreur/commerçant, sélecteur d'indicatif Flutter/PWA (Togo +228 par défaut) sur les saisies téléphone, et texte de recherche de lieu rendu explicitement visible.

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
- [x] **Migration des nouveaux uploads vers Cloudflare R2** — uploads sur Fly sont éphémères, photos disparaissent à chaque deploy
  - `backend/src/users/upload.config.ts` + `backend/src/shops/upload.config.ts`
  - Compatible S3 SDK
  - Pièces d'identité : bucket privé `zonzon-identity-private`; médias publics (avatars, logos, produits) : bucket public `zonzon-media` avec secrets Fly configurés. *(2026-07-11)*
  - Aucun ancien fichier détecté dans `backend/uploads` ou `backend/private_uploads` : aucune migration historique nécessaire. Reste optionnellement le remplacement de l'URL `r2.dev` par un domaine personnalisé.
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
- [ ] **Créer un SECOND compte ADMIN** — bloquant pour que le bouton de réinitialisation serve à quelque chose (il refuse l'auto-ciblage et ne s'affiche que sur les lignes ADMIN ; il n'y a qu'un seul admin en base). `ssh -t ovh-ubuntu 'sudo docker exec -it zonzon-backend-ovh node scripts/create-admin.js'` — nécessite le redéploiement backend de la session 92, sinon passer par `docker cp`.
- [x] **Réinitialisation de mot de passe admin** *(2026-07-27, session 91)* — deux canaux : OTP WhatsApp self-service (`/forgot-password`, dormant tant que WhatsApp n'est pas actif) + filet de secours admin-à-admin (`PATCH /users/:id/reset-password`, bouton sur `/users` pour les comptes ADMIN). Détail complet : voir PROGRESS.md session 91. **Déployé en production** (backend OVH + admin Cloudflare Pages), routes vérifiées en conditions réelles.

---

## 🛠 DEVOPS

- [x] **Migration backend vers le VPS OVH-2** — conteneur `zonzon-backend-ovh` opérationnel derrière Coolify/Traefik, DNS `api.kore-innov.com → 141.95.170.57`, HTTPS Let's Encrypt actif, CORS admin/PWA validé, handshake Socket.IO validé. Admin et PWA republiés sur Cloudflare Pages avec la nouvelle API, APK release régénéré et installé sur le Samsung connecté. Fly.io reste actif comme secours. *(2026-07-16)*
- [x] **CI/CD GitHub Actions** — 3 workflows créés (backend-ci.yml, admin-ci.yml, flutter-ci.yml). Tests sur tous les PRs, déploiements sur push main uniquement. Secrets à configurer: FLY_API_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GOOGLE_SERVICES_JSON
- [x] **Éviter les coûts GitHub Actions automatiques** — les workflows `ci`, backend, admin, Flutter et deploy ne s'exécutent plus sur push/PR/tag ; ils sont désormais uniquement disponibles via `workflow_dispatch`. Tests et déploiements réalisés localement jusqu'à décision contraire. *(2026-07-11)*
- [x] **Déploiement local reproductible** — `deploy.bat` valide et déploie backend/Fly.io, dashboard/Cloudflare Pages puis génère l'APK Android, sans GitHub Actions. *(2026-07-11)*
- [x] **Fiabiliser le temps réel livreur** — `OrderSocketController` n'ouvre plus de socket sans JWT, envoie `auth.token` + `Authorization: Bearer`, expose l'état de connexion/reconnexion, et le radar se resynchronise via `GET /orders/available` à chaque connexion/reconnexion avec fusion sans doublons. `ChatService` applique le même durcissement d'auth Socket.IO. Tests Flutter ajoutés (`socket_auth_options_test.dart`, `driver_radar_sync_test.dart`) et `flutter test` vert. *(2026-07-11)*
- [x] **Correctifs parcours réel client/livreur/commerçant** — notation côté client uniquement avec fallback HTTP, rafraîchissement historique/gains livreur, résolution des téléphones locaux/internationaux et navigation intégrée livreur. Backend Fly déployé, APK release généré, tests backend/mobile verts. *(2026-07-11)*
- [x] **Route routière livreur** — la carte de navigation charge la géométrie du moteur d'itinéraire depuis la position GPS livreur vers la prochaine destination, sans jamais représenter un faux segment direct si le GPS est absent. APK release généré, tests Flutter verts. *(2026-07-11)*
- [x] **Boîte de réception commerçant/livreur** — onglets Général/Courses, messages généraux entre contacts liés par affiliation active ou course partagée, et contexte de course optionnel par message. *(2026-07-11)*
- [x] **Contexte de course dans un fil général** — le composeur permet de sélectionner une course; le message reste dans le fil unique mais porte un badge `Lié à la course #…`, validé côté serveur. *(2026-07-11)*
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

## ✅ TESTS E2E RÉCENTS

- [x] **Test réel téléphone client → Pixel 9 livreur** *(2026-07-14)* — compte `Pixel Livreur` créé avec `+22899123457`, approuvé depuis l'interface admin puis rendu disponible. Une course Soviépé → Université de Lomé (7,1 km, 1 412 FCFA) créée sur le téléphone client est apparue instantanément sur le Pixel sans actualisation et a été acceptée ; le client a immédiatement affiché `ACCEPTÉE` avec le livreur associé.

## ⏰ À REPROGRAMMER (post-tests utilisateurs)

> Reportées explicitement par le PO car non prioritaires pendant la phase de tests actuelle. Le paiement initial se fait à la livraison, et chez le commerçant directement par mobile money sur son numéro perso.

- [ ] **🔴 Système de paiement intégré (Mobile Money TMoney/Flooz/Mixx)**
  - Aujourd'hui : paiement à l'arrivée + transfert direct au commerçant
  - Plus tard : intégration TMoney / Flooz / Mixx by YAS ou agrégateur (PayDunya, CinetPay)
  - Champs à ajouter : `paymentStatus`, `paymentMethod`, `paymentReference` sur `DeliveryOrder`
- [~] **🔴 Vérification OTP WhatsApp à l'inscription**
  - Code préparé : endpoints request/verify, challenge haché et expirant, preuve signée, limitation des essais/renvois, migration et écran Flutter conditionnel. *(2026-07-13)*
  - À fournir : compte Meta Business, numéro WhatsApp dédié, `Phone Number ID`, jeton permanent et template Authentication approuvé. Garder `WHATSAPP_OTP_ENABLED=false` jusque-là.
  - Aujourd'hui : compte créé sans confirmation du numéro
  - Risque : faux comptes, fraude
  - Activation finale : secrets Fly.io, déploiement backend, test réel puis nouvel APK.
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
- [x] **Configuration Firebase Cloud Messaging production validée** — projet Android et sender ID cohérents, API HTTP v1 activée, secret Firebase Admin déployé sur Fly.io, service FCM Android démarré sans erreur. Test réel ciblé à exécuter avec deux comptes connectés. *(2026-07-13)*

### 🍏 PWA iOS (Angular) — après V1 Android
> Nouveau dossier `pwa/`. Backend prod consommé tel quel. 3 rôles visés (parité Flutter). Détail: PROGRESS.md Session 58.
- [x] **Round 1 — Fondations HIG** *(2026-07-12)* : scaffold Angular 21 PWA (SW+manifest), chrome iOS (safe areas, tab bar, grands titres, police système, no-tap-delay), auth JWT + intercepteur 401/timeout, guards+routage par rôle, écrans Login/Register. `ng build` OK.
- [x] **Round 2 — Client** *(2026-07-12)* : infra partagée (modèles `order.model.ts`/`shop.model.ts`, services `OrdersService`/`ShopsService`/`ZonesService`/`NotificationsService`/`SignalementsService`/`MessagesService`, `SocketService` (connexion à la racine du backend, cycle de vie lié au login/logout), `status-utils.ts`, composants `StatusTimeline`/`OrderMap` (Leaflet+OSM)/`OrderChat`) + 4 écrans réels : Accueil (formulaire+carte tappable+estimation debounce+création), Commandes (actives/passées), Suivi `/client/orders/:id` (frise statut, carte+position livreur live, ETA, badge paiement, chat, annulation, signalement, notation post-livraison), Boutiques (liste filtrable+détail+« commander depuis cette boutique »), Profil (édition+photo+notifications+déconnexion) + centre de notifications. Dépendances ajoutées : `socket.io-client@^4.8.3`, `leaflet@^1.9`, `@types/leaflet`. `ng build` prod OK (321 kB initial / 88.6 kB transfert compressé, budget 500k/1M inchangé, 0 warning après `allowedCommonJsDependencies: ["leaflet"]`).
- [x] **Round 3 — Livreur** *(2026-07-12)* : `DriverService` (dispo/visibilité/véhicule/affiliations/pièce d'identité) + `findAvailable`/`accept` ajoutés à `OrdersService`. Écrans réels : Radar (bandeau validation PENDING/REJECTED avec garde applicative qui bloque le chargement, toggles dispo/visibilité, liste `GET /orders/available` temps réel via `newOrderAvailable`/`orderAccepted`, gestion 409 « déjà prise »), Mes courses (actives/terminées + encart gains estimés `COMPLETED`), écran de conduite `/driver/my-deliveries/:id` (frise statut, carte Leaflet + position GPS propre, boutons d'avancement `EN_ROUTE_PICKUP→AT_PICKUP→IN_PROGRESS→NEAR_CLIENT→COMPLETED`, signaler échec, annuler, chat, émission `driver:location` via `watchPosition` uniquement pendant course active), Profil (infos+photo, dispo/visibilité redondantes, véhicule+zone habituelle `PUT /vehicles/me`, upload+aperçu pièce d'identité en blob authentifié, invitations d'affiliation accept/refuse, notifications, déconnexion) + centre de notifications livreur. Fix bonus : `AuthService.uploadPhoto` remplaçait tout l'utilisateur courant par `{profilePhotoUrl}` (le backend ne renvoie que ce champ) — ajout de `patchCurrentUser()` pour fusionner au lieu de remplacer. `ng build` prod OK (324 kB initial / 89.5 kB transfert, budget composant CSS ajusté 4→6 kB pour le profil livreur, 0 warning).
- [x] **Round 4 — Commerçant** *(2026-07-12)* : `MerchantService` (livreurs affiliés invite/retrait, conversation multi-participants rejoindre/quitter) + `createMerchant`/`findAvailableDrivers`/`assign`/`updatePrice`/`updatePaymentStatus` ajoutés à `OrdersService` (shared) + `AvailableDriver`/`CreateMerchantOrderPayload` ajoutés à `order.model.ts`. Composant réutilisable `DriverPickerComponent` (choix livreur affilié/plateforme, utilisé par Créer + réassignation). Écrans réels : Livraisons (`GET /orders/mine` cas COMMERCANT, stats agrégées jour/terminées/montant calculées client-side, actives/passées), Créer (client par téléphone validé + nom optionnel, carte tappable retrait/livraison, description, estimation debounce + prix manuel optionnel avec raison, choix livreur ou « laisser la plateforme choisir », `POST /orders/merchant`), Livreurs (badges PENDING/ACTIVE/REJECTED/REMOVED avec libellés FR dédiés — jamais « affilié avec succès » avant `ACTIVE` —, invitation par téléphone, retrait avec confirmation), suivi `/merchant/deliveries/:id` (frise statut, carte+position live livreur, badge paiement + changement de statut avec raccourci « Reçu (commerçant) », ajustement manuel du prix si non terminale, réassignation livreur si PENDING via `DriverPickerComponent`, conversation rejoindre/quitter + chat partagé), Profil (édition+photo+notifications+déconnexion) + centre de notifications commerçant. Fix bonus shared : `PAYMENT_STATUS_VARIANTS` complété avec `CASH_ON_DELIVERY`/`REFUNDED` (manquants, pill retombait sur "mut"). `npm run build` prod OK (324.98 kB initial / 89.80 kB transfert, quasi inchangé, 0 warning, écrans commerçant lazy-loadés). Vérification manuelle via Browser pane (session simulée COMMERCANT) : 4 tabs + suivi (état introuvable) rendus sans erreur console, dégradation gracieuse sur les appels bloqués par CORS localhost→prod (comportement attendu, identique aux rounds précédents).
- [x] **Round 5 — Finition PWA** *(2026-07-12)* : guide « Ajouter à l'écran d'accueil » (iOS manuel + bouton Android `beforeinstallprompt`), shell hors-ligne (bannière + `SwUpdate` toast + `dataGroups` freshness sur `/zones`+`/shops/categories`), web push défensif honnête (permission + notifications locales via le temps réel existant, AUCUN vrai Web Push serveur — voir PROGRESS.md Session 62 pour le détail des limites), polish HIG (safe areas offline-aware, tap targets 44px, `:focus-visible`, `prefers-reduced-motion`, pull-to-refresh léger sur les 3 listes principales). `npm run build` OK (332.97 kB initial / 92.47 kB transfert). PWA iOS V1 complète (Rounds 1→5).
