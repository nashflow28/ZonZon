const String apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://api.kore-innov.com',
);

/// Préfixe d'API HTTP. Concaténé à `apiUrl` par les clients HTTP REST.
///
/// Le WebSocket Socket.IO se connecte à `apiUrl` directement (sans préfixe) :
/// Socket.IO a son propre système de namespaces, indépendant du routing HTTP.
///
/// Les URLs d'images servies par le backend (`/uploads/...`) ne sont pas
/// préfixées non plus : elles sont gérées par `ServeStaticModule`, hors du
/// système de controllers Nest.
const String apiPrefix = '/v1';

/// DSN Sentry pour le suivi des crashs.
/// Passer via : --dart-define=SENTRY_DSN=https://xxx@sentry.io/yyy
/// Vide = Sentry désactivé (développement sans clé).
const String sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');
