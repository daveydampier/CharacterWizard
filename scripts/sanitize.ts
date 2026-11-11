const TEXT_KEY = /(description|snippet)$/i;
/** Other keys whose string values are prose: rules text, flavour text or player-written text. */
const PROSE_KEYS = new Set([
  'summary', 'highlights', 'iconicGear', 'details', 'tagline', 'subclassFlavorText', 'exception',
]);
const AVATAR_KEY = /avatarurl$/i;
const NULLED_TOP_LEVEL = ['campaign', 'decorations', 'notes', 'traits', 'socialName'];
/** Lists whose entries carry a player-written `notes` field. */
const NOTED_LISTS = ['customItems', 'characterValues'];

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const prose = TEXT_KEY.test(key) || PROSE_KEYS.has(key);
    if (AVATAR_KEY.test(key)) out[key] = null;
    else if (prose && typeof v === 'string' && v !== '') out[key] = '[removed]';
    else out[key] = clean(v);
  }
  return out;
}

/**
 * Returns a copy of a D&D Beyond character response that is safe to commit:
 * no username, user ID, campaign, portraits, backstory, notes or rules text.
 * Accepts the API envelope ({ data }) or the bare character object.
 */
export function sanitize(raw: unknown): unknown {
  const copy = clean(raw) as Record<string, any>;
  const d = copy && typeof copy === 'object' && 'data' in copy ? copy.data : copy;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    d.username = 'redacted';
    d.userId = 0;
    for (const key of NULLED_TOP_LEVEL) if (key in d) d[key] = null;
    for (const list of NOTED_LISTS) {
      if (!Array.isArray(d[list])) continue;
      for (const entry of d[list]) {
        if (entry && typeof entry === 'object' && entry.notes != null) entry.notes = null;
      }
    }
  }
  return copy;
}
