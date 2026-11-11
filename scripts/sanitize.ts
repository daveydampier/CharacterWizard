const TEXT_KEY = /(description|snippet)$/i;
/** Other keys whose string values are prose: rules text, flavour text or player-written text. */
const PROSE_KEYS = new Set([
  'summary', 'highlights', 'iconicGear', 'details', 'tagline', 'subclassFlavorText', 'exception',
]);
const AVATAR_KEY = /avatarurl$/i;
const NULLED_TOP_LEVEL = [
  'campaign', 'decorations', 'notes', 'traits', 'socialName', 'readonlyUrl',
  // Descriptive fields that help identify a character's owner.
  'age', 'eyes', 'hair', 'skin', 'height', 'weight', 'gender', 'faith',
];
/** The character ID is replaced everywhere with this value so a fixture cannot be traced to a live sheet. */
const PLACEHOLDER_ID = 1;
/** Smaller IDs are too likely to equal unrelated numbers, so only IDs at least this large are replaced elsewhere. */
const MIN_REPLACEABLE_ID = 100000;
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

interface Identifiers {
  characterId: number | null;
  userId: number | null;
  username: string | null;
}

/** Replaces every occurrence of the identifiers, as whole numbers or inside strings. */
function replaceIdentifiers(value: unknown, ids: Identifiers): unknown {
  if (typeof value === 'number') {
    if (value === ids.characterId) return PLACEHOLDER_ID;
    if (value === ids.userId) return 0;
    return value;
  }
  if (typeof value === 'string') {
    let out = value;
    if (ids.characterId !== null) out = out.split(String(ids.characterId)).join(String(PLACEHOLDER_ID));
    if (ids.userId !== null) out = out.split(String(ids.userId)).join('0');
    if (ids.username) out = out.split(ids.username).join('redacted');
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => replaceIdentifiers(v, ids));
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = replaceIdentifiers(v, ids);
  return out;
}

const replaceableId = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= MIN_REPLACEABLE_ID ? v : null;

/**
 * Returns a copy of a D&D Beyond character response that is safe to commit:
 * no username, user ID, character ID, sheet link, campaign, portraits, backstory,
 * descriptive fields, notes or rules text.
 * Accepts the API envelope ({ data }) or the bare character object.
 */
export function sanitize(raw: unknown): unknown {
  const cleaned = clean(raw) as Record<string, any>;
  const before = cleaned && typeof cleaned === 'object' && 'data' in cleaned ? cleaned.data : cleaned;
  const isCharacter = before !== null && typeof before === 'object' && !Array.isArray(before);
  const copy = (
    isCharacter
      ? replaceIdentifiers(cleaned, {
          characterId: replaceableId(before.id),
          userId: replaceableId(before.userId),
          username: typeof before.username === 'string' && before.username !== '' ? before.username : null,
        })
      : cleaned
  ) as Record<string, any>;
  const d = copy && typeof copy === 'object' && 'data' in copy ? copy.data : copy;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    if ('id' in d) d.id = PLACEHOLDER_ID;
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
