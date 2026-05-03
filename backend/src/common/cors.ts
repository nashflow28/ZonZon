/**
 * Helpers de configuration CORS partagés entre HTTP (main.ts) et WebSocket
 * (orders.gateway.ts).
 *
 * Deux env vars :
 *  - `FRONTEND_URLS` : liste d'origines exactes séparées par des virgules.
 *      Exemple : `https://zonzon-admin.pages.dev,https://www.zonzon.app`
 *  - `FRONTEND_URL_PATTERNS` : liste de regex (chaînes compilées via
 *      `new RegExp(...)`) séparées par des virgules. Sert principalement à
 *      autoriser les URLs preview de Cloudflare Pages, qui ont la forme
 *      `https://<hash>.zonzon-admin.pages.dev` et changent à chaque deploy.
 *      Exemple : `^https://[a-z0-9-]+\\.zonzon-admin\\.pages\\.dev$`
 *
 * Si AUCUNE des deux n'est définie, on tombe sur le comportement permissif
 * (`origin: true`) — utile en dev local où on consomme l'API depuis n'importe
 * quel port.
 */

export interface CorsOriginConfig {
  /** Origines exactes (`https://example.com`) — comparaison par égalité stricte. */
  exact: string[];
  /** Patterns regex compilés. Si AU MOINS UN match → origin autorisé. */
  patterns: RegExp[];
}

/**
 * Lit `FRONTEND_URLS` et `FRONTEND_URL_PATTERNS` depuis l'environnement et
 * compile les patterns. Les regex invalides sont silencieusement ignorées
 * (un warn pourrait être ajouté côté appelant si besoin).
 */
export function loadCorsConfig(): CorsOriginConfig {
  const exact = (process.env.FRONTEND_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const patterns = (process.env.FRONTEND_URL_PATTERNS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      try {
        return new RegExp(p);
      } catch {
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);

  return { exact, patterns };
}

/**
 * Décide si un `origin` doit être autorisé selon la config CORS.
 *
 * - Pas d'origin (requête server-to-server, mobile native sans en-tête Origin,
 *   curl) → autorisé. C'est le comportement standard d'Express CORS.
 * - Origin présent dans `exact` → autorisé.
 * - Origin matchant un des `patterns` → autorisé.
 * - Sinon refusé.
 */
export function isOriginAllowed(
  origin: string | undefined,
  config: CorsOriginConfig,
): boolean {
  if (!origin) return true;
  if (config.exact.includes(origin)) return true;
  return config.patterns.some((rx) => rx.test(origin));
}

/** True si au moins une exact ou un pattern est configuré. */
export function hasAnyCorsConfig(config: CorsOriginConfig): boolean {
  return config.exact.length > 0 || config.patterns.length > 0;
}
