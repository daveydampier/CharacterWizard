const TEXT_KEY = /(description|snippet)$/i;
const AVATAR_KEY = /avatarurl$/i;
const NULLED_TOP_LEVEL = ['campaign', 'decorations', 'notes', 'traits', 'socialName'];

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (AVATAR_KEY.test(key)) out[key] = null;
    else if (TEXT_KEY.test(key) && typeof v === 'string' && v !== '') out[key] = '[removed]';
    else out[key] = clean(v);
  }
  return out;
}

/**
 * Returns a copy of a D&D Beyond character response that is safe to commit:
 * no username, user ID, campaign, portraits, backstory or rules text.
 */
export function sanitize(raw: unknown): unknown {
  const copy = clean(raw) as Record<string, any>;
  const d = copy?.data;
  if (d && typeof d === 'object') {
    d.username = 'redacted';
    d.userId = 0;
    for (const key of NULLED_TOP_LEVEL) if (key in d) d[key] = null;
  }
  return copy;
}
