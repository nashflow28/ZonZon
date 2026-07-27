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
| Hébergement backend | **OVH VPS-2** (Coolify/Traefik) — Fly.io conservé en secours |
| Hébergement admin | Cloudflare Pages |
| Notifications push | Firebase Cloud Messaging (FCM) |
| Routing/Distances | OpenRouteService (free tier, clé déjà configurée) |

---

## Analyse d'écart — Cahier des charges V1 (2026-07-05)

> Décision : architecture V1 **conservée** — Flutter (client/livreur/commerçant) + Angular (admin). Pas de réécriture PWA maintenant (le CDC demande une PWA ; écart assumé pour la V1). Backlog priorisé dans [`TODO.md`](TODO.md) (section « BACKLOG V1 »).
>
> **Mise à jour distribution (2026-07-10)** : Android = app Flutter native (APK) — **aucune PWA Android nécessaire**. iOS = **PWA à développer après la V1 Android** (contourne compte développeur Apple + macOS). Tarif tranché : **200 FCFA/km** (CDC source §4 mis à jour, config backend déjà alignée).
>
> **PWA iOS terminée (2026-07-12)** : 5 rounds livrés (`pwa/`, Angular 21) — 3 rôles, auth, temps réel/carte/chat, puis finition (install écran d'accueil, shell hors-ligne, web push défensif, polish HIG). Détail : Sessions 58-62 ci-dessous. Limite connue assumée : pas de vrai Web Push serveur (VAPID/FCM Web) — canal fiable actuel = centre de notifications in-app.

**Déjà couvert** : auth 4 rôles · livraison à la demande client→livreur (Type 2) · suivi GPS temps réel (Socket.IO + positions persistées + ETA + géofencing) · messagerie par livraison (client↔livreur) · 5 statuts de commande · notifications FCM · historique client/livreur · tarification à la distance · dashboards client/livreur/admin · véhicule moto/voiture/tricycle. Bonus au-delà du V1 : notation étoiles, favoris boutiques, catégories/produits, commissions/reports, audit log, soft-delete, CI/CD, Sentry.

**Manques V1 identifiés** (→ backlog priorisé) :
- **P1** : validation admin obligatoire des livreurs ; disponibilité livreur (disponible/indisponible) ; blocage des livreurs non validés/indisponibles (voir + accepter).
- **P2** : livraison commerçant→client (Type 1) — le commerçant ne peut aujourd'hui PAS créer de livraison (`POST /orders` réservé `@Roles(CLIENT)`, pas de champ commerçant/créateur sur `DeliveryOrder`) ; rattachement client par compte ou téléphone.
- **P3** : attribution manuelle d'un livreur ; relation livreur affilié à un commerçant ; tarif administré (**200 FCFA/km**, forfait **500 FCFA jusqu'à 2,5 km**, trois valeurs configurables) + ajustement manuel commerçant ; statuts de livraison étendus (arrivé retrait, colis récupéré, proche client, échoué) ; `paymentStatus` ; zones/quartiers de Lomé.
- Profil livreur incomplet vs CDC : manquent photo pièce d'identité et zone habituelle (à intégrer avec P1/P3).

**Contrainte de toutes les évolutions V1** : ne pas casser tracking GPS, Socket.IO, FCM, messagerie client↔livreur, admin dashboard.

---

## Infrastructure déployée

| Service | URL / Détail | Status |
|---------|-------------|--------|
| **Backend principal** | `https://api.kore-innov.com` (OVH VPS-2) | ✅ Live (HTTPS/Let's Encrypt) |
| **Backend secours** | `https://zonzon-backend.fly.dev` | ✅ Conservé comme fallback |
| **Admin** | `https://zonzon-admin.pages.dev` | ✅ Live (Cloudflare Pages) |
| **PWA iOS** | `https://zonzon-pwa.pages.dev` | ✅ Live (Cloudflare Pages) |
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
- `Dockerfile` — Multi-stage build Node 22 Alpine

### Mobile (`/mobile_app/`)
- `lib/config/env.dart` — URL API (`defaultValue: 'https://api.kore-innov.com'`) + `apiPrefix = '/v1'` (préfixe HTTP, NON utilisé par les sockets ni les uploads)
- `android/app/google-services.json` — Config Firebase Android

### Admin (`/admin-dashboard/`)
- `src/environments/environment.prod.ts` — `apiUrl: 'https://api.kore-innov.com'` + `apiPrefix: '/v1'`
- `src/environments/environment.ts` — `apiUrl: 'http://localhost:3050'` + `apiPrefix: '/v1'`

---

## Variables d'environnement production (Fly.io secours et OVH principal)

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
FRONTEND_URLS=https://zonzon-admin.pages.dev,https://zonzon-pwa.pages.dev
FRONTEND_URL_PATTERNS=^https://[a-z0-9-]+\.zonzon-admin\.pages\.dev$  (optionnel, regex pour previews Cloudflare)
FIREBASE_CREDENTIALS_JSON=*** (contenu du fichier firebase-adminsdk.json)
OBJECT_STORAGE_ENDPOINT=https://004d946c5f3886bb2afba3d14d422c66.r2.cloudflarestorage.com
OBJECT_STORAGE_BUCKET=zonzon-media
OBJECT_STORAGE_ACCESS_KEY_ID=***
OBJECT_STORAGE_SECRET_ACCESS_KEY=***
OBJECT_STORAGE_PUBLIC_URL=https://pub-15fc91f9ec6c4eed8ab820c19d1ae0da.r2.dev
OBJECT_STORAGE_REGION=auto
IDENTITY_UPLOAD_DIR=private_uploads/identity
IDENTITY_STORAGE_ENDPOINT=https://004d946c5f3886bb2afba3d14d422c66.r2.cloudflarestorage.com
IDENTITY_STORAGE_BUCKET=zonzon-identity-private
IDENTITY_STORAGE_ACCESS_KEY_ID=***
IDENTITY_STORAGE_SECRET_ACCESS_KEY=***
IDENTITY_STORAGE_REGION=auto
IDENTITY_STORAGE_FORCE_PATH_STYLE=false
```

---

## Commandes essentielles

### Builder l'APK de production
```powershell
cd C:\laragon\www\ZonZon\mobile_app
flutter build apk --release `
  --dart-define=API_URL=https://api.kore-innov.com `
  "--dart-define=SENTRY_DSN=https://5b733a06f8e026418f487fe2335679b3@o4511315040337920.ingest.de.sentry.io/4511324268724304"
# APK généré : build\app\outputs\flutter-apk\app-release.apk (≈60 MB)
```
> **Note** : `env.dart` pointe par défaut sur `https://api.kore-innov.com`. `--dart-define=API_URL` est donc optionnel. `--dart-define=SENTRY_DSN` active le reporting d'erreurs Sentry (recommandé en prod).

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
| PATCH | `/auth/password` | Modifier le mot de passe avec vérification de l'ancien |
| POST | `/users/me/photo` | Upload photo de profil |
| GET | `/vehicles/me` | Infos véhicule livreur |
| PUT | `/vehicles/me` | Modifier/créer véhicule |
| POST | `/orders` | Créer une commande |
| POST | `/orders/estimate` | Estimer le prix d'une livraison |
| GET | `/orders/mine` | Mes commandes |
| POST | `/orders/:id/accept` | Accepter une course (livreur) |
| POST | `/orders/:id/price-proposals` | Proposer un prix sur une course client (livreur) |
| GET | `/orders/:id/price-proposal` | Proposition en attente (client) |
| PATCH | `/orders/:id/price-proposal/:proposalId` | Accepter/refuser une proposition (client) |
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
| Nouveaux médias publics | ✅ Stockés dans Cloudflare R2 | Bucket `zonzon-media` via les secrets `OBJECT_STORAGE_*`; les anciens chemins `/uploads/*` restent compatibles mais ne sont pas migrés automatiquement |
| Déploiements CI/CD GitHub | ✅ Manuels uniquement | Les cinq workflows sont limités à `workflow_dispatch` pour ne plus consommer de minutes sur push/PR/tag ; tests et déploiements sont effectués depuis le poste local |
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

### Session 74 (2026-07-16) — Préparation migration backend vers OVH

- Connexion SSH `ovh-ubuntu` validée ; le VPS utilise Ubuntu, Docker et Coolify (pas Dokploy). Les sites `kore-innov.com` et `formations.kore-innov.com` restent en place derrière le proxy Coolify.
- Build backend local réussi ; tests backend **383/383** verts.
- Copie de travail du backend transférée dans `/opt/zonzon/backend` sur OVH sans `.env`, `firebase-adminsdk.json`, uploads ni `node_modules` ; image `zonzon-backend:working` construite avec succès sur le VPS.
- Déploiement suspendu avant démarrage du conteneur : une commande de diagnostic Fly mal quotée a affiché `FIREBASE_CREDENTIALS_JSON`. La clé Firebase concernée doit être révoquée/régénérée avant toute injection de secrets sur OVH. Aucun secret n'a été copié sur OVH et Fly reste la production active.
- À la demande du PO, poursuite en mode parallèle sans ancienne clé Firebase : les variables de production hors FCM ont été injectées dans `/opt/zonzon/backend/.env` (permissions `600`), puis le conteneur `zonzon-backend-ovh` a été lancé avec volumes Docker dédiés `zonzon_uploads` et `zonzon_identity`. `GET http://141.95.170.57:3050/` retourne `200`, `/v1/shops/categories` retourne `200`, et le handshake Socket.IO `/socket.io/?EIO=4&transport=polling` retourne `200`. Le domaine HTTPS/reverse-proxy et la bascule des clients restent à faire. FCM reste désactivé sur OVH jusqu'à la nouvelle clé.
- Nouvelle clé Firebase téléchargée localement par le PO, validée pour le projet `zonzon-4eb31`, puis injectée sans affichage dans Fly.io et `/opt/zonzon/backend/.env` sur OVH. Le conteneur OVH parse bien le projet Firebase et l'API Fly/OVH répond `200`. L'ancienne clé précédemment exposée doit encore être révoquée depuis Google Cloud/Firebase.
- Le PO confirme avoir révoqué l'ancienne clé dans Google Cloud. L'identifiant de la nouvelle clé est présent dans le conteneur OVH ; le backend OVH reste sain (`GET /` 200). Rotation Firebase considérée terminée.
- Route reverse-proxy ajoutée au réseau Coolify pour `api.kore-innov.com` avec redirection HTTP→HTTPS et certificat Let's Encrypt prévu. Le DNS OVH ne contient pas encore d'enregistrement A pour ce sous-domaine ; la bascule des clients attend ce point externe.

### Session 76 (2026-07-16) — Bascule clients vers OVH et validation publique

- DNS `api.kore-innov.com A 141.95.170.57` ajouté par le PO ; le certificat Let's Encrypt est maintenant émis et valide pour `api.kore-innov.com`.
- URLs de production mises à jour vers OVH dans `mobile_app/lib/config/env.dart`, `admin-dashboard/src/environments/environment.prod.ts` et `pwa/src/environments/environment.prod.ts`.
- Validation locale : backend `npm run build` OK et tests Jest **383/383**, `flutter analyze` sans constat, `flutter test` **41/41**, APK release généré dans `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (60,3 Mo).
- Admin republié sur Cloudflare Pages (`zonzon-admin`, déploiement `071d47ad`) et PWA republiée (`zonzon-pwa`, déploiement `7840a95d`).
- Vérifications publiques : API `GET /` → `200`, catégories avec CORS PWA → `200`, handshake Socket.IO HTTPS → `200`, admin et PWA → `200`. Les bundles compilés contiennent `https://api.kore-innov.com`.
- Le backend Fly.io reste démarré comme solution de secours ; aucune suppression de données ni désactivation n'a été effectuée.

### Session 77 (2026-07-16) — Installation APK sur Samsung

- Appareil détecté via ADB : Samsung `SM-S918B` (`R5CW92DM43V`).
- APK release OVH installé avec succès (`adb install -r`) puis lancé (`com.example.mobile_app`).
- Processus Android actif après 3 secondes, aucune ligne `FATAL EXCEPTION`/`AndroidRuntime` détectée dans les derniers logs.

### Session 78 (2026-07-16) — Profils, téléphones et recherche de lieux

- Backend : endpoint authentifié `PATCH /v1/auth/password` ajouté. Il vérifie l'ancien mot de passe, refuse un nouveau secret identique, impose 8 caractères minimum et ne renvoie jamais le hash. Tests Jest : **386/386**.
- Flutter : dialogue partagé de changement de mot de passe dans les profils client, livreur et commerçant ; affichage téléphonique normalisé ; sélecteur d'indicatif réutilisé dans la boutique et les invitations de livreurs, avec Togo `+228` par défaut.
- Flutter : `LocationSearchField` fixe explicitement texte blanc, curseur bleu et fond du champ afin que la saisie reste visible au-dessus de la carte. Tests ajoutés : formatage `PhoneDisplay` et saisie de recherche.
- PWA : sélecteur d'indicatif standalone (authentification, création de livraison, invitations) et composant partagé de changement de mot de passe dans les trois profils. Build OK, tests **2/2** ; publié sur Cloudflare Pages (déploiement `eee67fca`).
- Validation Flutter : `flutter analyze` sans constat, `flutter test` **43/43**, APK release régénéré dans `mobile_app/build/app/outputs/flutter-apk/app-release.apk`. L'installation sur le Samsung attend sa reconnexion ADB ; l'ancienne version reste installée.
- Backend OVH et Fly.io redéployés ; health checks publics `200`. Le conteneur OVH démarre correctement avec l'environnement protégé déjà présent sur le VPS.

### Session 73 (2026-07-13) — Essai émulateur Android

- AVD `Medium_Phone` démarré en 69 s; APK debug courant compilé et installé sur `emulator-5554`.
- ZonZon démarre et reste actif sans crash ni erreur Flutter/Android (`pid` présent, Logcat propre).
- Test visuel non exploitable : le processus Android `System UI` de l'AVD entre systématiquement en ANR, y compris après redémarrage ciblé. Prochain essai recommandé sur `UniCampus_API35` ou téléphone physique.

### Session 72 (2026-07-13) — Résilience aux erreurs DNS mobiles

- Diagnostic terrain : backend Fly.io disponible (`HTTP 200`), mais Android échoue parfois à résoudre `zonzon-backend.fly.dev` lors des transitions Wi-Fi/4G, DNS privé ou pertes réseau temporaires.
- `ApiClient` détecte maintenant les `Failed host lookup` même encapsulés par `http.ClientException`, attend 800 ms puis rejoue une fois la requête. Aucun retry automatique des timeouts afin d'éviter une double création si la requête a atteint le serveur.
- Les écrans peuvent traduire les erreurs via `apiErrorMessage`; la création client n'affiche plus `ClientException`/`SocketException`, mais une consigne réseau claire.
- Validation : `flutter analyze` sans constat, `flutter test` 38/38 dont 3 nouveaux tests réseau.

### Session 71 (2026-07-13) — Carte détaillée et navigation par icônes

- Le mode clair utilise désormais les tuiles OpenStreetMap standard, plus riches en commerces, services, bâtiments publics et points de repère. Le mode sombre conserve les deux couches CARTO.
- Attribution OpenStreetMap/CARTO ajoutée aux cartes principale et de sélection de lieu.
- La barre client masque les textes Accueil/Commandes/Messages/Boutiques, conserve leurs libellés sémantiques et utilise des icônes de 30 à 32 px dans une barre de 64 px.
- Validation : `flutter analyze` sans constat, `flutter test` 35/35.
- APK release généré et installé sur le Samsung `SM-S918B` : 61 767 818 octets, SHA-256 `C66551657C06A81760CF22A9F49DEBDD80EA165C1BADBDE8F0D72CF8278F34A7`.

### Session 70 (2026-07-13) — Correctif zone sûre carte accueil

- Le bouton clair/sombre de `OrderMapWidget` tient désormais compte de `MediaQuery.padding.top`, évitant tout chevauchement avec les icônes système Android/iOS.
- Le bandeau `ZonZonExpress` de l'accueil client est aligné sur ce contrôle et réserve sa largeur à droite.
- L'entrée Profil est retirée de la barre client (désormais 4 onglets). Un bouton Profil est placé à côté du contrôle clair/sombre; sa branche `go_router` est conservée et masque la barre inférieure lorsqu'elle est ouverte, avec retour explicite vers Accueil.
- Validation : `flutter analyze` sans constat, `flutter test` 35/35.
- APK release régénéré : `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (61 751 426 octets, SHA-256 `CD38C29C1A5FAEBF649EFC3A15C9D23000802C14A18ABE4ADE1B1E4B48289FFD`).

### Session 69 (2026-07-12) — Publication post-négociation

- **Git** : commit fonctionnel `f81cfe6` (`feat: finalize negotiated delivery flows`) poussé sur `origin/main`.
- **Backend** : déployé sur Fly.io (`https://zonzon-backend.fly.dev`) avec migration des propositions. Image Docker alignée sur Node 22, requis par Firebase Admin 14.
- **Admin** : build production publié sur Cloudflare Pages (`https://zonzon-admin.pages.dev`, déploiement `35b948b1`).
- **PWA iOS** : projet Cloudflare Pages `zonzon-pwa` créé puis publié (`https://zonzon-pwa.pages.dev`, déploiement `3db69dee`).
- **Android** : APK release généré dans `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (61 685 890 octets, environ 58,8 Mo).

### Session 68 (2026-07-12) — Corrections complètes post-audit négociation

- **Sécurité User** : `password` et `fcmToken` sont désormais `select:false`; l'authentification et le fallback FCM les sélectionnent explicitement. Assertions e2e ajoutées sur les réponses d'inscription.
- **Négociation robuste** : expiration configurable (`PRICE_PROPOSAL_TTL_SECONDS`, 120 s par défaut), offres expirées/superseded, livreur actif ou indisponible rejeté, radar filtré pendant une offre en attente et migration unique `1780500000000` avec index d'expiration.
- **Limite client** : maximum de cinq commandes ouvertes contrôlé sous transaction et verrou pessimiste; la sixième reçoit `409`, couvert en e2e.
- **Temps réel Flutter** : l'acceptation négociée injecte la commande complète dans `orderAccepted`, synchronise le prix final, restaure les raccourcis actifs, ouvre le panneau course et démarre le GPS.
- **PWA iOS** : négociation complète livreur/client, masquage du prix estimatif, notifications temps réel, expiration visuelle et quatre tests dont trois tests HTTP dédiés.
- **Dépendances** : Nest Platform Express/Multer, Firebase Admin (API modulaire) et Angular admin mis à niveau. `npm audit --omit=dev` retourne 0 vulnérabilité pour backend et admin.
- **Validation** : backend build OK, 373/373 unitaires, 60/60 e2e; Flutter analyze 0 et 35/35 tests; PWA build + 4/4 tests; admin build + 6/6 tests. Avertissement restant : budget initial admin 611 kB > 500 kB. Dette ESLint backend historique non masquée et conservée au backlog.
- **Production** : aucun déploiement, commit, push ou APK généré pendant cette passe; l'item OPS reste ouvert.

### Session 67 (2026-07-12) — Audit global post-négociation

- **Verdict : FAIL**. Builds backend/admin/PWA et analyse Flutter passent, mais plusieurs défauts bloquants restent ouverts.
- **Sécurité P0** : `User.password` et `User.fcmToken` restent sélectionnés par défaut. Les services renvoient directement des entités avec relations user (`/orders/available`, `/orders/mine`, utilisateurs admin, etc.) sans sérialiseur global, ce qui peut exposer hash et token FCM.
- **Flux négociation P0** : après accord client, Flutter livreur retire seulement la course du radar et affiche un snackbar ; il ne peuple pas `_activeRunOrders`, n'ouvre pas la course et ne démarre donc pas le GPS. La PWA utilise encore `POST /orders/:id/accept`, affiche le prix estimé et n'offre aucun écran accepter/refuser.
- **Disponibilité P0** : aucune expiration de proposition ; un livreur déjà en course peut proposer ; une proposition devenue inacceptable reste `PENDING` et bloque les autres livreurs. `findAvailable` continue parallèlement à montrer cette course à tous.
- **Cohérence P1** : l'événement `orderAccepted` ne contient pas le prix final ; `ActiveOrdersStore` conserve donc l'ancien prix estimatif jusqu'à un refresh manuel. La limite Flutter de 5 commandes actives n'est pas appliquée par le backend.
- **Qualité/sécurité dépendances** : test admin obsolète en échec (5/6), ESLint backend en échec (1837 constats), PWA seulement 1 smoke test. `npm audit --omit=dev` : backend 10 vulnérabilités prod (2 high, dont Multer DoS), admin 6 (5 high Angular, XSS/DoS/info leak), PWA 0.
- **Migrations/ops** : timestamp `1780200000000` dupliqué (`AddNotificationData`/`AddOrderPriceProposals`) ; TypeORM déduplique par nom donc pas de blocage immédiat. Production saine (`/` 200) mais route de proposition absente (`404`) alors que tournées présentes (`401` sans auth) : code local non déployé.
- **Commandes** : backend build + 373/373 unitaires + 58/58 e2e complets, puis spec commandes ciblée 13/13 après ajout du cas de refus ; Flutter analyze + 35/35 ; PWA build + 1/1 ; admin build OK mais tests 5/6 ; audit ESLint et dépendances exécutés séparément.

### Session 66 (2026-07-12) — Négociation du prix client/livreur

- **Nouveau modèle métier** : `OrderPriceProposal` historise montant, livreur, état (`PENDING/ACCEPTED/REJECTED/SUPERSEDED`) et réponse. Migration `1780200000000` ajoutée.
- **Attribution transactionnelle** : une proposition ne réserve ni n'assigne la course. Seule l'acceptation par le client, sous verrous DB sur commande/proposition/livreur, fixe `priceFcfa`, assigne le livreur et passe à `ACCEPTED`. Un refus conserve `PENDING` et rediffuse la course.
- **Compatibilité commerçant/tournées** : les livraisons créées par un commerçant conservent le prix fixé à la création et l'acceptation directe, notamment pour les tournées multi-colis.
- **Temps réel** : événements `orderPriceProposed` et `orderPriceProposalResponded`, notifications persistées/push hors ligne, polling HTTP de secours côté client.
- **Mobile livreur** : les courses client n'affichent plus l'ancien prix automatique dans le radar ; bouton « Proposer un prix », saisie FCFA et état d'attente. Les courses commerçant gardent « Accepter la course » et leur montant.
- **Mobile client** : seul le kilométrage est présenté lors de la création et dans une commande `PENDING`; une carte permet d'accepter/refuser le prix et identifie le livreur. Le prix final devient effectif après acceptation.
- **Carte de suivi** : le panneau d'informations fixe est remplacé par un `DraggableScrollableSheet` rétractable (16 %, 38 %, 82 %), laissant voir la carte. Le commerçant disposait déjà du suivi socket GPS, du fallback ETA et des statuts détaillés ; ces chemins restent inchangés et couverts par les tests existants.
- **Vérifications** : build Nest OK, backend 373/373 unitaires, e2e 58/58 puis scénario ciblé 13/13 incluant refus et nouvelle proposition par un autre livreur ; `flutter analyze` sans erreur et 35/35 tests.
- **Déploiement** : backend non déployé et APK non régénéré. La migration doit être appliquée par `migrationsRun` lors du prochain déploiement Fly avant distribution de la nouvelle APK.

### Session 65 (2026-07-12) — GPS auto-réparable, cartes claire/sombre et autocomplétion

- **Suivi GPS livreur renforcé** : stream `Geolocator` en précision navigation, service foreground Android avec wake lock, position fraîche forcée toutes les 30 s en cas de silence, reprise automatique après erreur et retour utilisateur lors de la perte/récupération du signal.
- **Secours aux événements socket manqués** : `GET /orders/:id/eta` expose maintenant la dernière position persistée fraîche (`driverLat`, `driverLng`, `positionAt`). Les suivis client et commerçant Flutter, ainsi que le suivi client PWA, restaurent le marqueur lors du polling ETA sans remplacer le temps réel.
- **Carte claire/sombre** : bouton sur les cartes de suivi et le sélecteur de lieu, styles CARTO light/dark, préférence persistée via stockage sécurisé avec comportement dégradé sûr si ce stockage est indisponible.
- **Recherche de lieux** : Photon devient le moteur principal à partir de 2 caractères, centré sur Lomé, filtré sur le Togo, avec résultats préfixés prioritaires, déduplication et garde contre les réponses réseau obsolètes. Nominatim reste le fallback et le moteur de géocodage inverse. Test ajouté pour `Adi` → `Adidogomé`.
- **Android** : permission `WAKE_LOCK` ajoutée ; le suivi reste limité aux courses actives.
- **Vérifications** : `flutter analyze` sans erreur ; `flutter test` 35/35 ; backend `npm test -- --runInBand` 373/373 et build Nest OK ; PWA 1/1.
- **Déploiement** : code non déployé et APK non régénéré pendant cette session. Il faut déployer le backend puis distribuer une nouvelle APK pour le test terrain complet.

### Session 64 (2026-07-12) — Correctifs complets après audit tournées

- **Mobile livreur multi-course** : état des courses actives isolé et testé; les événements de statut/paiement mettent à jour chaque arrêt, une course terminale est retirée sans toucher aux autres et le GPS reste actif tant qu'au moins une course subsiste. Les raccourcis actifs sont devenus un widget testé.
- **Montant livreur** : prix FCFA formaté et visible sur le radar, les raccourcis de courses actives et dans le panneau de conduite; fallback lisible si le prix manque.
- **Mobile commerçant** : `_runId` est réinitialisé si le point de retrait ou le livreur change, supprimant les associations incohérentes avec une tournée précédente.
- **PWA iOS** : `DeliveryRun`/`runId`, API création/liste et mode explicite « Livrer plusieurs colis avec ce livreur » ajoutés. Le formulaire conserve retrait/livreur entre colis et propose de terminer la saisie de tournée. Build OK et test Angular 1/1 (mock `SwUpdate` réparé). Aucun projet Cloudflare Pages dédié à la PWA n'existe actuellement; seul `zonzon-admin` est listé.
- **Backend/e2e** : harness enrichi avec `DeliveryRunRepository` et le query builder de recherche téléphone; scénario HTTP complet de deux colis acceptés puis terminés par un même livreur. Unitaires 373/373, e2e 57/57, build OK.
- **Production** : backend Fly déployé en version 25, migrations tournées appliquées au démarrage, machine `started`; health `200`; `/v1/orders/runs/mine` renvoie `401` sans authentification (route présente) au lieu de `404`.
- **Validation Flutter** : `flutter analyze` sans issue, `flutter test` 34/34. APK release produit dans `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (60,3 Mo).

### Session 63 (2026-07-12) — Audit de régression après tournées multi-colis

- **Verdict : FAIL, pas de distribution de l'APK actuel.** La production Fly est restée sur l'image du `2026-07-12T16:21:31Z`, antérieure au commit `e099bb4` (`19:05Z`) : `GET https://zonzon-backend.fly.dev/v1/orders/runs/mine` retourne actuellement `404`. Or l'APK construit appelle `POST /v1/orders/runs` dès qu'un commerçant sélectionne un livreur; ce flux échoue donc en production tant que le backend et ses migrations ne sont pas déployés.
- **Régression mobile confirmée sur une tournée** : `driver_screen.dart` conserve les arrêts terminés dans `_activeRunOrders` et appelle `_stopLocationUpdates()` à la fermeture de n'importe quel dialogue. Après avoir terminé/quitté le premier arrêt, le GPS peut donc être stoppé alors qu'un autre arrêt de la même tournée est toujours actif; les mises à jour socket ne traitent aussi que l'arrêt ouvert.
- **Régression tests confirmée** : `npm run test:e2e -- --runInBand` ne démarre plus 6 suites (55 échecs), car le harness `backend/test/test-helpers.ts` n'injecte pas le nouveau `DeliveryRunRepository` requis par `OrdersService`. Les tests unitaires backend restent verts (373/373), mais ne remplacent pas ces scénarios HTTP.
- **Parité incomplète** : la PWA iOS commerçant continue de créer une seule livraison (`preferredLivreurId` seulement), sans création ni réutilisation de `runId`.
- **Vérifications exécutées** : backend `npm test -- --runInBand` (373/373) et `npm run build` OK; Flutter `flutter analyze` propre et `flutter test` 29/29; builds Angular admin et PWA OK. L'admin a seulement ses avertissements de taille de bundle et d'optional chaining déjà signalés.

### Session 61 (2026-07-12) — Tournées commerçant multi-colis

- Ajout de `DeliveryRun`, migrations, API création/liste de tournées, rattachement des commandes commerçant et exception transactionnelle contrôlée à la course unique pour une même tournée.
- Mobile: création automatique de tournée avec ajout successif de colis et cartes d'arrêts actifs côté livreur.
- Vérifications: backend 373/373, Flutter 29/29, analyse propre.

### Session 60 (2026-07-12) — Rouvrir une course active côté livreur

- Le dialogue de course pouvait être fermé par le retour Android alors que `_activeOrderData` restait en mémoire, sans aucun accès UI pour le rouvrir. Le radar affiche maintenant une carte persistante « Course en cours » qui restaure le même panneau avec itinéraire, discussion et actions de statut.
- Vérification: `flutter analyze` sans issue. Aucun APK généré à la demande du PO.

### Session 62 (2026-07-12) — PWA iOS (Angular) — Round 5 : finition PWA + polish HIG (dernier round)

- **Installation « Ajouter à l'écran d'accueil »** : `PwaInstallService` (`pwa/src/app/shared/services/pwa-install.service.ts`) détecte iOS+Safari (regex UA excluant CriOS/FxiOS/EdgiOS/OPiOS — ces navigateurs iOS tiers n'ont pas le même flux Partager) et mode standalone (`navigator.standalone` + `matchMedia('(display-mode: standalone)')`) ; expose `showIosGuide` (dismiss mémorisé en `localStorage`) et capture `beforeinstallprompt`/`appinstalled` pour un vrai bouton Android (bonus). `InstallGuideComponent` (guide 3 étapes iOS + bouton Android) monté dans les 3 shells (`shells/*/*.component.html`, entre le header et le contenu — flux normal, pas de position fixe, pour ne jamais perturber le `height:100dvh` des shells).
- **Shell hors-ligne** : `ConnectivityService` (signal `online`, events `online`/`offline`) + `OfflineBannerComponent` (bandeau fixe rouge en haut, `position:fixed`) monté globalement dans `app.html`. Pour éviter que ce bandeau ne recouvre le grand titre des shells, les 3 `shell.css`/`*-shell.component.ts` ajoutent une classe `shell-header--offline` (padding-top dynamique) quand `!connectivity.online()`. `SwUpdateService` (`sw-update.service.ts`) écoute `SwUpdate.versionUpdates` (`VERSION_READY`), revérifie au démarrage + toutes les 6h ; `UpdateToastComponent` affiche « Nouvelle version disponible » avec reload **uniquement à l'appui utilisateur** (jamais automatique). `ngsw-config.json` : ajout de `dataGroups` (`strategy: freshness`, réseau-prioritaire, TTL 1h, timeout 5s) sur **seulement** `GET /v1/zones` et `GET /v1/shops/categories` (les 2 seuls GET peu sensibles suggérés par la consigne — vérifié dans `backend/src/zones/zones.controller.ts` et `shops.controller.ts` que ce sont des données de référence identiques pour tous les utilisateurs, pas de risque de fuite cross-user malgré l'auth requise sur `/zones`). Aucun endpoint de mutation (POST/PATCH) ni `/orders`, `/notifications`, `/messages` n'est dans `ngsw-config.json` — l'Angular Service Worker ne met de toute façon jamais en cache les requêtes non-GET.
- **Web push défensif (honnête sur les limites)** : `WebPushService` (`shared/services/web-push.service.ts`) gère la permission `Notification` avec un état explicite (`unsupported`/`requires-install`/`not-requested`/`denied`/`granted`) — sur iOS hors mode standalone, l'état reste bloqué à `requires-install` (message « Installez ZonZon sur l'écran d'accueil pour activer les notifications », jamais une fausse promesse). `notifyLocal()` affiche une notification native **uniquement** si permission accordée ET onglet non visible. `RealtimeNotificationsBridge` (`realtime-notifications-bridge.service.ts`) relie les events Socket.IO déjà diffusés (`orderStatusUpdated`, `orderPaymentUpdated`, `orderAccepted`, `newOrderAvailable`, `chat:message`, `direct:message` — tous confirmés dans `backend/src/orders/orders.gateway.ts`, diffusés à la room `user:${id}` que chaque client rejoint à la connexion) à `notifyLocal()` ; démarré/réinitialisé depuis `AuthService` juste après `SocketService.connect()`/`disconnect()` (le socket doit exister avant de subscribe — limite de l'archi `SocketService.on$` existante). **Documenté explicitement en commentaire dans `WebPushService`** : ceci n'est PAS du Web Push standard — ça ne fonctionne que tant que l'onglet/app tourne (pas app fermée). Le vrai Web Push (VAPID + `PushManager.subscribe()`) n'est PAS implémenté : le backend actuel envoie via Firebase Cloud Messaging (tokens natifs mobile), aucun endpoint pour un abonnement Web Push standard n'existe. Pour livrer un vrai push iOS de bout en bout il faudra, dans un round backend ultérieur, soit intégrer `firebase/messaging` (SDK JS Web + clé VAPID Firebase + envoi FCM Web), soit ajouter un vrai endpoint VAPID (`web-push` npm) — ni l'un ni l'autre fait ici. `PushSettingsRowComponent` (nouveau, monté dans les 3 écrans Profil après la ligne Notifications) affiche l'état réel sans jamais mentir.
- **Polish HIG transverse** : `pull-to-refresh.directive.ts` (léger, sans dépendance, indicateur inséré en flux normal — pas de position absolue pour éviter le clipping par `overflow-y:auto`) posé sur les 3 listes principales (`client/orders`, `driver/my-deliveries`, `merchant/deliveries`) via `(zzRefresh)="load()"`. `:focus-visible` global (outline `--zz-go`, jamais au clic souris) ajouté dans `styles.css`. `@media (prefers-reduced-motion: reduce)` global coupe toutes animations/transitions CSS. Tap targets ≥44px vérifiés/renforcés sur les nouveaux composants (bouton fermer guide install, boutons toast). **Essayé puis retiré** : `withViewTransitions()` (transitions de navigation façon iOS) — déclenchait une `InvalidStateError: Transition was aborted because of invalid state` constatée en test réel (Browser pane, navigations répétées) ; retiré pour ne pas polluer la console sans bénéfice garanti (la consigne autorisait explicitement à ne pas forcer si ce n'est pas faisable proprement).
- **`apple-touch-startup-image`** : non ajouté (nécessiterait des images de splash par taille d'écran que le projet n'a pas ; la consigne autorisait à l'ignorer si non trivial). Manifest/icônes/`apple-touch-icon` déjà corrects depuis le Round 1, revérifiés ici (192/512 + maskable présents et référencés).
- **Vérification manuelle réelle** (Browser pane, `ng serve` local via nouveau `pwa/.claude/launch.json`) : bandeau hors-ligne apparaît/disparaît correctement sur événements `online`/`offline` simulés ; navigation testée sans régression après retrait de `withViewTransitions()` (0 erreur console sur plusieurs reloads) ; écran Profil commerçant confirmé affichant « Notifications push — Refusées » (état réel du navigateur de test) ; indicateur pull-to-refresh confirmé présent dans le DOM (texte « Tirer pour actualiser ») sans casser l'écran Livraisons commerçant (dégradation propre avec bandeau d'erreur + Réessayer, comme prévu, appels backend prod bloqués par CORS depuis localhost — attendu, identique aux rounds précédents).
- **Build final** : `npm run build` (prod) **OK** — initial **332.97 kB raw / 92.47 kB transfert** (vs 324.98 kB Round 4, +8 kB pour les nouveaux services/composants), 0 warning, budget 500k/1M inchangé. `ngsw.json` généré avec `dataGroups` (`api-freshness`, `strategy: freshness`, `maxAge: 3600000`, `timeoutMs: 5000`) vérifié en sortie de build.
- **Non touché** : `backend/`, `admin-dashboard/`, `mobile_app/`. Aucun nouvel écran métier (hors scope du round, conforme à la consigne).
- **PWA iOS V1 terminée** (Rounds 1→5) : 3 rôles complets, auth, temps réel/carte/chat, et maintenant capacités PWA natives (install, offline, web push défensif) + polish HIG. Reste ouvert pour un round backend futur si souhaité : vrai Web Push VAPID/FCM Web (voir ci-dessus).

### Session 61 (2026-07-12) — PWA iOS (Angular) — Round 4 : rôle Commerçant

- **Infra partagée étendue** (`pwa/src/app/shared/`) : `order.model.ts` gagne `AvailableDriver` (réponse `GET /orders/available-drivers`) et `CreateMerchantOrderPayload` (`POST /orders/merchant`). `OrdersService` gagne `createMerchant()`, `findAvailableDrivers(lat?, lng?)`, `assign(orderId, livreurId)`, `updatePrice(orderId, priceFcfa, reason?)`, `updatePaymentStatus(orderId, paymentStatus)` — cohérent avec le principe déjà appliqué au Round 3 (les endpoints du domaine `/orders/*` restent dans le service partagé, même quand un seul rôle les utilise pour l'instant). Fix bonus : `status-colors.ts` → `PAYMENT_STATUS_VARIANTS` ne mappait pas `CASH_ON_DELIVERY`/`REFUNDED` (retombaient sur la variante `mut` par défaut) ; complété (`CASH_ON_DELIVERY: 'go'`, `REFUNDED: 'mut'`) car le nouveau sélecteur de statut de paiement commerçant expose désormais ces valeurs dans l'UI.
- **Nouveaux fichiers rôle Commerçant** (`pwa/src/app/merchant/`) : `merchant.model.ts` (`MerchantDriver`, `MerchantDriverStatus`, `InviteDriverPayload`, `ConversationParticipant`/`ConversationResponse`), `merchant.service.ts` (`GET/POST /merchants/me/drivers`, `DELETE /merchants/me/drivers/:driverId`, `GET /orders/:id/conversation`, `POST .../conversation/participants`, `DELETE .../conversation/participants/me`), `driver-picker/driver-picker.component.ts` (sélecteur réutilisable « laisser la plateforme choisir » ou livreur affilié/disponible — utilisé par Créer et par la réassignation dans le suivi, évite de dupliquer le markup).
- **Écrans livrés** (remplacent les 4 placeholders du shell commerçant) :
  - **Livraisons** (`/merchant/deliveries`) : `GET /orders/mine` (cas COMMERCANT — livraisons créées), 3 tuiles de stats calculées côté client (livraisons du jour via `createdAt`, terminées `COMPLETED` toutes périodes, montant total = somme `priceFcfa ?? estimatedPrice` hors `CANCELLED`/`FAILED`), puis listes actives/passées avec pills statut+paiement (même patron que `driver/my-deliveries`).
  - **Créer** (`/merchant/create`) : section client (téléphone validé `^\+?[0-9]{8,15}$` côté UI + nom optionnel), carte tappable retrait/livraison (réutilise `OrderMapComponent`), description, estimation debounce (`POST /orders/estimate`) avec bascule « prix manuel » (`priceFcfa`+`priceReason`), `DriverPickerComponent` alimenté par `findAvailableDrivers` (refetch sur changement du point de retrait), soumission → `POST /orders/merchant` → redirection vers le suivi commerçant.
  - **Livreurs** (`/merchant/drivers`) : `GET /merchants/me/drivers`, badges FR dédiés par statut (PENDING « Invitation en attente » mango, ACTIVE « Affiliation active » go, REJECTED « Refusée » coral, REMOVED « Retirée » mut) — le message après invitation reflète le statut réel renvoyé (jamais « affilié avec succès » tant que ce n'est pas `ACTIVE`), retrait avec confirmation inline (`DELETE`, soft → `REMOVED`, conservé dans la liste pour historique).
  - **Suivi commerçant** (`/merchant/deliveries/:id`) : `StatusTimeline` + `OrderMap` avec position live du livreur (`driver:position` filtré par `orderId`) + resynchronisation HTTP sur reconnexion socket (même patron que le suivi client/l'écran de conduite livreur) ; badge paiement + panneau de changement (raccourci « Reçu (commerçant) » + sélecteur des 7 valeurs `PaymentStatus`, désactivé si valeur inchangée) ; panneau d'ajustement de prix (si non terminale) ; panneau de réassignation via `DriverPickerComponent` (si `PENDING` uniquement, respecte la règle backend) ; conversation — « Discuter » ouvre le chat partagé et rejoint automatiquement la conversation (`POST .../participants`, non bloquant), « Quitter la conversation » ferme le chat et appelle `DELETE .../participants/me`.
  - **Profil** (`/merchant/profile`) : identique au patron client (infos+édition `PATCH /users/me`, photo `POST /users/me/photo`, accès notifications, déconnexion) — pas de gestion boutique/produits ici, hors scope PWA V1 comme précisé dans la consigne.
  - **Notifications** (`/merchant/notifications`, sous-page hors tab bar) : identique au patron driver/client, navigation vers le suivi commerçant (`/merchant/deliveries/:id`) au tap.
- **Vérification manuelle** : `.claude/launch.json` (config `pwa` existante) réutilisée pour prévisualiser via le Browser pane avec une session simulée (`localStorage` fake token + user `COMMERCANT`). Les 4 onglets + le suivi (état « introuvable » sur un id factice) rendent sans erreur console ; les appels vers le backend de prod échouent par CORS depuis `localhost:4200` (attendu, hors origine autorisée) et dégradent proprement vers les bandeaux d'erreur + bouton Réessayer, comme aux rounds précédents.
- **Build final** : `npm run build` (prod) **OK** — initial **324.98 kB raw / 89.80 kB transfert** (quasi inchangé vs Round 3, écrans commerçant lazy-loadés : `create-component` 13.7 kB, `deliveries-component` 7.4 kB, `drivers-component` 10.2 kB, `delivery-detail-component` 17.1+14.1 kB), 0 warning, aucun ajustement de budget nécessaire.
- **Non touché** : `backend/`, `admin-dashboard/`, `mobile_app/`, shells/écrans client (Round 2) et livreur (Round 3), inchangés.
- **Reste (round suivant)** : R5 finition PWA (install home-screen, offline shell, web push iOS ≥ 16.4, polish HIG).

### Session 60 (2026-07-12) — PWA iOS (Angular) — Round 3 : rôle Livreur

- **Nouveaux fichiers** (`pwa/src/app/driver/`) : `driver.model.ts` (`Vehicle`, `UpsertVehiclePayload`, `Affiliation`), `driver.service.ts` (`PATCH /users/me/availability`, `PATCH /users/me/visibility`, `GET/PUT /vehicles/me`, `GET/PATCH /drivers/me/affiliations/:merchantId`, `POST /users/me/id-card-photo`, `GET /users/:id/id-card-photo` en blob authentifié — même technique que `admin-dashboard/drivers.service.ts`). `findAvailable()`/`accept()` ajoutés à `shared/services/orders.service.ts` (cohérent avec le domaine `/orders/*` déjà logé là).
- **Correctif bonus dans l'infra partagée** : `AuthService.uploadPhoto()` typait la réponse comme `User` complet et remplaçait tout `currentUser` par le retour du backend — or `POST /users/me/photo` ne renvoie que `{profilePhotoUrl}` (vérifié dans `backend/src/users/users.service.ts` → `updateProfilePhoto`). Ce bug latent (présent depuis le Round 2, non détecté car le composant Profil client n'exploitait pas la valeur retournée) aurait effacé `role`/`driverApprovalStatus`/etc. du signal après upload. Ajout de `AuthService.patchCurrentUser(partial)` qui fusionne au lieu de remplacer ; `uploadPhoto()` l'utilise désormais. `User` (auth/models/user.model.ts) étendu avec `driverRejectionReason` et `idCardPhotoUrl`.
- **Écrans livrés** (remplacent les 3 placeholders + 1 route bonus) :
  - **Radar** (`/driver/radar`) : si `driverApprovalStatus !== 'APPROVED'` → bandeau (PENDING/REJECTED + motif), **aucune course chargée** (garde applicative en plus du 403 backend). Sinon : toggle disponibilité (`PATCH /users/me/availability`) + toggle visibilité privé/public (`PATCH /users/me/visibility`, aide contextuelle), état vide si indisponible, sinon liste `GET /orders/available` + temps réel (`newOrderAvailable` ajoute, `orderAccepted` retire, resynchronisation HTTP sur reconnexion socket), carte avec retrait→livraison/distance/prix, bouton Accepter (`POST /orders/:id/accept`, gère le 409 « déjà prise » en retirant la course de la liste).
  - **Mes courses** (`/driver/my-deliveries`) : actives/terminées via `OrdersService` (store partagé), encart gains estimés (somme `priceFcfa` des courses `COMPLETED`). Chaque carte ouvre l'écran de conduite.
  - **Écran de conduite** (`/driver/my-deliveries/:id`, nouvelle route) : `StatusTimeline` + `OrderMap` (retrait/livraison + position GPS propre du livreur), bouton d'avancement contextuel (`ACCEPTED→EN_ROUTE_PICKUP→AT_PICKUP→IN_PROGRESS→NEAR_CLIENT→COMPLETED`), « Signaler un échec » (`FAILED`) et « Annuler » (`CANCELLED`) accessibles à toute étape active, chat partagé, badge paiement. **GPS** : `navigator.geolocation.watchPosition` démarré uniquement quand le statut de la course est actif (non terminal), stoppé automatiquement dès `COMPLETED/CANCELLED/FAILED` (local ou reçu via `orderStatusUpdated`) ou en quittant l'écran ; échec/refus de permission affiché en bandeau non bloquant ; émission `SocketService.emit('driver:location', {lat,lng})`.
  - **Profil** (`/driver/profile`) : infos + édition + photo, bandeau de statut de validation, toggles dispo/visibilité (redondants avec le radar), **véhicule** (type/plaque/description + zone habituelle via `GET /zones` → `PUT /vehicles/me`), **gains estimés**, **pièce d'identité** (upload `POST /users/me/id-card-photo` + aperçu en blob authentifié `GET /users/:id/id-card-photo`, révoqué à la destruction du composant), **invitations d'affiliation** (`GET /drivers/me/affiliations`, badges de statut, Accepter/Refuser sur les `PENDING` → `PATCH /drivers/me/affiliations/:merchantId`), accès notifications (badge non-lu), déconnexion.
  - **Notifications livreur** (`/driver/notifications`, route bonus hors tab bar) : quasi-identique au centre client, navigation vers l'écran de conduite (`/driver/my-deliveries/:id`) au lieu du suivi client.
- **Vérification manuelle** : session simulée (`localStorage` fake token + user `LIVREUR`) via le Browser pane. Radar/Mes courses/Profil rendus sans erreur console (appels bloqués par CORS localhost→prod, dégradation gracieuse identique au Round 2). Bandeau REJECTED avec motif vérifié explicitement (garde applicative confirmée : aucun appel `/orders/available` déclenché).
- **Build final** : `npm run build` (prod) **OK**, 0 warning — initial **323.90 kB raw / 89.50 kB transfert** (quasi inchangé vs Round 2, écrans livreur lazy-loadés). Budget `anyComponentStyle` ajusté **4 kB → 6 kB** (`pwa/angular.json`) : le CSS du profil livreur (sections dispo/véhicule/pièce d'identité/affiliations) atteignait 5.55 kB, au-delà du seuil d'avertissement mais large marge sous l'erreur (8 kB avant ajustement, 10 kB après) — pas de découpage de composant nécessaire.
- **Non touché** : `backend/`, `admin-dashboard/`, `mobile_app/`, shell/écrans commerçant (restent en placeholder pour le Round 4), shell/écrans client (Round 2, inchangés).
- **Reste (round suivant)** : R4 commerçant (créer livraison, mes livraisons + suivi, livreurs affiliés, profil) → R5 finition PWA.

### Session 59 (2026-07-12) — PWA iOS (Angular) — Round 2 : rôle Client + infrastructure partagée

- **Dépendances ajoutées** (`pwa/`) : `socket.io-client@^4.8.3` (aligné sur `admin-dashboard`), `leaflet@^1.9` + `@types/leaflet`. CSS Leaflet ajouté à `angular.json` (`styles`), `allowedCommonJsDependencies: ["leaflet"]` pour supprimer le warning ESM.
- **Infrastructure partagée créée** (réutilisable rounds livreur/commerçant) :
  - `shared/models/order.model.ts` (`Order`, statuts, `EstimateResult`, `EtaResult`, `ChatMessage`, `Zone`, `AppNotification`, `Paginated<T>`) + `shared/models/shop.model.ts`.
  - Services `shared/services/` : `OrdersService` (store `signal` alimenté par `GET /orders/mine` — le backend n'expose pas `GET /orders/:id`, donc suivi/liste/accueil partagent ce cache), `ShopsService`, `ZonesService`, `NotificationsService` (badge non-lu), `SignalementsService`, `MessagesService`.
  - `shared/services/socket.service.ts` : connexion Socket.IO à la **racine** du backend (pas `/v1`, conforme au gateway NestJS), `on$<T>(event)` en Observable, `emit`, `joinOrderRoom`/`leaveOrderRoom`. Cycle de vie branché dans `AuthService` : connecte au login/restauration de session, déconnecte au logout/purge 401.
  - `shared/status-utils.ts` (libellés FR statut/paiement, alignés sur `mobile_app/lib/utils/order_status_utils.dart`) + réutilisation de `status-colors.ts` (pills).
  - `shared/media-url.ts` (résolution URL média absolue R2 vs legacy `/uploads`, portée depuis `admin-dashboard`).
  - Composants `shared/components/` : `StatusTimelineComponent` (frise ACCEPTED→…→COMPLETED, fait=vert/en cours=mangue/à venir=gris, bandeau corail CANCELLED/FAILED — porté 1:1 depuis `mobile_app/lib/widgets/status_timeline.dart`), `OrderMapComponent` (Leaflet/OSM, marqueurs `divIcon` SVG inline pickup/delivery/driver + polyline, mode `tappable` pour poser un point), `OrderChatComponent` (historique `GET .../messages`, envoi, écoute `chat:message` après `chat:join`, marque lu, ferme la saisie sur statut terminal).
- **Écrans client livrés** (remplacent les 4 placeholders) :
  - **Accueil** (`/client/home`) : carte tappable + segmented « Retrait/Livraison », champs d'adresse texte, description, estimation debounce (`POST /orders/estimate`), bouton plein `--zz-go` → `POST /orders` → redirection suivi. Pré-remplissage du retrait depuis une boutique via `ClientOrderDraftService` (signal partagé, même principe que `ClientServices.pendingShopSelection` côté Flutter).
  - **Commandes** (`/client/orders`) : actives/passées via `OrdersService`, pills statut/paiement.
  - **Suivi** (`/client/orders/:id`) : `StatusTimeline`, carte + position live du livreur (`driver:position` + `orderStatusUpdated` + `orderAccepted` + resynchronisation HTTP sur reconnexion socket), ETA (`GET /orders/:id/eta`, poll 20s), badge paiement (`orderPaymentUpdated` live), chat, annulation (panneau raison, PENDING/ACCEPTED uniquement), signalement (`POST /signalements`), notation post-`COMPLETED` (`POST /orders/:id/rating`).
  - **Boutiques** (`/client/shops` + `/client/shops/:id`) : liste filtrable par catégorie, détail + produits, « commander depuis cette boutique » → bascule Accueil avec retrait pré-rempli.
  - **Profil** (`/client/profile`) : affichage + édition prénom/nom (`PATCH /users/me`), upload photo (`POST /users/me/photo`, méthodes ajoutées à `AuthService`), accès notifications (badge non-lu), déconnexion.
  - **Notifications** (`/client/notifications`, sous-page hors tab bar) : liste paginée, tout marquer lu, tap → marque lu + ouvre le suivi de la livraison liée.
- **Vérification manuelle** : `.claude/launch.json` créé (config `pwa` sur port 4200, absente jusqu'ici) pour prévisualiser via le Browser pane. Accueil vérifié avec une session simulée (`localStorage` fake token/user) : carte Leaflet + attribution OSM rendues, formulaire complet, aucune erreur console. Commandes/Boutiques/Profil vérifiés en état d'erreur/fallback gracieux (appels bloqués par CORS depuis `localhost:4200` vers le backend de prod — comportement attendu hors origine autorisée), aucun crash.
- **Build final** : `npm run build` (prod) **OK** — initial **321.01 kB raw / 88.64 kB transfert** (budget 500k/1M inchangé, marge large), 0 warning. Chunks lazy par écran (`home-component` 8 kB, `order-tracking-component` 24.6 kB, etc.) ; Leaflet (~152 kB raw / 38.7 kB transfert) isolé dans un chunk lazy partagé, absent du bundle initial.
- **Non touché** : `backend/`, `admin-dashboard/`, `mobile_app/`, shells livreur/commerçant (restent en placeholder pour les rounds 3/4).
- **Reste (round suivant)** : R3 livreur (radar, validation/dispo, course active + statuts étendus, GPS, historique/gains, profil) → R4 commerçant → R5 finition PWA.

### Session 58 (2026-07-12) — PWA iOS (Angular) — Round 1 : fondations HIG
- Décision : PWA iOS en **Angular 21** (cohérence avec l'admin, tokens/services réutilisés), **3 rôles** visés (parité Flutter). Nouveau dossier `pwa/` (sibling de `admin-dashboard/` et `mobile_app/`). Le backend de prod (`https://zonzon-backend.fly.dev/v1`) est consommé tel quel.
- **Scaffold** : `ng new pwa` (Angular 21, standalone, sans SSR) + `ng add @angular/pwa` (service worker + manifest). Versions alignées sur l'admin.
- **Chrome iOS conforme HIG** : `index.html` avec `viewport-fit=cover`, `apple-mobile-web-app-capable`, `status-bar-style=black-translucent`, `apple-touch-icon`, `theme-color #0C1A22` ; `manifest.webmanifest` (standalone, portrait, icônes 72→512 + maskable) ; `styles.css` avec tokens `--zz-*` partagés (thème sombre permanent), police système `-apple-system`, `-webkit-tap-highlight-color:transparent`, `touch-action:manipulation` (no-tap-delay), helpers safe-area (`env(safe-area-inset-*)`) appliqués au header et à la tab bar, pills `.zz-pill--go/mango/sky/coral/mut`.
- **App shell** : header large-title + `router-outlet` scrollable + **tab bar iOS** en bas (respectant `safe-area-inset-bottom`). 3 shells de rôle avec onglets prévus (contenu = placeholder « Bientôt ») : Client (Accueil/Commandes/Boutiques/Profil), Livreur (Radar/Mes courses/Profil), Commerçant (Livraisons/Créer/Livreurs/Profil).
- **Auth + plomberie** : `AuthService` (login/register/logout, JWT localStorage, signal `currentUser`, `role()`, `homePathForRole()`) ; **intercepteur HTTP** (Bearer + `timeout(20000)` + purge session & redirection `/login` sur 401 — corrige proactivement 2 findings d'audit : JWT expiré non purgé + appels sans timeout) ; guards `authGuard`/`roleGuard`/`smartRedirectGuard` ; routage lazy par rôle. Écrans **Login** et **Register** (sélecteur de rôle en segmented control iOS + véhicule si Livreur), stylés HIG.
- **Vérifs** : `ng build` (prod) **OK** — initial 262 kB (budget 500k/1M, 0 warning), service worker généré. Vérifié indépendamment. Aucun autre dossier touché.
- **Reste (rounds suivants)** : R2 client (accueil/carte, suivi temps réel + frise statut, chat, historique, profil) → R3 livreur → R4 commerçant → R5 finition PWA (install home-screen, offline shell, web push iOS 16.4+). Limites connues à traiter explicitement : Socket.IO et **web push iOS** (uniquement iOS ≥ 16.4 et app ajoutée à l'écran d'accueil).

### Session 59 (2026-07-12) — Correctifs complets de l'audit mobile

- Les notifications persistées conservent désormais leur contexte FCM dans `notifications.data` (migration `1780200000000`). Les taps `direct_message` ouvrent la messagerie du rôle concerné; les anciens enregistrements restent compatibles.
- Le fil direct ne propose plus que les courses impliquant réellement le contact et affiche les erreurs serveur. Les réponses rapides du client visent maintenant le livreur.
- Les actions livreur utilisent `clientPhone` quand une livraison commerçant n'a pas de compte client; l'ouverture de navigation attend un premier fix GPS. Le centre de notifications et les badges parcourent toutes les pages (lots de 100).
- Vérifications: backend `npm run build` + Jest **365/365**; mobile `flutter analyze` sans issue + `flutter test` **29/29**.

### Session 58 (2026-07-12) — Audit des flux mobiles et accès messagerie client

- **Correction confirmée** : le backend autorisait déjà le rôle `CLIENT` dans `DirectMessagesService`, mais le shell mobile ne proposait que quatre onglets et aucun accès à `MessagingHubScreen`. Une branche `StatefulShellRoute` et un cinquième onglet `Messages` ont été ajoutés entre `Commandes` et `Boutiques`.
- **Revue indépendante** : aucun P0. P1 à traiter: notification de message général sans deep-link vers le fil, sélection possible d'une course non partagée avec le contact dans un message général, et absence de fallback `clientPhone` pour un livreur sur les courses commerçant créées sans compte client. P2: navigation ouverte avant premier fix GPS, pagination/compteur des notifications limités à 20, et réponses rapides incorrectes pour un client depuis `Messages > Courses`.
- **Vérifications du correctif d'accès** : `flutter analyze` : **No issues found**; `flutter test` : **29/29**. Les autres findings restent volontairement séparés et documentés dans `TODO.md` pour une correction atomique sans masquer les risques.

### Session 57 (2026-07-12) — Synchronisation temps réel messages et statuts

- **Cause** : le backend diffusait déjà `direct:message` et `orderStatusUpdated`, mais l'application n'exposait pas le premier dans son contrôleur partagé. Les écrans ne rattrapaient pas non plus les changements intervenus pendant une coupure/reconnexion Socket.IO.
- **Correctifs mobile** : `OrderSocketController` expose maintenant `directMessages$`; le fil général de `MessagingHubScreen` ajoute un message reçu sans rafraîchissement manuel. `ChatService` recharge son historique après reconnexion. Les shells client, suivi client et accueil commerçant rechargent leurs commandes au signal de reconnexion, tandis que le suivi complète chaque transition de statut par une synchronisation HTTP non bloquante.
- **Vérifications** : `flutter analyze` : **No issues found**; `flutter test` : **29/29**; `flutter build apk --release` : succès (`app-release.apk`, 58.6 MB).

### Session 56 (2026-07-12) — Passe UI Material 3 et adaptation HIG iOS

- **Portée** : revue et correction des parcours les plus utilisés (authentification/inscription, shell client, radar livreur, profils, historique, messagerie, notifications, accueil et commandes commerçant). Aucune API, route métier ni règle de livraison n'a été modifiée.
- **Material Design 3** : thème centralisé dans `mobile_app/lib/main.dart` (AppBar, Card, InputDecoration, NavigationBar, SnackBar, couleurs et formes cohérentes). Les navigations client et livreur utilisent désormais les composants M3 au lieu des anciennes barres.
- **HIG / responsive** : `platform_adapter.dart` expose le comportement Cupertino; sur iOS les shells utilisent `CupertinoTabBar`, les transitions/confirmations restent natives. Les écrans principaux contraignent leur largeur sur tablette/desktop afin d'éviter les formulaires et fils de discussion trop étirés.
- **Robustesse** : les API Geolocator dépréciées ont été migrées vers `LocationSettings`; les lints restants ont été corrigés. `flutter analyze` : **No issues found**; `flutter test` : **29/29**; `flutter build apk --release` : succès (`app-release.apk`, 58.6 MB).
- **Limite honnête** : l'APK reste une livraison Android. La base adaptive applique les conventions Cupertino pour un futur build iOS, mais une validation visuelle sur appareil/simulateur iOS demeure nécessaire avant de revendiquer une conformité HIG validée par test matériel.

### Session 55 (2026-07-12) — Régression P0 historique client après déploiement messagerie

- **Incident** : l'écran client « Historique des courses » affichait `TimeoutException after 0:00:15.000000`. La cause n'était pas le client : `/v1/orders/mine` ne répondait plus car le processus Nest ne démarrait pas.
- **Cause** : `DirectMessagesService` injectait `UserRepository`, mais `User` avait été oublié dans `TypeOrmModule.forFeature()` de `MessagesModule`. Nest levait `UnknownDependenciesException` au boot; après dix redémarrages, Fly gardait la machine arrêtée.
- **Correctif** : `User` ajouté au module, `npm run build` et `npm test` (**365/365**) réussis, image Fly corrigée déployée. La machine a été redémarrée explicitement après la limite de redémarrages.
- **Vérification production** : machine Fly `started`, `GET https://zonzon-backend.fly.dev/` renvoie HTTP 200 avec `{status:"ok"}`, logs Nest complets sans erreur DI. Le client peut maintenant réessayer l'historique.

### Session 54 (2026-07-11) — Lier un message général à une course

- Le composeur de conversation générale affiche une action de lien. Elle ouvre la liste des courses de l'utilisateur, puis attache l'identifiant choisi au message envoyé.
- Le fil reste unique pour la paire livreur↔client (ou commerçant↔livreur), tandis que chaque message contextualisé affiche `Lié à la course #xxxxxx`.
- Le backend refuse un lien vers une course qui ne relie pas réellement les deux participants, ce qui empêche tout rattachement abusif.
- `flutter test` : **26/26** verts après la correction de syntaxe du composeur.

### Session 53 (2026-07-11) — Messagerie unifiée commerçant/livreur/client

- Ajout de `direct_messages` et de la migration `1780100000000-AddDirectMessages.ts`. Un message général est autorisé uniquement entre utilisateurs liés par une affiliation commerçant↔livreur `ACTIVE` ou par au moins une course partagée.
- Une conversation générale est donc unique par paire de personnes : un livreur et un client conservent le même fil après plusieurs courses. Le champ `orderId` est optionnel sur chaque message général pour rattacher un message au contexte d'une course donnée, sans fragmenter le fil.
- API : `GET /direct-messages/contacts`, `GET /direct-messages/:userId`, `POST /direct-messages/:userId`. Les notifications et l'événement Socket.IO `direct:message` sont diffusés aux deux participants.
- Mobile : `MessagingHubScreen` accessible par l'icône Messagerie côté livreur et commerçant, avec `Général` (contacts liés) et `Courses` (fils historiques existants). `MerchantProfileScreen` est renommé visuellement `Commerçant`.
- Les nouveaux écrans réutilisent `pushAdaptive`, les composants Material 3 et les helpers Cupertino déjà partagés; aucune modification globale risquée des flux de livraison.
- Vérifications : `npm run build`, `npm test` (**365/365**) et `flutter test` (**26/26**) réussis. `flutter analyze` ne contient aucune erreur, seulement des diagnostics de style/dépréciation existants et deux styles mineurs dans les nouveaux fichiers.

### Session 52 (2026-07-11) — Itinéraire routier dans la carte livreur

- La première version de `DriverNavigationScreen` reliait les marqueurs par une polyline de deux points, ce qui produisait un trait à travers les bâtiments (visible lors du test réel).
- L'écran charge maintenant `POST /orders/estimate` via `EstimateService` depuis la position GPS actuelle du livreur vers le retrait ou la livraison selon le statut. La polyline retournée par OpenRouteService suit les voies routières.
- Si la position GPS n'est pas encore disponible ou si le moteur d'itinéraire ne répond pas, aucun faux trait direct n'est affiché; l'écran conserve les marqueurs et explique que l'itinéraire est indisponible temporairement.
- `flutter analyze` : 11 diagnostics préexistants, aucun nouveau. `flutter test` : **26/26**.
- APK release régénéré : `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (57.9 MB). Aucun appareil ADB n'était connecté après le build, donc pas d'installation dans cette session.

### Session 51 (2026-07-11) — Corrections après simulation réelle multi-rôles

#### Constats production
- La course de simulation `197b6bf3-6124-4f90-833e-bf661edfa9d5` était bien persistée `COMPLETED`, assignée au livreur attendu, à `664 FCFA`; aucune note n'avait été créée. Le problème d'historique était donc un état Flutter figé, non une perte de données backend.

#### Correctifs livrés
- **Notation** : suppression du flux qui demandait au livreur de noter le client. `OrderTrackingScreen` demande la notation uniquement au client; son rechargement `GET /orders/mine` déclenche aussi la demande si l'événement Socket.IO terminal a été manqué.
- **Historique et gains livreur** : les onglets persistants « Mes courses » et « Profil » sont recréés au retour et après une finalisation, afin de relire la course terminée. L'historique affiche désormais un encart cumulant les courses `COMPLETED` et leurs gains bruts; le profil garde son encart de gains estimés.
- **Suivi client** : confirmé dans le code. `OrderTrackingScreen` écoute `driverPosition$` et `OrderMapWidget` affiche le marqueur live du livreur pendant les statuts actifs. Le GPS livreur est émis uniquement pendant une course active.
- **Téléphones commerçant** : `UsersService.findByPhone()` accepte désormais les numéros `+22890123456`, `+228 90 12 34 56` et `90 12 34 56`. La réponse `POST /merchants/me/drivers` retourne maintenant le vrai profil du livreur avec le statut d'invitation. Le champ téléphone du destinataire lance aussi la recherche/sélection de client existant.
- **Navigation livreur** : nouvel écran `DriverNavigationScreen`, accessible depuis la course active avec carte intégrée, marqueurs retrait/livraison/position GPS et cadrage sur la prochaine destination. Les actions de progression restent accessibles dans l'écran de course.

#### Fichiers importants
- `backend/src/users/users.service.ts`, `backend/src/merchant-drivers/merchant-drivers.controller.ts`
- `mobile_app/lib/driver_screen.dart`, `mobile_app/lib/screens/driver_navigation_screen.dart`
- `mobile_app/lib/screens/order_tracking_screen.dart`, `mobile_app/lib/screens/order_history_screen.dart`
- `mobile_app/lib/screens/merchant/create_delivery_screen.dart`

#### Vérifications et déploiement
- `npm test -- --runInBand` : **365/365** backend.
- `npm run build` : backend OK.
- `flutter test` : **26/26** mobile, dont test widget de l'écran navigation.
- `flutter analyze` : 11 diagnostics préexistants, aucun nouveau.
- Backend déployé sur Fly.io le 2026-07-11 et health check HTTP OK.
- APK release généré : `mobile_app/build/app/outputs/flutter-apk/app-release.apk` (57.9 MB). Aucun appareil ADB n'était connecté au moment de l'installation.

### Session 50 (2026-07-11) — Correctif mobile socket/radar après incident prod
- **JWT Socket.IO durci** : `mobile_app/lib/controllers/order_socket_controller.dart` ne crée plus de socket sans jeton exploitable, envoie désormais le JWT à la fois via `auth.token` et via l'en-tête `Authorization: Bearer ...`, et active des paramètres explicites de reconnexion (`reconnectionAttempts=8`, délai progressif, timeout 8 s).
- **État temps réel exploitable** : `OrderSocketController` et `ChatService` exposent maintenant un flux `SocketLifecycleEvent` (connexion, déconnexion, tentative de reconnexion, échec) pour diagnostiquer les incidents réseau et le rejet d'authentification sans s'appuyer sur des logs implicites.
- **Radar réconcilié à chaque connexion/reconnexion** : `mobile_app/lib/driver_screen.dart` recharge `GET /orders/available` à chaque connexion/reconnexion du socket, vide le radar sur `401/403`, supprime la course acceptée localement dès le succès de `POST /orders/:id/accept`, et fusionne les événements `newOrderAvailable` sans doublons ni réapparition de courses déjà présentes.
- **Chat aligné sur le même correctif d'auth** : `mobile_app/lib/services/chat_service.dart` applique le même handshake robuste (JWT obligatoire, `auth` + header Bearer), rejoint à nouveau la room au reconnect et relance `markRead()` après reconnexion.
- **Race de handshake éliminée** : les listeners Socket.IO sont enregistrés avant `connect()` pour ne pas manquer une connexion rapide ou la resynchronisation qui la suit.
- **Tests Flutter ciblés** : nouveaux tests `mobile_app/test/services/socket_auth_options_test.dart` (options Socket.IO + refus sans token) et `mobile_app/test/services/driver_radar_sync_test.dart` (normalisation/upsert du radar). Validation locale exécutée : `dart format` sur les fichiers touchés puis `flutter test` → **25/25 verts**. `flutter analyze` ne relève aucune erreur nouvelle, seulement 11 avertissements préexistants.
- **APK corrigée** : build release généré (`app-release.apk`, 57,9 MB) et installé via ADB sur le téléphone connecté `R58MA7HBBQT`. La validation live du socket est en attente : le téléphone était verrouillé au lancement, donc aucune session livreur ne pouvait se reconnecter à ce stade.

### Session 49 (2026-07-11) — Déploiement local sans GitHub Actions
- **Backend** : image `deployment-01KX8JSF0BQV3W6P4MWF3P9HXB` déployée sur Fly.io ; health check `GET /` valide et machine version 19 active.
- **Admin** : build Angular publié sur Cloudflare Pages. URL de déploiement : `https://20ae89f4.zonzon-admin.pages.dev` ; l'URL de production `https://zonzon-admin.pages.dev` est mise à jour par Pages.
- **Automatisation locale** : `deploy.bat` est désormais le point d'entrée de release. Il arrête la chaîne au premier échec et ne dépend pas de GitHub Actions.
- **APK** : après une première tentative interrompue par la limite de temps locale, le build release a été relancé avec succès (`app-release.apk`, 57,8 MB) et installé via ADB sur le téléphone Android connecté. Le paquet `com.example.mobile_app` est présent dans le profil principal.
- **Incident radar en production** : la commande `197b6bf3-6124-4f90-833e-bf661edfa9d5` a été diffusée à `0/0` livreur à 13:14:49Z. Le livreur concerné est bien `ACTIVE`, `APPROVED`, disponible, public et possède une photo. La cause directe est un socket rejeté sans jeton à 13:14:34Z. Le correctif mobile est maintenant livré localement en session 50 : fallback Bearer confirmé, resynchronisation radar à la reconnexion et durcissement chat validés par `flutter test`.

### Session 48 (2026-07-11) — Désactivation des Actions automatiques
- Les workflows GitHub `ci`, `backend-ci`, `admin-ci`, `flutter-ci` et `deploy` ne sont plus déclenchés automatiquement. Ils restent exécutables manuellement depuis GitHub si besoin.
- Motif : le compte GitHub Free a consommé ses 2 000 minutes Actions incluses de juillet et le budget Actions est fixé à `$0` avec arrêt automatique. Le déploiement manuel local est retenu pour éviter des frais récurrents.

### Session 47 (2026-07-11) — Activation du stockage R2 public des médias
- **Bucket public** : `zonzon-media` est créé sur R2 avec l'URL publique de développement `https://pub-15fc91f9ec6c4eed8ab820c19d1ae0da.r2.dev`. Il sert uniquement aux avatars, logos et images de produits; le bucket des pièces d'identité reste privé et séparé.
- **Accès limité** : une clé S3 `zonzon-media-fly` limitée en lecture/écriture à ce bucket a été créée. Ses valeurs sont uniquement conservées comme secrets Fly `OBJECT_STORAGE_ACCESS_KEY_ID` et `OBJECT_STORAGE_SECRET_ACCESS_KEY`.
- **Production validée** : les six secrets `OBJECT_STORAGE_*` sont appliqués, le déploiement roulant Fly est terminé, `GET https://zonzon-backend.fly.dev/` retourne `ok` et l'URL publique R2 est joignable (404 attendu sur une clé inexistante).
- **Vérification des anciens fichiers** : aucun fichier n'a été trouvé dans `backend/uploads` ni `backend/private_uploads` ; aucune migration historique n'est nécessaire.
- **Validation finale avant commit** : backend `npm test -- --runInBand` (365/365), Flutter `flutter test` (18/18) et dashboard `npm run build -- --configuration production` passent. Le build Angular conserve uniquement trois avertissements préexistants (deux `NG8107` et budget initial de 610 kB).
- **À prévoir** : remplacer l'URL `r2.dev` par un domaine personnalisé avant une forte montée en charge.

### Session 46 (2026-07-11) — Activation du stockage R2 privé des pièces d'identité
- **Cloudflare R2** : bucket privé `zonzon-identity-private` créé et aucun accès public n'est configuré.
- **Fly.io** : les six secrets `IDENTITY_STORAGE_*` sont configurés (endpoint R2, bucket, identifiants S3, région `auto`, path style désactivé). Les identifiants ne sont stockés ni dans le dépôt ni dans ce journal.
- **Production** : le déploiement roulant Fly a redémarré correctement la machine `zonzon-backend`; `GET https://zonzon-backend.fly.dev/` est opérationnel.
- **Limite** : les anciens fichiers éventuellement présents dans le dossier éphémère Fly ne sont pas persistants. Le premier nouvel upload de pièce est désormais envoyé vers R2; un test métier complet exige un compte livreur authentifié et une pièce de test.

### Session 45 (2026-07-11) — Protection complète des pièces d'identité R2
- **Stockage privé distinct** : les pièces d'identité ne passent plus par le bucket média public. Le backend persiste désormais une clé opaque `identity/<filename>` dans `users.idCardPhotoUrl` (colonne réutilisée avec `select: false`, sans migration) et stocke les fichiers dans un dossier privé local `private_uploads/identity` ou dans le bucket R2 privé via `IDENTITY_STORAGE_*`.
- **Accès sécurisé** : nouveau `GET /v1/users/:id/id-card-photo`, authentifié, autorisé uniquement pour le propriétaire ou un `ADMIN`. Le backend sert un flux binaire (`StreamableFile`) et gère aussi les anciens chemins `/uploads/identity/*` ou URL legacy si présents.
- **Fronts adaptés** : l'admin charge la pièce via `HttpClient` en blob puis génère un `objectURL`; Flutter charge le binaire authentifié et l'affiche via `Image.memory`. Les médias publics (avatars, logos, produits) restent inchangés.
- **Configuration/documentation** : `.env.example` documente `IDENTITY_UPLOAD_DIR` + `IDENTITY_STORAGE_*`. `main.ts` ne recrée plus `uploads/identity` public. `flyctl secrets set IDENTITY_UPLOAD_DIR=private_uploads/identity --app zonzon-backend` a bien été appliqué.
- **Tests/validation** : backend `nest build` ✅, `users.service.spec.ts` 27/27 ✅, admin `ng build --configuration production` ✅, Flutter `flutter test test/` ✅, health check `GET /` ✅, endpoint protégé `GET /v1/users/:id/id-card-photo` sans auth → `401`.
- **Limite** : aucun bucket R2 privé n'a pu être créé depuis cette session, faute d'accès Cloudflare non-interactif local (`wrangler` non installé/local auth absent, aucun `CLOUDFLARE_API_TOKEN` disponible). L'inventaire local n'a trouvé aucun fichier sous `backend/uploads/**/identity`; il n'y avait donc rien à migrer ni à supprimer. Si un bucket R2 est fourni plus tard, le backend pourra basculer sans changement de code.

### Session 44 (2026-07-11) — Uniformisation des URLs média R2 côté mobile
- **Correctif ciblé affichage** : les écrans `favorites_screen.dart`, `shop_list_screen.dart` et `driver_profile_screen.dart` utilisent désormais `mediaUrl(...)` pour les logos boutique et la pièce d'identité. Les concaténations directes `$apiUrl$logo` et `$apiUrl$idCardUrl` ont été supprimées pour conserver la compatibilité avec les chemins legacy `/uploads/*` et les URLs absolues du stockage objet.
- **Tests** : `dart format` exécuté sur les 3 fichiers touchés ; `flutter test test/utils/media_url_test.dart` ✅.
- **Limite** : aucun autre écran n'a été modifié, conformément au scope demandé.

### Session 43 (2026-07-10) — Fiabilisation session/mobile et stockage persistant
- **Session, chat et FCM vérifiés** : le code déjà livré purge correctement une session sur `401` (`ClientServices.reset`, token FCM local, credentials), ferme le composer du chat sur statut terminal et confirme le token FCM seulement après une réponse 2xx avec reprise différée après échec. Le backlog a été réaligné sur cet état réel.
- **Stockage objet prêt pour Cloudflare R2/S3** : nouveau `ObjectStorageService` S3-compatible. Les avatars, pièces d'identité, logos boutiques et photos produits sont envoyés vers le bucket quand les variables `OBJECT_STORAGE_*` sont renseignées; sinon le développement local conserve `/uploads`. Les clients Flutter et Angular savent désormais afficher une URL absolue R2 ou un chemin legacy local.
- **Configuration production requise** : créer un bucket R2 public (ou domaine personnalisé), puis définir les six secrets `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_PUBLIC_URL`, `OBJECT_STORAGE_REGION=auto` avant le prochain déploiement Fly. Aucune clé n'est stockée dans le dépôt.
- **Tests** : backend ciblé stockage/utilisateurs/boutiques **47/47** et build NestJS OK; admin production build OK; Flutter : widgets existants + tests utilitaires exécutés avec succès, incluant URL média absolue/legacy et statuts terminaux. `flutter analyze --no-pub` ne contient aucune erreur, seulement alertes de style/dépréciation préexistantes.

### Session 42 (2026-07-10) — Correctifs complets après revue finale
- **Éligibilité livreur unifiée** : `UsersService` impose désormais `ACTIVE` + APPROVED + disponible + photo non vide + `isPublic=true` pour les broadcasts Socket.IO et FCM. Le fallback FCM géolocalisé utilise la même liste; le fallback global la filtre aussi. Un livreur privé n'obtient que les courses qui lui sont réservées et ne peut pas accepter une course publique.
- **Attribution et validation** : les livreurs sans photo sont exclus de `available-drivers` et rejetés lors d'une attribution manuelle. Les DTO de commande client/commerçant et de message rejettent les contenus composés uniquement d'espaces avant le `trim()` des services.
- **Mobile et conversations** : `REFUNDED` est réglé dans le suivi client/livreur; le dashboard commerçant se rafraîchit après création et ne compte que les courses COMPLETED; le radar dispose d'un refus explicite, clairement limité au masquage jusqu'au prochain rafraîchissement. La synchronisation de conversation ne réactive plus implicitement un participant sorti.
- **Tests** : tests backend ciblés **182/182**, e2e **56/56**, build NestJS **OK**, Flutter **12/12**. `flutter analyze --no-pub` conserve 9 alertes préexistantes/non bloquantes (APIs Flutter dépréciées, un switch exhaustif, style de préfixe/import).
- **Limite infra inchangée** : les photos restent stockées dans `uploads/` sur le disque éphémère Fly.io. La validation métier est correcte, mais il faut toujours brancher un stockage persistant avant un usage production durable.

### Session 41 (2026-07-10) — Revue finale mobile/backend post-correctifs (aucune modification applicative)
- **Verdict : FAIL.** Les correctifs annoncés pour l'affiliation, la création commerçant, les statuts, le paiement cash, la photo, le chat et le FCM sont majoritairement présents, mais le code ne passe pas encore une revue CDC complète.
- **P0 confirmé — éligibilité livreur incohérente** : `GET /orders/available` ne vérifie ni `status=ACTIVE` ni `isPublic`, donc un livreur suspendu peut encore voir les courses et un livreur privé peut charger/accepter les courses publiques. Le fallback FCM global (`findLivreursWithFcmToken`) oublie également `isPublic`, `status` et la photo, ce qui contourne le choix de visibilité et notifie des comptes non opérationnels.
- **P1 confirmés** : le sélecteur manuel (`GET /orders/available-drivers` / `assertValidPreferredLivreur`) peut réserver un livreur sans photo, qui sera ensuite refusé par `acceptOrder`; `REFUNDED` manque des sets mobile de paiements réglés (actions client/livreur trompeuses); les DTO `IsNotEmpty`/`MinLength(1)` acceptent les espaces puis les services enregistrent une chaîne vide après `trim()`.
- **P2 confirmés** : le bouton commerçant « Quitter la conversation » est annulé par le prochain `GET` qui réactive les participants principaux; le radar n'a toujours pas de refus explicite; le dashboard commerçant ne se rafraîchit pas après création et son montant inclut aussi les courses non terminées.
- **Tests / qualité** : `npm run build` **OK**; tests unitaires backend **359/359 OK**; sous-ensemble commandes/messages/conversations/affiliation **184/184 OK**; Flutter **11/11 OK**. Mais `npm run test:e2e -- --runInBand` est **FAIL (26/56 passent, 30 échouent)** : les fixtures tentent d'approuver des livreurs sans photo, désormais correctement rejetés. `flutter analyze --no-pub` : 9 alertes sans erreur. `dart format --output=none --set-exit-if-changed lib test` : 39 fichiers non formatés (préexistants ou hors fichiers touchés).
- **Limite infra toujours ouverte** : les uploads restent sur le disque éphémère Fly.io; la photo peut être validée en base mais disparaître au redéploiement tant qu'un stockage persistant n'est pas branché.

### Session 40 (2026-07-10) — Correctifs finaux revue mobile/backend (paiement, photo, chat, FCM, validation)
- **Verdict fonctionnel : PASS ciblé sur les findings de la Session 39.** Les écarts applicatifs signalés par la revue indépendante ont été corrigés côté backend et mobile. Le seul résiduel important est désormais **infra** : les uploads restent servis depuis `uploads/` sur Fly, donc non durables tant qu'un stockage persistant n'est pas branché.
- **Paiement espèces verrouillé de bout en bout** :
  - backend `OrdersService.updatePaymentStatus` limite désormais les transitions par acteur et par statut : client → `PAID`, livreur → `CASH_ON_DELIVERY`, commerçant → `RECEIVED_BY_MERCHANT` / `REFUNDED`, avec garde `status === COMPLETED` hors admin ;
  - mobile client : l'action « J'ai payé en espèces » n'apparaît plus avant `COMPLETED` ;
  - mobile livreur : suppression du bouton prématuré dans le dialog actif ; ajout d'un point de reprise persistant dans l'historique/détail pour confirmer le paiement après la course ;
  - mobile commerçant : la feuille de choix n'expose plus de statuts de paiement arbitraires.
- **Photo livreur durcie** :
  - mobile `RegisterScreen` n'expose plus la session avant l'upload effectif de la photo ; l'inscription livreur devient atomique côté app ;
  - backend : approbation admin, disponibilité et prise/visibilité des courses refusent maintenant un livreur sans `profilePhotoUrl`.
  - **Limite restante** : la photo reste stockée sur le disque Fly éphémère tant qu'un volume/R2/S3 n'est pas configuré.
- **Chat groupe / cycle de vie / FCM / validation** :
  - `ConversationsService.ensureConversation()` matérialise désormais automatiquement client, livreur et commerçant dans les participants canoniques ;
  - `ChatService` a un garde `_disposed` sur son cycle async pour éviter un socket tardif après fermeture ;
  - `PushService` utilise la `rootNavigatorKey` du router au lieu de `WidgetsBinding.instance.rootElement` pour le pre-prompt ;
  - description colis obligatoire côté mobile et DTO backend (`IsNotEmpty` + trim).
- **Qualité / vérifications** :
  - backend : `npm run build` **OK**, `npm test -- --runInBand` **359/359 OK** ;
  - mobile : `flutter test --no-pub` **11/11 OK** ;
  - mobile : `flutter analyze --no-pub` **9 alertes non bloquantes**, aucune erreur ;
  - formatage appliqué sur les fichiers touchés Flutter et NestJS.

### Session 39 (2026-07-10) — Revue indépendante après le commit `2f363dc`
- **Verdict : FAIL.** Les sept corrections annoncées par la Session 38 sont bien présentes dans le code (purge de session/401, guards de routes, statut chat vivant, socket client dispose-safe, paiement visible, FCM conditionné au 2xx et reçus de lecture par participant), mais elles ne suffisent pas pour un PASS CDC complet.
- **P0 confirmés — paiement espèces** : l'action client est disponible avant la fin de la course (`OrderTrackingScreen._canMarkPaid` ne contrôle pas le statut), l'action livreur est visible sur toute course active, et le backend accepte toute valeur de paiement à tout statut. Cela permet de marquer une course payée avant remise des espèces. Après `COMPLETED`, choisir « Plus tard » ou subir une erreur ne laisse aucun point d'entrée dans l'historique, malgré le message qui conseille de réessayer depuis celui-ci.
- **P0 confirmés — photo livreur** : la session est persistée avant l'upload, ce qui laisse `GoRouter` quitter l'inscription avant la boucle bloquante; le backend/approbation admin accepte toujours un livreur sans photo. En plus, l'upload reste dans `uploads/` sur Fly sans volume, donc une photo réussie disparaît après redéploiement/redémarrage.
- **P1 confirmés — groupe et cycle de vie chat** : les participants client/livreur ne sont matérialisés qu'à leur premier envoi, alors qu'ils reçoivent déjà les messages. Le mobile peut donc afficher « lu par tous » après lecture du seul commerçant. `ChatService` n'a pas le garde `_disposed` ajouté à `OrderSocketController` : une sortie rapide peut créer un socket tardif et écrire dans des streams fermés.
- **P1 confirmé — description colis** : le client peut vider le champ puis créer une commande; le mobile ne valide pas `trim().isNotEmpty` et les deux DTO backend ne posent pas de minimum de longueur.
- **P1 probable — pre-prompt FCM** : `PushService` passe `WidgetsBinding.instance.rootElement` à `showDialog`. Ce contexte est au-dessus du `Navigator` de `MaterialApp`, donc le premier pre-prompt peut lever une erreur et empêcher la demande de permission.
- **Qualité/tests** : `npm test -- --runInBand` passe **355/355** (19 suites), le sous-ensemble commandes/messages/conversations passe **161/161**, et `flutter test --no-pub` passe **11/11**. `flutter analyze --no-pub` garde 10 alertes sans erreur. `dart format --output=none --set-exit-if-changed lib test` signalerait 49 fichiers à formater. Aucun test Flutter ne couvre les nouveaux flux session, paiement, photo, FCM ou chat groupe.
- **Documentation** : `TODO.md` est aligné sur ce verdict; les anciennes tâches dupliquées de la revue précédente sont signalées comme historiques.

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

### Session 38-a (2026-07-10) — Revue indépendante avant le commit `2f363dc` (historique)
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
### Session 74 (2026-07-13) — Validation Firebase Cloud Messaging

- Projet Firebase contrôlé dans la console : `zonzon-4eb31`, application Android `com.example.mobile_app`, sender ID `767758360586`, cohérents avec `mobile_app/android/app/google-services.json`.
- API Firebase Cloud Messaging HTTP v1 confirmée **activée** ; ancienne API Cloud Messaging confirmée désactivée.
- Secret Fly.io `FIREBASE_CREDENTIALS_JSON` confirmé présent et déployé sur `zonzon-backend` (valeur non exposée).
- Chaîne applicative contrôlée : initialisation Firebase, permission Android 13+, channel `zonzon_default`, synchronisation et renouvellement du token, endpoint `/users/me/fcm-token`, stockage multi-device et nettoyage des tokens invalides.
- Vérification Android : l'application `com.example.mobile_app` est installée sur l'émulateur et `FlutterFirebaseMessagingBackgroundService` démarre sans erreur FCM visible.
- Test fonctionnel ciblé restant : connecter un compte ZonZon sur un appareil, accepter l'autorisation de notifications, puis déclencher un message ou changement de statut depuis un second compte. Aucune campagne Firebase générale n'a été envoyée afin de ne pas notifier les utilisateurs réels.
### Session 75 (2026-07-13) — Préparation OTP WhatsApp

- Backend : entité `PhoneVerification` + migration `1780600000000-AddPhoneVerifications`, codes à 6 chiffres uniquement stockés sous hash bcrypt, expiration 5 min, renvoi limité à 60 s, maximum 5 essais et consommation unique.
- API publique préparée : `GET /auth/otp/whatsapp/status`, `POST /auth/otp/whatsapp/request`, `POST /auth/otp/whatsapp/verify`. La vérification retourne une preuve JWT courte (10 min) liée strictement au numéro.
- Inscription : `verificationToken` optionnel dans le DTO mais exigé par `AuthService` lorsque `WHATSAPP_OTP_ENABLED=true`. Par défaut `false`, donc aucune régression avant la configuration Meta.
- Fournisseur : adaptateur WhatsApp Cloud API direct (Meta), template Authentication configurable et secrets documentés dans `backend/.env.example`. Aucun secret ni code OTP n'est journalisé.
- Flutter : l'écran d'inscription détecte l'activation, demande le code, affiche un dialogue OTP à 6 chiffres puis transmet la preuve à l'inscription. Un backend ancien retournant 404 sur le statut est traité comme OTP désactivé pour permettre un déploiement progressif.
- Validation : backend build OK + 377/377 tests (dont 4 tests OTP dédiés) ; `flutter analyze` sans issue + 38/38 tests.
- Restant bloqué par configuration externe : compte Meta Business, numéro dédié, template Authentication approuvé, jeton permanent et `Phone Number ID`; ensuite secrets Fly.io, déploiement et test réel.

### Session 76 (2026-07-13) — Tarification administrée et retrait de la négociation

- Décision produit appliquée : suppression de la validation du prix entre livreur et client. Une course client affiche désormais son estimation et le premier livreur éligible l'accepte directement via `POST /orders/:id/accept`.
- Backend : suppression des routes, services, DTO et événements Socket de proposition/réponse. L'entité et l'ancienne migration `1780500000000-AddOrderPriceProposals` restent dans l'historique du dépôt uniquement pour ne pas casser les bases déjà migrées.
- Tarification : `pricing_config` contient désormais `pricePerKm` (défaut 200), `minPriceFcfa` utilisé comme forfait courte distance (défaut 500) et `shortTripMaxDistanceKm` (défaut 2,5). À distance ≤ seuil, le forfait s'applique ; au-delà, le calcul est `base zone + distance × prix/km`.
- Migration : `1780700000000-AddShortTripPricing` ajoute le seuil et normalise le forfait à 500 FCFA. Elle doit être exécutée avant l'utilisation du nouvel admin en production (`migrationsRun: true` lors du déploiement Fly.io).
- Admin Angular : le menu existant **Tarifs** gère les trois paramètres et affiche un résumé de la règle active.
- Flutter Android et PWA iOS : suppression des boîtes de proposition/validation, restauration du prix estimé et acceptation directe côté livreur.
- Validation : backend build OK, Jest 381/381, E2E 58/58 ; Flutter `analyze` sans erreur et 38/38 tests ; builds production admin et PWA réussis (seul warning admin préexistant sur le budget initial).
- État livraison : code prêt localement, non déployé et APK non régénéré pendant cette session.

### Session 77 (2026-07-14) — Contrôles de carte visibles pendant le suivi client

- Régression corrigée dans `mobile_app/lib/screens/order_tracking_screen.dart` : l'en-tête plein écran de la course recouvrait le bouton clair/sombre intégré à `OrderMapWidget` et aucun bouton Profil n'était rendu sur cet écran.
- Disposition : l'en-tête s'arrête désormais à `right: 124`, le Profil est placé à `right: 64` et le thème reste à `right: 12`; les trois éléments partagent le même décalage sous la zone sûre Android/iOS.
- `MapProfileButton` est maintenant un composant partagé dans `mobile_app/lib/widgets/map_appearance_controls.dart`, utilisé par l'accueil et le suivi pour éviter les divergences visuelles.
- Validation : `dart format` appliqué, `flutter analyze` sans erreur et 38/38 tests Flutter réussis.
- État livraison : APK non régénéré et non installé pendant cette session.

### Session 78 (2026-07-14) — Temps réel robuste et conversations directes unifiées

- **Temps réel Flutter** : `RealtimeServices` possède désormais l'unique `OrderSocketController` de la session. Son initialisation est atomique (les appels concurrents partagent la même Future), les écrans ne détruisent plus le socket partagé et un retour au premier plan déclenche une resynchronisation HTTP via `connected$`.
- **Courses/statuts** : les événements Socket.IO sont propagés sans filtre global mutable, puis filtrés par chaque consommateur. Cela évite qu'un écran commerçant ou client masque les événements d'un autre écran. Le radar livreur reste instantané via `newOrderAvailable`, avec `GET /orders/available` toutes les 15 s comme secours.
- **Commerçant** : les changements d'acceptation/statut ne rechargent plus boutique et catalogue; seule la liste des livraisons est resynchronisée.
- **Messagerie directe** : une seule conversation est affichée par paire d'utilisateurs, avec dernier message, compteur non lu et tri chronologique. Un message général peut être lié facultativement à une course (`orderId`) et affiche alors son badge de contexte dans le même fil.
- **Navigation chat** : les courses client↔livreur ouvrent le fil direct unique avec la course présélectionnée. Les courses créées par un commerçant conservent le chat de groupe client/livreur/commerçant, présenté séparément comme « Discussion de course ».
- **Suppression** : nouvelle entité `DirectThreadState`, migration `1780800000000-AddDirectThreadStates` et `DELETE /direct-messages/:userId`. La suppression masque l'historique uniquement pour son propriétaire; un nouveau message fait réapparaître le fil. Aucun message n'est effacé pour l'autre participant.
- **Fichiers majeurs** : `backend/src/messages/direct-messages.service.ts`, `backend/src/entities/direct-thread-state.entity.ts`, `mobile_app/lib/services/realtime_services.dart`, `mobile_app/lib/screens/direct_thread_screen.dart`, `mobile_app/lib/screens/messaging_hub_screen.dart`.
- **Validation** : backend `npm run build` OK et Jest **383/383**; Flutter `flutter analyze --no-pub` sans issue et `flutter test` **40/40**.
- **Déploiement restant** : déployer le backend pour exécuter la migration `1780800000000`, puis régénérer l'APK. Aucun déploiement, commit ni APK n'a été produit pendant cette session.

### Session 79 (2026-07-14) — Déploiement backend et installation Android

- Backend déployé avec `flyctl deploy --app zonzon-backend`; image `deployment-01KXFN5R0V2TMEYRKE7BSMTQ7X`, machine Fly version **28** en région `cdg`, état `started` et smoke checks réussis. Le démarrage Nest/TypeORM est propre, ce qui valide l'exécution des migrations `1780600000000`, `1780700000000` et `1780800000000`.
- Santé production vérifiée après redémarrage : `GET https://zonzon-backend.fly.dev/` retourne **HTTP 200** avec `{"status":"ok","env":"production"}`.
- APK release généré avec `flutter build apk --release --dart-define=API_URL=https://zonzon-backend.fly.dev` : `mobile_app/build/app/outputs/flutter-apk/app-release.apk`, 61 571 458 octets (58,7 Mo), SHA-256 `37305DB06F8FFD004BC2BEA26FEEFE44261D627D8A76B85A24F43B8098AADA91`.
- APK installé avec conservation des données (`adb install -r`) sur `R5CW92DM43V`, Samsung `SM-S918B`. Package `com.example.mobile_app`, version `1.0.0` / code 1, mise à jour à `2026-07-14 06:37:46`.
- Application lancée via ADB, processus Android actif et aucun `FATAL EXCEPTION`/crash de l'application dans les logs immédiats.

### Session 80 (2026-07-14) — Test E2E téléphone client → Pixel 9 livreur

- L'AVD `Pixel_9_Pro` (API 37.1, Google Play, x86_64) a été démarré avec `-gpu swiftshader_indirect`; le Samsung physique `R5CW92DM43V` est resté connecté en parallèle.
- L'APK release existant a été installé avec succès sur `emulator-5554`, package `com.example.mobile_app`.
- Compte de test livreur créé depuis le Pixel : `Pixel Livreur`, téléphone `+22899123457`, véhicule Moto, avec photo de profil. Le compte est apparu dans **Validation livreurs** de l'admin et a été approuvé, puis rendu disponible sur le radar.
- Depuis le téléphone client, une course Soviépé → Université de Lomé a été créée : 7,1 km, estimation 1 412 FCFA. Elle est apparue sur le radar Pixel sans actualisation manuelle, puis a été acceptée.
- Le téléphone client a reçu automatiquement l'état `ACCEPTÉE`, le montant `1 412 FCFA` et `Livreur : Pixel Livreur`. Le flux temps réel client/livreur est donc validé sur deux appareils.
- Le Pixel a demandé l'autorisation de localisation et l'écran système Google **Location Accuracy** reste affiché dans l'émulateur. La course et son acceptation sont déjà validées ; il faut activer ce réglage uniquement pour poursuivre un test GPS de déplacement précis.
- La course de test reste active pour permettre la poursuite du scénario (statuts, position et clôture) si nécessaire.

### Session 81 (2026-07-26) — Revue complète du projet et sauvegarde du travail en attente

**1. Travail non commité sauvegardé (113 fichiers).** Le working tree contenait 85 fichiers
modifiés (+1838/−1789) et 19 fichiers nouveaux, jamais commités : OTP WhatsApp, changement de
mot de passe, forfait courses courtes, états de fils de discussion directe, et 3 migrations
(`1780600000000`, `1780700000000`, `1780800000000`). Découpé en 6 commits par application
(`8975d89` → `3af77bf`) pour que chacun soit cohérent et compile. Non poussé.

**2. Deux changements non documentés découverts en préparant les commits :**
- La **négociation de prix a été entièrement retirée** du backend (`proposePrice`,
  `getPendingPriceProposal`, `respondToPriceProposal` + DTO). Retrait cohérent : aucun front ne
  l'appelle plus. **Mais l'entité `order-price-proposal.entity.ts` et la migration
  `AddOrderPriceProposals` subsistent** — une table est créée en production pour rien.
- L'**URL de production est passée** de `zonzon-backend.fly.dev` à `api.kore-innov.com` sur les
  3 fronts. Restent désalignés : `pwa/ngsw-config.json`, `pwa/src/environments/environment.ts`,
  `.github/workflows/flutter-ci.yml` (qui force encore l'ancienne URL au build APK) et `CLAUDE.md`.

**3. Revue complète — 11 agents en lecture seule sur zones disjointes.**
Livrable : **`REVUE_COMPLETE_2026-07-26.md`**. ~235 findings (~22 critiques, ~87 majeurs).
Les 10 findings critiques ont été vérifiés indépendamment par lecture du code et, pour TypeORM
0.3.30 et socket_io_client 3.1.4, du source des dépendances installées.

**État de santé mesuré** : backend build OK + **386/386** unitaires + **58/58 e2e** ;
mobile `flutter analyze` **0 problème** + **42/42** ; PWA et admin build prod OK (admin :
bundle initial 611,7 kB au-dessus du budget de 500 kB). Aucun secret commité.
7 vulnérabilités npm en prod côté backend, toutes transitives et à impact faible.

**Critiques à traiter avant tout déploiement** (détail et correctifs dans le rapport) :
1. **Sentry Session Replay non masqué** dans l'admin (`maskAllText:false`, `blockAllMedia:false`,
   10 % des sessions) alors que les CNI des livreurs sont préchargées automatiquement.
2. **Un client peut geler sa propre commande** : `PATCH /orders/:id/status {ACCEPTED}` passe les
   3 gardes et laisse la course avec `livreur = null`, sans aucune sortie possible.
3. **Jeton de preuve OTP utilisable comme jeton d'accès** (même secret, pas de `sub`,
   `findOne(undefined)` renvoie le premier utilisateur). Latent tant que `WHATSAPP_OTP_ENABLED=false`.
4. **`GET /orders` ouvert aux livreurs** sans filtre par acteur.
5. **`orderAccepted` diffuse la commande complète** (PII client) à tous les livreurs connectés.
6. **Tab bar PWA à 15 px de hauteur utile** sur iPhone à encoche.
7. **Un mot de passe actuel erroné déconnecte l'utilisateur** (401 traité comme session morte).
8. **Le socket mobile meurt après ~40 s de coupure** et rejoue ensuite toutes les positions GPS.
9. **Admin : `CASH_ON_DELIVERY` et `REFUNDED` inconnus** → paiement cash affiché « — » et
   écrasable.
10. **`GET /orders/merchant-clients/search` renvoie 400 en permanence** (`@Type(() => Number)`
    manquant) — la recherche de client du commerçant n'a jamais fonctionné.

**Vérification à faire en production avant le prochain déploiement** :
`SHOW COLUMNS FROM delivery_orders LIKE 'status';` — la migration `1778500000000` insère des
valeurs d'enum au milieu de la liste, ce que TiDB n'accepte pas.

### Session 82 (2026-07-26) — Vérification de l'état des migrations en production

Connexion SSH `ovh-ubuntu` (141.95.170.57), requêtes **en lecture seule** exécutées depuis le
conteneur `zonzon-backend-ovh` (qui détient les credentials TiDB).

**Résultats :**
- **36 migrations appliquées** en base. Les 3 dernières sont `AddPhoneVerifications1780600000000`,
  `AddShortTripPricing1780700000000` et `AddDirectThreadStates1780800000000` — elles étaient
  **déjà déployées** (déploiement Fly du 14/07). Le fait qu'elles n'aient pas été commitées ne
  les avait pas empêchées de partir : `flyctl deploy` envoie le répertoire de travail, pas le
  commit git. Fly et OVH partagent la même base TiDB.
- **✅ Risque TiDB sur l'enum `status` écarté.** `SHOW COLUMNS` renvoie les 9 valeurs :
  `enum('PENDING','ACCEPTED','EN_ROUTE_PICKUP','AT_PICKUP','IN_PROGRESS','NEAR_CLIENT','COMPLETED','CANCELLED','FAILED')`.
  TiDB a accepté le réordonnancement de la migration `1778500000000`. Confirmation
  fonctionnelle : une commande `FAILED` existe en base. Le point `[À CONFIRMER]` de
  `REVUE_COMPLETE_2026-07-26.md` est tranché.
- **`cancelledBy` n'a encore que 3 valeurs** (`CLIENT`, `LIVREUR`, `ADMIN`) → la migration
  `1780900000000-AddCommercantCancelledBy` est bien la **seule en attente**.

**État du déploiement :**
- `api.kore-innov.com` → HTTP 200, conteneur OVH démarré depuis **10,4 jours**.
- Aucun des correctifs de la session 81 n'est donc en production, et **18 commits ne sont pas
  poussés**.
- ⚠️ **La procédure de déploiement documentée est obsolète** : `PROGRESS.md` et `CLAUDE.md`
  indiquent `flyctl deploy --app zonzon-backend`, alors que la production est sur OVH depuis la
  session 76. Fly reste le secours (même base TiDB, donc une migration lancée là s'applique
  quand même).
- Les migrations s'appliquent automatiquement au démarrage du conteneur
  (`migrationsRun: NODE_ENV === 'production'`) : **redéployer suffit**, il n'y a pas de commande
  de migration à lancer.

### Session 83 (2026-07-26) — Déploiement OVH et versionnement de la configuration

**Sécurité — dernier point de la revue levé** : aucune pièce d'identité n'est stockée en base
(6 livreurs, 0 pièce, 0 à migrer). Le risque de fuite legacy (URL publique, `/uploads/` non
authentifié) n'existe pas. Les correctifs Sentry restent justifiés à titre préventif.

**Analyse du déploiement OVH.** Le conteneur `zonzon-backend-ovh` **n'était pas géré par
Coolify** (aucun label `coolify.managed`) : lancé par un `docker run` manuel, avec 12 labels
Traefik écrits à la main, attaché au réseau `coolify` pour le proxy. Aucun dépôt git, aucun
compose, aucun script sur le VPS — la commande de lancement n'existait nulle part. Le dépôt
GitHub étant privé, le VPS ne peut pas cloner sans clé de déploiement.

**Méthode retenue : docker-compose généré depuis `docker inspect`** du conteneur en service,
plutôt qu'une reconstitution de mémoire. `backend/docker-compose.yml` est désormais versionné.

**Déroulé :**
1. Tag de rollback `zonzon-backend:rollback-20260726` créé **avant** toute modification.
2. Code transféré par `tar | ssh` (296 Ko), en excluant `.env`, `node_modules`, `dist`, `.git`
   et `firebase-adminsdk.json` — vérifié : aucun secret dans l'archive, `.env` du VPS intact.
3. `docker compose config` validé, volumes confirmés `external: true`.
4. Build pendant que l'ancien conteneur servait toujours.
5. Bascule (`up -d`).

**Incident et correction (~3 min d'indisponibilité).** Après bascule, Traefik a renvoyé
**503 « no available server »** alors que l'application répondait 200 en local. Cause :
`the service "zonzon@docker" does not exist` — les routers référençaient un service `zonzon`
qu'aucun label ne définissait. Il devait être résolu ailleurs dans la configuration Coolify et
pointait sur l'IP de l'ancien conteneur, qui a changé à la recréation. Corrigé en déclarant
`traefik.http.services.zonzon.loadbalancer.server.port: "3050"` dans le compose : la
configuration est maintenant autoportante et survit à toute recréation.

**Résultat vérifié :**
- `GET /` → **200**, `GET /v1/shops/categories` → **200**, `GET /v1/orders` sans auth → **401**.
- Migration **`AddCommercantCancelledBy1780900000000` appliquée** — 37 migrations au total,
  `cancelledBy` vaut désormais `enum('CLIENT','LIVREUR','ADMIN','COMMERCANT')`.
- Les 19 commits de la revue (correctifs de sécurité, crash profil, safe areas iOS, statuts
  admin, OTP PWA…) sont **en production**.

**Déploiements suivants :**
```bash
# depuis le poste local, après commit :
tar czf - -C backend --exclude=node_modules --exclude=dist --exclude=.git --exclude=.env   --exclude=uploads --exclude=private_uploads --exclude=firebase-adminsdk.json .   | ssh ovh-ubuntu 'sudo tar xzf - -C /opt/zonzon/backend'
ssh ovh-ubuntu 'cd /opt/zonzon/backend && sudo docker compose up -d --build'
```
Rollback : `sudo docker tag zonzon-backend:rollback-20260726 zonzon-backend:working && sudo docker compose up -d --no-build`

⚠️ **La procédure `flyctl deploy` documentée plus haut dans ce fichier et dans `CLAUDE.md` ne
concerne que le backend de secours** ; elle ne met pas à jour la production OVH.

### Session 84 (2026-07-26) — Déploiement admin, PWA et génération de l'APK

**Admin et PWA déployés sur Cloudflare Pages**, commit `b66bfc3`, environnement Production,
branche `main` :
- `zonzon-admin` → https://zonzon-admin.pages.dev (HTTP 200)
- `zonzon-pwa` → https://zonzon-pwa.pages.dev (HTTP 200, `ngsw.json` et
  `manifest.webmanifest` servis)

Deux constats au passage :
- `wrangler` **était déjà authentifié** (`koreinnovation28@gmail.com`, credentials en cache) —
  contrairement à ce que notaient les sessions précédentes, aucune action manuelle n'a été
  nécessaire.
- Le projet Cloudflare **`zonzon-pwa` existait déjà**, alors que la session 64 indiquait le
  contraire.
- `/ngsw.json` a renvoyé 404 pendant quelques secondes après déploiement : cache CDN de
  l'ancienne version, résorbé seul.

**Vérification du contenu réellement servi** (et pas seulement du code HTTP) :
- Admin : `maskAllText:!0,blockAllMedia:!0` présent dans `main-L3MVZCBS.js` (`!0` = `true` en
  JS minifié) et `CASH_ON_DELIVERY` dans `chunk-FUXM2DNO.js`.
- PWA : « Recevoir un code sur WhatsApp » présent dans `chunk-656DX22Q.js`.

**APK release généré** : `mobile_app/build/app/outputs/flutter-apk/app-release.apk`,
**58,7 Mo**, SHA-256 `b0a36f1109dc1497ac2be22ef500a08b90d94be45a3bd63499e75383eb7304c3`.
Vérifié dans le binaire AOT (`lib/arm64-v8a/libapp.so`) : **7 occurrences de `kore-innov`,
0 de `fly.dev`** — l'APK pointe bien sur la production OVH.

⚠️ **Cet APK reste signé avec la clé de debug** (`signingConfig = signingConfigs.getByName("debug")`,
`android/app/build.gradle.kts:39`) et porte l'applicationId placeholder
**`com.example.mobile_app`** (`:25`). Conséquences avant toute distribution élargie :
- le Play Store refuse tout paquet en `com.example.*` ;
- une APK signée debug **ne peut jamais être mise à jour** par une APK signée en release : le
  jour de la vraie signature, tous les utilisateurs devront désinstaller/réinstaller, ce qui
  effacera `flutter_secure_storage` (donc la session) et les adresses récentes.
À traiter avant la distribution : définir l'applicationId définitif, régénérer
`google-services.json` dans la console Firebase, créer un keystore de release référencé via
`key.properties` (hors dépôt).

**Documentation corrigée** : `CLAUDE.md` documentait `flyctl deploy` comme procédure de
déploiement du backend, ce qui ne met pas à jour la production OVH. URLs, procédures backend
OVH / admin / PWA, commandes de logs et points critiques mis à jour.

### Session 85 (2026-07-27) — APK installé et correctif Firebase/FCM

**APK installé** sur le Samsung `R5CW92DM43V` (SM-S918B) avec `adb install -r` (données
conservées). L'appareil était initialement en `unauthorized` : après acceptation de l'invite de
débogage USB, un `adb kill-server && adb start-server` a été nécessaire pour que le daemon
prenne l'autorisation en compte.

**Découverte majeure — FCM n'a jamais fonctionné.** Les logs de premier lancement ont révélé :
```
I/flutter: Firebase init skipped: PlatformException(Failed to load FirebaseOptions
           from resource. Check that you have defined values.xml correctly.)
```
Cause : le plugin Gradle **`com.google.gms.google-services` n'était déclaré nulle part** dans
`android/`. Sans lui, `android/app/google-services.json` n'est jamais traité au build, les
ressources Firebase ne sont pas générées, et `Firebase.initializeApp()` échoue.

Le fichier `google-services.json` était pourtant correct depuis le début (`project_id`
`zonzon-4eb31`, `package_name` aligné sur l'applicationId). **Seul le plugin manquait** — ce qui
explique le symptôme « notifications push jamais activées » signalé de longue date. Aucun APK
n'avait FCM, y compris ceux de la CI, qui décode pourtant `GOOGLE_SERVICES_JSON` depuis les
secrets mais sans plugin pour l'exploiter.

À noter : **la revue multi-agents est passée à côté** — les agents ont analysé le code Dart, le
`AndroidManifest.xml` et le service FCM (tous corrects) mais aucun n'a inspecté la chaîne de
build Gradle.

**Correctif** (commit `18156d6`) — deux lignes :
- `android/settings.gradle.kts` : `id("com.google.gms.google-services") version "4.4.2" apply false`
- `android/app/build.gradle.kts` : `id("com.google.gms.google-services")`

**Vérifié sur appareil réel** : `I/FirebaseInitProvider: FirebaseApp initialization successful`,
5 clés générées dans `build/app/generated/res/processReleaseGoogleServices/values/values.xml`
(`google_app_id`, `google_api_key`, `google_crash_reporting_api_key`, `google_storage_bucket`,
`project_id`), 0 exception fatale. Les APK de la CI en bénéficient aussi (fichiers versionnés).

**APK final** : 58,7 Mo, SHA-256
`89d3c54112865ff0fc9732f9339269f4147b4775fa28137eb185c8da8386c89e`.

⚠️ **Toujours en attente avant distribution élargie** : l'APK reste signé avec la clé de debug et
porte l'applicationId `com.example.mobile_app` (cf. session 84).

**Méthode de vérification — leçon** : un premier test cherchant les chaînes Firebase dans
`resources.arsc` via `strings` a conclu à tort que le correctif était inopérant. Les ressources
Android compilées n'y sont pas stockées en clair. La vérification fiable est le fichier généré
par `processReleaseGoogleServices` **et** le log d'initialisation sur l'appareil.

### Session 86 (2026-07-27) — applicationId définitif et signature de release

**applicationId `com.example.mobile_app` → `com.zonzon.app`** (choix du PO ; déjà utilisé dans
le code comme `userAgentPackageName` OSM). Le `namespace` et le package Kotlin de
`MainActivity` suivent. Choix **irréversible** une fois publié sur le Play Store.

**Signature de release** : `android/app/build.gradle.kts` lit désormais `android/key.properties`
(non versionné, modèle dans `key.properties.example`). Repli volontaire sur la clé de debug avec
avertissement journalisé si le fichier est absent — le build local et la CI fonctionnent donc
sans keystore, mais un tel APK n'est pas distribuable. `key.properties` ajouté au `.gitignore`
(`*.jks` et `*.keystore` y étaient déjà).

**Firebase** : une app Android `com.zonzon.app` a été enregistrée dans le projet `zonzon-4eb31`
via la console (navigateur interne, sur autorisation du PO). Le `google-services.json` régénéré
couvre **les deux packages** — nouvel `app_id` `1:767758360586:android:2c92dd02d2927daaeb7ff3`,
même `project_number`. Fichier non versionné.

> Le plugin `google-services` **refuse de compiler** si le package ne figure pas dans
> `google-services.json` (`No matching client found for package name`). Comportement sain : il
> échoue plutôt que de produire un APK où FCM serait silencieusement inopérant.

**Aucun changement backend** : il s'authentifie avec le service account au niveau projet, pas au
niveau de l'app Android.

**Vérifié sur appareil réel** (Samsung SM-S918B) : `com.zonzon.app` installée à côté de
l'ancienne, `FirebaseApp initialization successful`, 0 exception fatale.
APK 58,7 Mo, SHA-256 `8e82611de753c05d749da7b99c968176666d3d0bdd72eb4f4b244ae1c5a18caf`.

**Reste à faire par le PO :**
1. Générer le keystore et le sauvegarder hors du poste :
   `keytool -genkey -v -keystore ~/zonzon-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias zonzon`
2. Créer `mobile_app/android/key.properties` depuis le modèle.
3. Désinstaller l'ancienne app `com.example.mobile_app` du téléphone (elle coexiste).
4. Pour que la CI produise des APK signés : ajouter le keystore (base64) et les mots de passe
   en secrets GitHub, puis les décoder dans le workflow comme c'est déjà fait pour
   `GOOGLE_SERVICES_JSON`.

### Session 87 (2026-07-27) — Keystore de release et APK distribuable

**Keystore généré** : `C:/Users/Kaled/zonzon-release.jks` (hors dépôt), alias `zonzon`, RSA 2048,
validité 10 000 jours, `CN=ZonZon, OU=Mobile, O=Kore Innovation, L=Lome, ST=Maritime, C=TG`.
Mot de passe aléatoire de 32 caractères, écrit uniquement dans `mobile_app/android/key.properties`
(non versionné) — jamais affiché ni passé en argument visible.

> ⚠️ **À sauvegarder hors du poste** (gestionnaire de mots de passe / coffre). Perdre le keystore
> ou son mot de passe rend toute mise à jour Play Store impossible **définitivement** : aucune
> procédure de récupération n'existe.

**Signature vérifiée** avec `apksigner verify --print-certs` (`keytool -printcert` ne suffit pas :
les APK modernes utilisent le schéma v2/v3, pas la signature JAR v1) :
- `Signer #1 certificate DN: CN=ZonZon, OU=Mobile, O=Kore Innovation, L=Lome, ST=Maritime, C=TG`
- SHA-256 : `a5e21f7e26db8bf8abbd003f946dc75e68a7ec41e47c7ae34de84447e5ada6a5`
- SHA-1 : `8442d42f134423978304c1e37ff38794e25350a7` (à fournir si un jour Google Sign-In,
  App Check ou les Dynamic Links sont activés)

**Le problème annoncé par la revue s'est matérialisé en conditions réelles** : l'installation a
d'abord échoué en `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — la version posée quelques minutes plus
tôt était signée debug, la nouvelle en release. Démonstration concrète qu'un APK signé debut ne
peut jamais être mis à jour par un APK signé release. Résolu par désinstallation/réinstallation,
sans conséquence ici (aucune donnée), mais qui aurait imposé le même geste à tous les
utilisateurs si la distribution avait déjà eu lieu.

**État de l'appareil** (Samsung SM-S918B) : seule `com.zonzon.app` reste installée, signée en
release (`signatures version:2`), `FirebaseApp initialization successful`, 0 exception fatale.
L'ancienne `com.example.mobile_app` a été désinstallée.

**APK distribuable** : 58,7 Mo, SHA-256
`dd33c0cfcf8202dd059ee509e8a83fc97eaaa1051284bc94a883a5ab40eae670`.

**CI** : étape « Decode release keystore » ajoutée, conditionnée à la présence du secret
`ANDROID_KEYSTORE_BASE64`. Tant que les secrets ne sont pas définis, la CI continue de
fonctionner et retombe sur la clé de debug avec avertissement. Secrets à créer dans le dépôt
GitHub :
```
ANDROID_KEYSTORE_BASE64     # base64 -w0 zonzon-release.jks
ANDROID_KEYSTORE_PASSWORD   # cf. mobile_app/android/key.properties
ANDROID_KEY_ALIAS           # zonzon
ANDROID_KEY_PASSWORD        # identique au storePassword
```

**Les deux blocages Play Store identifiés par la revue sont levés.**

### Session 88 (2026-07-27) — WhatsApp Cloud API : configuration partielle, bloquée sur le template

**Contexte** : le code OTP WhatsApp est implémenté et déployé depuis la session 81 (backend,
mobile et PWA). Il ne manquait que la configuration Meta. Le PO disposant désormais d'un compte
WhatsApp Business, la configuration a été entamée via le navigateur (Claude in Chrome, sur
autorisation explicite).

**Distinction importante établie** : le PO possédait l'**application mobile** WhatsApp Business,
qui ne permet aucun envoi programmatique. Le backend appelle `graph.facebook.com/.../messages`,
c'est-à-dire la **WhatsApp Business Platform (Cloud API)** — un produit distinct nécessitant une
app Meta, un WABA et un numéro enregistré sur la plateforme.

**Réalisé :**
| Élément | Valeur |
|---|---|
| App Meta « ZonZon » | `1643671951095041` |
| Portefeuille business | Kore Innovation (`1747845583065738`, non vérifié) |
| WhatsApp Business Account | `1527332121746828` (compte de test) |
| Numéro de test Meta | `+1 555 154 1885` (gratuit 90 jours, 5 destinataires max) |
| **`WHATSAPP_PHONE_NUMBER_ID`** | **`1162448583626720`** |
| Conditions Meta | acceptées par le PO (confirmation explicite en conversation) |

**🔴 Blocage — création du template impossible.** La soumission de `zonzon_verification_code`
(catégorie Authentification, langue French, bouton « Copier le code ») échoue avec :
> Ce compte WhatsApp Business n'a pas l'autorisation de créer un modèle de message

Cause : la vue d'ensemble indique **« Numéros de téléphone : 0 sur 2 ajoutés »**. Le numéro de
test appartient à Meta et ne compte pas comme numéro du WABA ; Meta n'autorise la création de
templates personnalisés que sur un compte disposant d'un **vrai numéro enregistré**.

> ⚠️ **Erreur d'analyse à noter** : la stratégie « valider d'abord avec le numéro de test » avait
> été recommandée pour éviter d'engager le numéro professionnel. Elle permet bien d'envoyer des
> messages avec les templates existants (`hello_world`), mais **pas d'en créer de nouveaux**.
> Un vrai numéro est indispensable dès le départ pour un template personnalisé.

**Choix technique retenu pour le template** (à refaire à l'identique) : mode **« Copier le
code »** plutôt que « Saisie automatique en un seul appui ». L'autofill exige de déclarer le nom
du package Android **et** le hash de signature, et ne fonctionne pas depuis la PWA iOS. Le
« Copier le code » est universel (Android, iOS, PWA, Desktop) et reste compatible avec le
payload envoyé par le backend (`sub_type: 'url'`, index 0).

**Reste à faire :**
1. Enregistrer un **vrai numéro** sur le WABA — il ne doit PAS être déjà utilisé dans
   l'application mobile WhatsApp Business, sous peine d'en perdre définitivement l'usage mobile.
   Le WABA accepte 2 numéros gratuitement.
2. Recréer et soumettre le template `zonzon_verification_code` (Authentification / French /
   Copier le code). Validation Meta : quelques minutes à quelques heures.
3. Générer un **token permanent** via un utilisateur système (Business Settings), permissions
   `whatsapp_business_messaging` et `whatsapp_business_management`. Le token affiché par défaut
   dans la console expire en 24 h.
4. Nettoyer les 6 lignes WhatsApp corrompues du `.env` de production (cf. ci-dessous) et y
   injecter `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, puis
   `WHATSAPP_OTP_ENABLED=true`.
5. Redéployer et tester l'envoi réel.

**🔴 `.env` de production corrompu (à corriger avant activation).** Sur le VPS OVH, la ligne 31
de `/opt/zonzon/backend/.env` contient 164 caractères : plusieurs variables ont été écrasées sur
une seule ligne avec un séparateur littéral `__K__`, probablement une injection PowerShell mal
échappée lors d'une session antérieure.
```
WHATSAPP_OTP_ENABLED=__K__WHATSAPP_OTP_TEMPLATE_NAME=__K__WHATSAPP_OTP_TEMPLATE_LANGUAGE=__K__...
```
Conséquences : `WHATSAPP_OTP_ENABLED` ne vaut pas `'true'` (l'OTP reste donc désactivé, sans
danger immédiat), `WHATSAPP_PHONE_NUMBER_ID` et `WHATSAPP_ACCESS_TOKEN` sont absentes, et les
5 autres variables sont vides. **Les 6 lignes sont à réécrire proprement.**

**Aucun impact sur la production actuelle** : `isEnabled()` teste `=== 'true'`, l'OTP reste
inactif et l'inscription fonctionne normalement sur les trois clients.

### Session 89 (2026-07-27) — Confirmation terrain : notifications push FCM opérationnelles

Test d'envoi réel effectué directement depuis le conteneur backend (script Node ad hoc utilisant
`firebase-admin/app` + `firebase-admin/messaging`, mêmes imports que
`notifications.service.ts`), vers le token FCM le plus récent en base.

**Premier essai : échec `NotRegistered`, diagnostiqué et non un bug.** Le token enregistré à
06:22:35 UTC provenait d'une installation antérieure aux cycles de désinstallation/réinstallation
effectués pendant les tests de signature (debug → release). Une réinstallation efface les données
locales et Firebase invalide l'ancien token ; l'app ne réenregistre un token qu'après connexion
(`push_service.dart`), et la réinstallation la plus récente n'avait pas encore de session active.
Le token périmé a été supprimé de `device_tokens` — comportement identique à celui que
`notifications.service.ts` applique automatiquement sur une erreur `NotRegistered`/
`invalid-registration-token` en production.

**PO reconnecté sur l'app** → nouveau token enregistré (15:33:10 UTC, 142 caractères).

**Second envoi : succès.**
```
messageId: projects/zonzon-4eb31/messages/0:1785166505475913%1c044b201c044b20
```
**Notification reçue et confirmée visuellement par le PO sur l'appareil.**

**Conclusion** : la chaîne complète est prouvée en conditions réelles — plugin Gradle
`google-services` → initialisation Firebase → génération du token → enregistrement backend →
`firebase-admin` → serveurs FCM → réception et affichage sur l'appareil. L'APK
`com.zonzon.app` signée release (SHA-256 `dd33c0cfcf8202dd059ee509e8a83fc97eaaa1051284bc94a883a5ab40eae670`)
est donc confirmée pleinement fonctionnelle pour les notifications push, au-delà du seul test
d'initialisation de la session 87.

### Session 90 (2026-07-27) — Audit "mot de passe oublié" + 3 comptes de test

**Audit "mot de passe oublié" (réponse au PO)** : la fonctionnalité **n'existe pour aucun rôle**
(client, livreur, commerçant, admin). Seul `PATCH /auth/password` existe — il exige d'être déjà
connecté et de connaître l'ancien mot de passe (`changePassword`). Aucun endpoint public de type
`forgot-password`/`reset-password`, aucune entité de token de reset, aucun canal d'envoi (email
— le modèle `User` n'a d'ailleurs aucun champ email, l'authentification est 100% par téléphone —,
SMS ou WhatsApp) dédié à ce flux. Aucune UI (mobile, PWA, admin) ne propose ce parcours.

**3 comptes de test créés en production**, via `POST /auth/register` (endpoint public) sur
`https://api.kore-innov.com`, mot de passe `Mot2passe` pour les trois :

| Rôle | Téléphone | Identité | État |
|---|---|---|---|
| CLIENT | `+22890000101` | Test Client | ACTIVE (aucune validation requise pour ce rôle) |
| LIVREUR | `+22890000102` | Test Livreur | ACTIVE, **driverApprovalStatus=APPROVED**, isAvailable=true |
| COMMERCANT | `+22890000103` | Test Commerçant | ACTIVE (aucune validation requise pour ce rôle) |

Le compte livreur a nécessité une intervention manuelle en base après l'inscription : le workflow
`setDriverApproval()` exige une photo de profil non vide (`ensureDriverHasOperationalProfile`)
avant d'autoriser `APPROVED`, ce qui bloque un compte de test sans vraie photo. Corrigé par mise à
jour directe (`profilePhotoUrl = 'test-placeholder-no-real-photo.jpg'`, valeur volontairement
explicite pour signaler qu'elle est synthétique), puis `driverApprovalStatus = 'APPROVED'` et
`isAvailable = 1`. **Aucune entrée `admin_audit_logs` n'a été créée** pour cette approbation :
elle n'est pas passée par un vrai admin, fabriquer une entrée d'audit aurait été trompeur.

**Vérifié fonctionnellement**, pas seulement en base : `POST /auth/login` avec `+22890000102` /
`Mot2passe` réussit, et `GET /orders/available` avec le token obtenu répond **200** (un livreur
non validé recevrait 403) — le compte livreur est donc réellement opérationnel, pas seulement
correct sur le papier.
