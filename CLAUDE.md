# ZonZon — Instructions pour Claude Code

## ⚠️ RÈGLE OBLIGATOIRE — À LIRE EN PREMIER

**Avant toute chose, lis ces deux fichiers à la racine du projet :**
1. **`PROGRESS.md`** → état actuel, URLs, commandes, historique
2. **`TODO.md`** → tableau des tâches (Trello) avec cases à cocher

**Après chaque avancée importante, mets à jour les deux fichiers** avant de terminer la session.

Cette règle est non négociable. Elle garantit que chaque instance de Claude Code qui travaille sur ce projet dispose du contexte complet sans avoir à relire l'historique des conversations.

### Ce que tu dois faire systématiquement :
1. **Au démarrage** → Lire `PROGRESS.md` (état) puis `TODO.md` (quoi faire)
2. **Pendant le travail** :
   - Marquer les tâches `TODO.md` en `[~]` (en cours) puis `[x]` (fait) au fur et à mesure
   - Référencer `PROGRESS.md` pour les URLs, commandes, comptes
3. **Avant de terminer** :
   - Cocher les tâches finies dans `TODO.md` (et déplacer vers la section "Déjà fait" si pertinent)
   - Mettre à jour `PROGRESS.md` avec :
     - Nouvelles fonctionnalités ajoutées
     - Bugs corrigés
     - Fichiers modifiés importants
     - Nouvelles commandes utiles
     - Nouvelles limitations découvertes
     - Nouvelle entrée dans "Historique des sessions"

---

## Flutter Skills disponibles

Des skills officiels Flutter sont installés dans `.agents/skills/`. **Utilise-les systématiquement** pour les tâches correspondantes plutôt que de réinventer la roue.

| Skill | Quand l'utiliser |
|-------|-----------------|
| `flutter-apply-architecture-best-practices` | Refactoriser un écran ou créer un nouveau module → appliquer la structure UI/ViewModel/Repository |
| `flutter-setup-declarative-routing` | Toute modification de la navigation → préférer go_router |
| `flutter-implement-json-serialization` | Créer ou modifier un modèle de données → utiliser json_serializable |
| `flutter-fix-layout-issues` | Erreur "RenderFlex overflowed", "unbounded height", etc. |
| `flutter-build-responsive-layout` | Créer un nouveau écran → le rendre responsive dès le départ |
| `flutter-add-widget-test` | Après avoir créé/modifié un widget important → ajouter un test |
| `flutter-add-integration-test` | Tester un flux utilisateur complet (inscription, commande, etc.) |
| `flutter-setup-localization` | Si on ajoute le support multilingue |
| `flutter-add-widget-preview` | Pour prévisualiser les widgets en développement |
| `flutter-use-http-package` | Référence pour les appels API avec le package http |

### Comment utiliser un skill
Les skills sont dans `.agents/skills/<nom-du-skill>/SKILL.md`. Lis le fichier SKILL.md correspondant avant d'effectuer la tâche associée pour suivre les meilleures pratiques officielles Flutter.

---

## Vue d'ensemble du projet

**ZonZon** est une application de livraison pour le Togo.

### Structure du monorepo
```
ZonZon/
├── backend/          # NestJS 11 + TypeORM + MySQL + Socket.IO
├── admin-dashboard/  # Angular 21 + Tailwind CSS
├── mobile_app/       # Flutter (Android)
├── .agents/skills/   # Flutter Skills officiels installés
├── CLAUDE.md         # Ce fichier — instructions Claude Code
├── PROGRESS.md       # Journal de progression — À LIRE ET MAINTENIR
└── TODO.md           # Tableau des tâches (Trello) — À LIRE ET MAINTENIR
```

### URLs de production
- **Backend API** : `https://api.kore-innov.com` (VPS OVH, Docker + Traefik) ← **production**
- **Backend secours** : `https://zonzon-backend.fly.dev` (Fly.io, même base TiDB)
- **Admin** : `https://zonzon-admin.pages.dev` (Cloudflare Pages, projet `zonzon-admin`)
- **PWA iOS** : `https://zonzon-pwa.pages.dev` (Cloudflare Pages, projet `zonzon-pwa`)

### Comptes du projet
Tout est centralisé sur `koreinnovation28@gmail.com` :
- Firebase Console : `console.firebase.google.com`
- Fly.io : `fly.io`
- Cloudflare : `dash.cloudflare.com`
- TiDB Cloud : `tidbcloud.com`

---

## Commandes rapides

### Déployer le backend (production = OVH)

> ⚠️ **`flyctl deploy` ne déploie PAS la production.** Fly.io n'est que le backend de
> secours depuis la session 76. La production est le VPS OVH derrière `api.kore-innov.com`.
> Attention : les deux partagent la même base TiDB, donc un déploiement Fly appliquerait
> quand même les migrations — sans mettre à jour le code servi aux utilisateurs.

```bash
# 1. Transférer le code (le .env du VPS ne doit jamais être écrasé)
tar czf - -C backend --exclude=node_modules --exclude=dist --exclude=.git --exclude=.env \
  --exclude=uploads --exclude=private_uploads --exclude=firebase-adminsdk.json . \
  | ssh ovh-ubuntu 'sudo tar xzf - -C /opt/zonzon/backend'

# 2. Build + bascule (les migrations s'appliquent seules au démarrage)
ssh ovh-ubuntu 'cd /opt/zonzon/backend && sudo docker compose up -d --build'
```

Avant une bascule risquée, créer un point de retour :
```bash
ssh ovh-ubuntu 'sudo docker tag zonzon-backend:working zonzon-backend:rollback-$(date +%Y%m%d)'
```

### Builder l'APK
```powershell
cd D:\laragon\www\ZonZon\mobile_app
flutter build apk --release
# L'URL de prod est déjà la valeur par défaut dans env.dart — ne pas passer
# de --dart-define=API_URL, cela a déjà produit un APK pointant sur le secours.
```

### Déployer l'admin et la PWA
```powershell
cd D:\laragon\www\ZonZon\admin-dashboard
npx ng build --configuration production
npx wrangler pages deploy dist/admin-dashboard/browser --project-name zonzon-admin --branch main

cd D:\laragon\www\ZonZon\pwa
npx ng build --configuration production
npx wrangler pages deploy dist/pwa/browser --project-name zonzon-pwa --branch main
```

### Voir les logs backend
```bash
ssh ovh-ubuntu 'sudo docker logs zonzon-backend-ovh --tail 100'   # production OVH
flyctl logs --app zonzon-backend --no-tail                        # secours Fly
```

---

## Points critiques à ne pas oublier

- **Déploiement backend** : la production est **OVH**, pas Fly. Voir « Déployer le backend » ci-dessus.
- **Volumes OVH** : `zonzon_uploads` et `zonzon_identity` sont déclarés `external: true` dans
  `backend/docker-compose.yml` — ne jamais retirer ce flag, Compose créerait des volumes vides
  et les fichiers téléversés deviendraient invisibles.
- **Traefik** : le service `zonzon` est déclaré par label dans le compose. Le supprimer fait
  retomber `api.kore-innov.com` en 503 (`the service "zonzon@docker" does not exist`).
- **WebSocket** : `fly.toml` a `min_machines_running=1` et `auto_stop_machines='off'` — ne pas changer ça (secours)
- **SSL DB** : TiDB exige `DB_SSL=true` en prod
- **Photos** : sur OVH elles sont dans des volumes Docker persistants ; sur Fly le dossier
  `uploads/` est éphémère — ne pas y stocker de données critiques
- **Firebase** : `firebase-adminsdk.json` ne doit JAMAIS être committé (il est dans `.dockerignore`)
- **env.dart** : `defaultValue` pointe sur `https://api.kore-innov.com` — pour tests locaux, utiliser `--dart-define=API_URL=http://<IP>:3050`
- **Migrations** : elles s'appliquent seules au démarrage du conteneur en production
  (`migrationsRun: NODE_ENV === 'production'`). Il n'y a aucune commande à lancer — mais une
  migration qui échoue à mi-parcours empêche l'app de redémarrer (pas de `release_command`).

---

> Pour tout le détail (historique complet, endpoints, architecture, variables d'env), consulte **`PROGRESS.md`**.
> Pour la liste des tâches à faire / en cours / à reprogrammer, consulte **`TODO.md`**.
