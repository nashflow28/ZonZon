@echo off
setlocal

echo ===================================================
echo   ZONZON - DEPLOIEMENT PRODUCTION LOCAL
echo ===================================================
echo.
echo Prerequis: flyctl et Wrangler doivent etre authentifies sur ce poste.
echo.

echo [1/3] Backend NestJS: test, build et deploiement Fly.io...
pushd backend
call npm ci || goto :failure
call npm test -- --runInBand || goto :failure
call npm run build || goto :failure
flyctl deploy --app zonzon-backend || goto :failure
popd

echo [2/3] Dashboard Angular: build et deploiement Cloudflare Pages...
pushd admin-dashboard
call npm ci || goto :failure
call npm run build -- --configuration production || goto :failure
call npx wrangler pages deploy dist/admin-dashboard/browser --project-name zonzon-admin || goto :failure
popd

echo [3/3] Application mobile: test et generation APK release...
pushd mobile_app
call flutter pub get || goto :failure
call flutter test || goto :failure
call flutter build apk --release || goto :failure
popd

echo.
echo ===================================================
echo DEPLOIEMENT TERMINE AVEC SUCCES
echo Backend : https://zonzon-backend.fly.dev
echo Admin   : https://zonzon-admin.pages.dev
echo APK     : mobile_app\build\app\outputs\flutter-apk\app-release.apk
echo ===================================================
exit /b 0

:failure
echo.
echo Le deploiement a echoue. Aucune etape suivante n'a ete executee.
exit /b 1
