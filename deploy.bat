@echo off
echo ===================================================
echo   ZONZON - SCRIPT DE DEPLOIEMENT PRODUCTION
echo ===================================================

echo [1/3] Compilation du Backend NestJS...
cd backend
call npm install
call npm run build
cd ..

echo [2/3] Compilation du Dashboard Angular...
cd admin-dashboard
call npm install
call npm run build
cd ..

echo [3/3] Generation de l'Application Mobile (Android APK)...
echo Note: Assurez-vous d'avoir le SDK Android configure.
cd mobile_app
call flutter clean
call flutter pub get
call flutter build apk --release
cd ..

echo ===================================================
echo DEPLOIEMENT TERMINE AVEC SUCCES !
echo - Backend : backend/dist/
echo - Angular : admin-dashboard/dist/admin-dashboard/browser/
echo - Mobile  : mobile_app/build/app/outputs/flutter-apk/app-release.apk
echo ===================================================
pause
