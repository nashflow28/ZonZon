const DIAL_CODES = ['+228', '+229', '+233', '+225', '+226', '+227', '+234', '+221', '+33'];

export function formatPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '—';
  const code = DIAL_CODES.sort((a, b) => b.length - a.length).find((item) => raw.startsWith(item)) ?? '+228';
  const local = raw.startsWith(code) ? raw.slice(code.length) : raw.replace(/^\+/, '');
  const digits = local.replace(/\D/g, '');
  const groups = digits.match(/.{1,2}/g) ?? [];
  return groups.length ? `${code} ${groups.join(' ')}` : code;
}
