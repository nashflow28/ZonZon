# ZonZon — Journal de progression

> **RÈGLE ABSOLUE** : Toute instance de Claude Code travaillant sur ce projet **doit lire ce fichier au démarrage** et **le mettre à jour à chaque avancée importante** avant de terminer la session.

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
- `lib/config/env.dart` — URL API (`defaultValue: 'https://zonzon-backend.fly.dev'`)
- `android/app/google-services.json` — Config Firebase Android

### Admin (`/admin-dashboard/`)
- `src/environments/environment.prod.ts` — `apiUrl: 'https://zonzon-backend.fly.dev'`

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
FIREBASE_CREDENTIALS_JSON=*** (contenu du fichier firebase-adminsdk.json)
```

---

## Commandes essentielles

### Builder l'APK de production
```powershell
cd C:\laragon\www\ZonZon\mobile_app
flutter build apk --release --dart-define=API_URL=https://zonzon-backend.fly.dev
# APK généré : build\app\outputs\flutter-apk\app-release.apk
```
> **Note** : Depuis la correction du 2026-05-01, `env.dart` pointe par défaut sur `https://zonzon-backend.fly.dev`. Le `--dart-define` est donc optionnel mais recommandé.

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

### Session 4 (2026-05-01) — Corrections de bugs
- **Bug upload photo produit (400)** : `http.MultipartFile.fromPath` sans MIME explicite envoyait `application/octet-stream` → rejeté par le filtre multer. Fix : détection du MIME dans `shops_service.dart` et `driver_profile_screen.dart` avec `http_parser: MediaType`.
- **Aperçu local photo produit** : `NetworkImage('file://...')` ne fonctionne pas pour les fichiers locaux. Fix : `FileImage(File(path))` dans `merchant_product_form_screen.dart`.
- **Répertoires uploads manquants sur Fly.io** : ajout de `ensureUploadDirs()` dans `backend/src/main.ts` qui crée `uploads/{shops,products,avatars}/` au démarrage (évite les 500).
- **Messages chat pas reçus côté client** : `OrderSocketController` n'écoutait pas `chat:message`. Fix : ajout du stream `newChatMessage$`, badge rouge sur le bouton "Discuter" dans `OrderAcceptedSection`, compteur remis à zéro à l'ouverture du chat.
- **Annulation livreur "transaction refusée"** : le dialog était statique → deux clics simultanés possibles. Fix : `StatefulBuilder` avec état `dialogStatus` + `dialogProcessing`, boutons masqués/désactivés selon l'état courant, fermeture auto du dialog à COMPLETED/CANCELLED.
- Redéploiement backend + rebuild APK (52.3 MB)
- Nouvelles dépendances Flutter : `http_parser: ^4.0.2`, `mime: ^1.0.6`
