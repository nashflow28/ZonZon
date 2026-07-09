# ZonZon — Instructions pour Codex

## ⚠️ RÈGLE OBLIGATOIRE — À LIRE EN PREMIER

**Avant toute chose, lis ces deux fichiers à la racine du projet :**
1. **`PROGRESS.md`** → état actuel, URLs, commandes, historique
2. **`TODO.md`** → tableau des tâches (Trello) avec cases à cocher

**Après chaque avancée importante, mets à jour les deux fichiers** avant de terminer la session.

Cette règle est non négociable. Elle garantit que chaque instance de Codex qui travaille sur ce projet dispose du contexte complet sans avoir à relire l'historique des conversations.

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
├── AGENTS.md         # Ce fichier — instructions Codex
├── PROGRESS.md       # Journal de progression — À LIRE ET MAINTENIR
└── TODO.md           # Tableau des tâches (Trello) — À LIRE ET MAINTENIR
```

### URLs de production
- **Backend API** : `https://zonzon-backend.fly.dev`
- **Admin** : `https://zonzon-admin.pages.dev`

### Comptes du projet
Tout est centralisé sur `koreinnovation28@gmail.com` :
- Firebase Console : `console.firebase.google.com`
- Fly.io : `fly.io`
- Cloudflare : `dash.cloudflare.com`
- TiDB Cloud : `tidbcloud.com`

---

## Commandes rapides

### Déployer le backend
```powershell
cd C:\laragon\www\ZonZon\backend
flyctl deploy --app zonzon-backend
```

### Builder l'APK
```powershell
cd C:\laragon\www\ZonZon\mobile_app
flutter build apk --release
# L'URL de prod est déjà la valeur par défaut dans env.dart
```

### Déployer l'admin
```powershell
cd C:\laragon\www\ZonZon\admin-dashboard
npm run build -- --configuration production
npx wrangler pages deploy dist/admin-dashboard/browser --project-name zonzon-admin
```

### Voir les logs backend
```powershell
flyctl logs --app zonzon-backend --no-tail
```

---

## Points critiques à ne pas oublier

- **WebSocket** : `fly.toml` a `min_machines_running=1` et `auto_stop_machines='off'` — ne pas changer ça
- **SSL DB** : TiDB exige `DB_SSL=true` en prod
- **Photos** : Le dossier `uploads/` sur Fly.io est éphémère — ne pas stocker de données critiques là
- **Firebase** : `firebase-adminsdk.json` ne doit JAMAIS être committé (il est dans `.dockerignore`)
- **env.dart** : `defaultValue` pointe sur `https://zonzon-backend.fly.dev` — pour tests locaux, utiliser `--dart-define=API_URL=http://<IP>:3050`

---

> Pour tout le détail (historique complet, endpoints, architecture, variables d'env), consulte **`PROGRESS.md`**.
> Pour la liste des tâches à faire / en cours / à reprogrammer, consulte **`TODO.md`**.
