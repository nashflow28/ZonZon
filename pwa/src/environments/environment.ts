export const environment = {
  production: false,
  // URL de prod par défaut : la PWA doit fonctionner out-of-the-box contre le
  // backend déployé quand on la teste sur iPhone (pas de backend local requis).
  apiUrl: 'https://zonzon-backend.fly.dev',
  apiPrefix: '/v1',
};
