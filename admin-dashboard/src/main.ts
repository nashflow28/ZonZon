import * as Sentry from '@sentry/angular';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    integrations: [
      Sentry.browserTracingIntegration(),
      // Le dashboard affiche des données personnelles (noms, téléphones,
      // adresses, conversations) et les pièces d'identité des livreurs.
      // Le replay doit donc masquer le texte et bloquer les médias : sans cela,
      // 10 % des sessions admin transmettaient ces contenus à un tiers, ce qui
      // annulait la protection appliquée côté backend (select:false, bucket
      // privé, accès restreint).
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: environment.production ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
