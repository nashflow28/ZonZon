/**
 * Liste des pays supportés par le sélecteur d'indicatif téléphonique.
 *
 * Inspirée de `mobile_app/lib/widgets/phone_field.dart`. Pays africains
 * prioritaires en tête (marché ZonZon = Togo + voisins) puis quelques
 * autres pour couvrir la diaspora et les usages courants.
 *
 * `minLength` / `maxLength` ne s'appliquent QUE à la partie locale du
 * numéro (sans l'indicatif). Utilisés pour un soft-warning visuel.
 */
export interface Country {
  /** Code ISO 3166-1 alpha-2 (ex: "TG"). */
  code: string;
  /** Nom en français (ex: "Togo"). */
  name: string;
  /** Indicatif international avec le `+` (ex: "+228"). */
  dialCode: string;
  /** Drapeau emoji (ex: "🇹🇬"). */
  flag: string;
  /** Longueur minimale du numéro local. */
  minLength?: number;
  /** Longueur maximale du numéro local. */
  maxLength?: number;
}

export const COUNTRIES: Country[] = [
  // ===== Pays prioritaires (Afrique de l'Ouest + Centrale) =====
  { code: 'TG', name: 'Togo',           dialCode: '+228', flag: '🇹🇬', minLength: 8, maxLength: 8 },
  { code: 'BJ', name: 'Bénin',          dialCode: '+229', flag: '🇧🇯', minLength: 8, maxLength: 10 },
  { code: 'CI', name: "Côte d'Ivoire",  dialCode: '+225', flag: '🇨🇮', minLength: 8, maxLength: 10 },
  { code: 'GH', name: 'Ghana',          dialCode: '+233', flag: '🇬🇭', minLength: 9, maxLength: 9 },
  { code: 'BF', name: 'Burkina Faso',   dialCode: '+226', flag: '🇧🇫', minLength: 8, maxLength: 8 },
  { code: 'NE', name: 'Niger',          dialCode: '+227', flag: '🇳🇪', minLength: 8, maxLength: 8 },
  { code: 'ML', name: 'Mali',           dialCode: '+223', flag: '🇲🇱', minLength: 8, maxLength: 8 },
  { code: 'SN', name: 'Sénégal',        dialCode: '+221', flag: '🇸🇳', minLength: 9, maxLength: 9 },
  { code: 'NG', name: 'Nigeria',        dialCode: '+234', flag: '🇳🇬', minLength: 7, maxLength: 11 },
  { code: 'CM', name: 'Cameroun',       dialCode: '+237', flag: '🇨🇲', minLength: 8, maxLength: 9 },
  { code: 'GA', name: 'Gabon',          dialCode: '+241', flag: '🇬🇦', minLength: 7, maxLength: 8 },
  { code: 'GN', name: 'Guinée',         dialCode: '+224', flag: '🇬🇳', minLength: 8, maxLength: 9 },

  // ===== Diaspora / Europe / autres =====
  { code: 'FR', name: 'France',         dialCode: '+33',  flag: '🇫🇷', minLength: 9, maxLength: 9 },
  { code: 'BE', name: 'Belgique',       dialCode: '+32',  flag: '🇧🇪', minLength: 8, maxLength: 9 },
  { code: 'CH', name: 'Suisse',         dialCode: '+41',  flag: '🇨🇭', minLength: 9, maxLength: 9 },
  { code: 'DE', name: 'Allemagne',      dialCode: '+49',  flag: '🇩🇪', minLength: 6, maxLength: 12 },
  { code: 'GB', name: 'Royaume-Uni',    dialCode: '+44',  flag: '🇬🇧', minLength: 7, maxLength: 11 },
  { code: 'US', name: 'États-Unis',     dialCode: '+1',   flag: '🇺🇸', minLength: 10, maxLength: 10 },
  { code: 'CA', name: 'Canada',         dialCode: '+1',   flag: '🇨🇦', minLength: 10, maxLength: 10 },
  { code: 'MA', name: 'Maroc',          dialCode: '+212', flag: '🇲🇦', minLength: 9, maxLength: 9 },
  { code: 'DZ', name: 'Algérie',        dialCode: '+213', flag: '🇩🇿', minLength: 8, maxLength: 9 },
  { code: 'TN', name: 'Tunisie',        dialCode: '+216', flag: '🇹🇳', minLength: 8, maxLength: 8 },
];

/** Pays par défaut (Togo). */
export const DEFAULT_COUNTRY: Country = COUNTRIES[0];

/**
 * Retrouve le pays correspondant à un indicatif (`+228`).
 * Comme +1 a deux pays (US/CA), on retourne le premier match — c'est
 * suffisant pour l'affichage (le drapeau US par défaut).
 */
export function findCountryByDialCode(dialCode: string): Country | undefined {
  return COUNTRIES.find((c) => c.dialCode === dialCode);
}

/**
 * Sépare un numéro international stocké (`+22890123456`) en tuple
 * `[pays, partieLocale]`. Si l'indicatif n'est pas reconnu, on retombe
 * sur le pays par défaut et on garde le numéro brut sans le `+`.
 *
 * On essaie les indicatifs les plus longs d'abord (sinon `+1` matcherait
 * avant `+225` etc.).
 */
export function splitInternationalNumber(full: string): { country: Country; local: string } {
  const cleaned = (full ?? '').trim();
  if (!cleaned) return { country: DEFAULT_COUNTRY, local: '' };

  const sortedByDialLength = [...COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length
  );
  for (const c of sortedByDialLength) {
    if (cleaned.startsWith(c.dialCode)) {
      return { country: c, local: cleaned.slice(c.dialCode.length).replace(/\D/g, '') };
    }
  }
  return {
    country: DEFAULT_COUNTRY,
    local: cleaned.replace(/^\+/, '').replace(/\D/g, ''),
  };
}
