import {
  hasAnyCorsConfig,
  isOriginAllowed,
  loadCorsConfig,
} from './cors';

describe('cors helpers', () => {
  const originalUrls = process.env.FRONTEND_URLS;
  const originalPatterns = process.env.FRONTEND_URL_PATTERNS;

  afterEach(() => {
    process.env.FRONTEND_URLS = originalUrls;
    process.env.FRONTEND_URL_PATTERNS = originalPatterns;
    if (originalUrls === undefined) delete process.env.FRONTEND_URLS;
    if (originalPatterns === undefined)
      delete process.env.FRONTEND_URL_PATTERNS;
  });

  describe('loadCorsConfig', () => {
    it('parse une liste séparée par virgules dans FRONTEND_URLS', () => {
      process.env.FRONTEND_URLS = 'https://a.com, https://b.com ,';
      delete process.env.FRONTEND_URL_PATTERNS;
      const cfg = loadCorsConfig();
      expect(cfg.exact).toEqual(['https://a.com', 'https://b.com']);
      expect(cfg.patterns).toEqual([]);
    });

    it('compile les patterns regex de FRONTEND_URL_PATTERNS', () => {
      delete process.env.FRONTEND_URLS;
      process.env.FRONTEND_URL_PATTERNS =
        '^https://[a-z0-9-]+\\.zonzon-admin\\.pages\\.dev$';
      const cfg = loadCorsConfig();
      expect(cfg.patterns).toHaveLength(1);
      expect(
        cfg.patterns[0].test('https://abc-123.zonzon-admin.pages.dev'),
      ).toBe(true);
    });

    it('ignore silencieusement une regex invalide', () => {
      delete process.env.FRONTEND_URLS;
      process.env.FRONTEND_URL_PATTERNS = '^valid$,[invalid(';
      const cfg = loadCorsConfig();
      expect(cfg.patterns).toHaveLength(1);
      expect(cfg.patterns[0].source).toBe('^valid$');
    });

    it('config vide quand les deux env vars sont absentes', () => {
      delete process.env.FRONTEND_URLS;
      delete process.env.FRONTEND_URL_PATTERNS;
      const cfg = loadCorsConfig();
      expect(cfg.exact).toEqual([]);
      expect(cfg.patterns).toEqual([]);
    });
  });

  describe('isOriginAllowed', () => {
    it('autorise une origin présente dans exact', () => {
      const cfg = { exact: ['https://app.zonzon.tg'], patterns: [] };
      expect(isOriginAllowed('https://app.zonzon.tg', cfg)).toBe(true);
    });

    it('autorise une origin matchant un pattern', () => {
      const cfg = {
        exact: [],
        patterns: [/^https:\/\/[a-z0-9-]+\.zonzon-admin\.pages\.dev$/],
      };
      expect(
        isOriginAllowed('https://abc-deploy.zonzon-admin.pages.dev', cfg),
      ).toBe(true);
    });

    it('refuse une origin inconnue', () => {
      const cfg = { exact: ['https://app.zonzon.tg'], patterns: [] };
      expect(isOriginAllowed('https://attacker.com', cfg)).toBe(false);
    });

    it('autorise une requête sans Origin (server-to-server / mobile)', () => {
      const cfg = { exact: ['https://app.zonzon.tg'], patterns: [] };
      expect(isOriginAllowed(undefined, cfg)).toBe(true);
    });
  });

  describe('hasAnyCorsConfig', () => {
    it('false quand exact ET patterns sont vides', () => {
      expect(hasAnyCorsConfig({ exact: [], patterns: [] })).toBe(false);
    });
    it('true dès qu’il y a au moins une exact', () => {
      expect(hasAnyCorsConfig({ exact: ['x'], patterns: [] })).toBe(true);
    });
    it('true dès qu’il y a au moins un pattern', () => {
      expect(hasAnyCorsConfig({ exact: [], patterns: [/.*/] })).toBe(true);
    });
  });
});
