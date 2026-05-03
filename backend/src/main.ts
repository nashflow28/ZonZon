import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import {
  hasAnyCorsConfig,
  isOriginAllowed,
  loadCorsConfig,
} from './common/cors';

function ensureUploadDirs() {
  const root = process.env.UPLOAD_DIR || 'uploads';
  for (const sub of ['shops', 'products', 'avatars']) {
    fs.mkdirSync(path.join(process.cwd(), root, sub), { recursive: true });
  }
}

async function bootstrap() {
  // Initialize Sentry FIRST, before any NestJS code
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV ?? 'development',
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }

  ensureUploadDirs();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Versioning d'API : toutes les routes HTTP sont préfixées par /v1.
  // Exclus : la racine '/' (health check pour les monitors externes type
  // UptimeRobot/BetterStack — voir AppController.getHealth).
  // Non concernés (donc pas besoin d'exclude) :
  //   - Les WebSockets : Socket.IO a son propre système de namespaces ('/orders')
  //     indépendant des controllers Nest, donc setGlobalPrefix ne les impacte pas.
  //   - Les fichiers statiques /uploads/* : servis par ServeStaticModule, hors
  //     du système de routing controllers Nest.
  app.setGlobalPrefix('v1', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });

  // Sécurité : headers HTTP standards (CSP, X-Frame-Options, HSTS, etc.).
  // CSP par défaut autorise déjà 'self' + data: pour imgSrc, donc le serving
  // statique de /uploads/* (avatars, photos boutiques/produits) reste OK.
  // crossOriginResourcePolicy: 'cross-origin' permet aux clients (mobile,
  // admin sur autre domaine) de charger les images servies par le backend.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS : combinaison d'origines exactes (FRONTEND_URLS) et de patterns regex
  // (FRONTEND_URL_PATTERNS). Les patterns servent surtout aux URLs preview
  // Cloudflare Pages qui changent à chaque deploy.
  // Exemple FRONTEND_URL_PATTERNS="^https://[a-z0-9-]+\\.zonzon-admin\\.pages\\.dev$"
  const corsConfig = loadCorsConfig();
  app.enableCors({
    origin: hasAnyCorsConfig(corsConfig)
      ? (origin, callback) => {
          if (isOriginAllowed(origin, corsConfig)) {
            callback(null, true);
          } else {
            callback(new Error(`Origin ${origin} non autorisé`), false);
          }
        }
      : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3050, '0.0.0.0');
}
bootstrap();
