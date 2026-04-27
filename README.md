# ZonZon — Application de livraison Togo

[![CI](https://github.com/nashflow28/ZonZon/actions/workflows/ci.yml/badge.svg)](https://github.com/nashflow28/ZonZon/actions/workflows/ci.yml)

Mono-repo:
- `backend/` — NestJS 11 + TypeORM + MySQL + Socket.IO + FCM
- `admin-dashboard/` — Angular 21 + Tailwind
- `mobile_app/` — Flutter (geolocator, flutter_map, firebase_messaging)

Voir le `Cahier des Charges - App de Livraison Togo (Kaled).md` pour le périmètre fonctionnel.

## Démarrage rapide

### Backend
```bash
cd backend
cp .env.example .env  # éditer DB / JWT_SECRET / OSRM_URL
npm install
npm run start:dev     # http://localhost:3050
```

### Admin
```bash
cd admin-dashboard
npm install
npm start             # http://localhost:4200
```

### Mobile
```bash
cd mobile_app
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3050
```
