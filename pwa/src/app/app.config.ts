import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // NB : withViewTransitions() (transitions de navigation façon iOS via la
    // View Transitions API) a été essayé puis retiré — il déclenchait une
    // `InvalidStateError: Transition was aborted because of invalid state`
    // sur des navigations rapprochées (constaté en test réel), ce qui aurait
    // pollué la console sans bénéfice visuel garanti. Cf. consigne : "si
    // faisable sans lourdeur ; sinon ne force pas" — on ne force pas.
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
