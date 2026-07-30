# Kit logo ZonZon

Version 1.0 — 30 juillet 2026

Ce dossier contient les déclinaisons du logo ZonZon sélectionné : logo vertical, logo horizontal,
symbole seul et mot-symbole, dans les formats adaptés au web, aux applications, à l’impression,
aux documents et aux réseaux sociaux.

## Choisir rapidement le bon fichier

| Usage | Fichier ou dossier recommandé |
|---|---|
| Site web sur fond clair | `03-web/png/zonzon-horizontal-color-1024w.png` |
| Site web très léger | `03-web/webp/zonzon-horizontal-color-1024w.webp` |
| Fond sombre | `02-variants/zonzon-horizontal-mono-white.png` |
| Impression / enseigne | `04-print/*-vector.pdf`, `.eps` ou `01-master/vector/*.svg` |
| Android | `05-apps/android/` |
| iPhone / App Store | `05-apps/ios/` |
| PWA, favicon, Apple Touch | `05-apps/pwa/` |
| Photo de profil / bannière | `06-social-media/` |
| Signature email | `07-office-email/email-signature-600.png` |
| PowerPoint / documents | `07-office-email/` |

## Structure du dossier

- `00-source` : image originale sélectionnée, conservée intacte.
- `01-master/raster` : masters PNG transparents fidèles au rendu choisi.
- `01-master/vector` : versions SVG propres, plates et éditables.
- `02-variants` : couleur, monochrome sombre, blanc et fonds prêts à l’emploi.
- `03-web` : PNG multi-tailles et WebP sans perte.
- `04-print` : PDF/EPS vectoriels et TIFF CMJN 300 dpi.
- `05-apps` : toutes les tailles usuelles Android, iOS et PWA.
- `06-social-media` : profils et bannières PNG/JPG.
- `07-office-email` : documents, présentations et signatures.
- `08-preview` : planche de contrôle visuel.
- `GUIDE-RAPIDE-ZONZON.pdf` : rappel des couleurs et règles d’utilisation.
- `manifest.json` : dimensions techniques, tailles et empreintes SHA-256.

## Couleurs

- Bleu nuit : `#0C1A22`
- Bleu mouvement : `#2E90FA`
- Jaune accent : `#F5B700`
- Fond clair : `#F8FAFC`

## Différence entre les masters raster et vectoriels

La création choisie est issue d’une image raster et contient de légers dégradés.

- Les **PNG/WebP** conservent fidèlement ces dégradés et constituent les versions de référence pour
  les écrans et les usages numériques.
- Les **SVG/PDF/EPS** sont des versions vectorielles volontairement simplifiées en trois couleurs
  plates. Elles sont redimensionnables sans perte et plus fiables pour l’impression, la découpe,
  la broderie et la sérigraphie.
- Les **TIFF CMJN** sont des conversions génériques. Pour un tirage important, demander à
  l’imprimeur son profil ICC et valider un BAT avant production.

## Règles essentielles

1. Ne jamais étirer ou incliner le logo.
2. Laisser une zone libre autour du logo au moins égale à la hauteur du « o ».
3. Utiliser la variante blanche sur un fond sombre.
4. Ne pas déplacer ni recolorer séparément la flèche jaune.
5. Pour les icônes d’application, utiliser le symbole seul, jamais le logo vertical complet.

## Régénération

Le script `tools/build_logo_kit.py` régénère le kit depuis le master transparent. Ses dépendances
Python sont Pillow, NumPy, scikit-image, ReportLab et svglib.

```powershell
python .\tools\build_logo_kit.py
```
