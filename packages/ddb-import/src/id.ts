/**
 * Accepts "123456789" or a dndbeyond.com/characters/<id> URL, with or without a trailing path,
 * query string or fragment. Returns the numeric ID, or null for anything else.
 */
export function parseCharacterId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{1,12}$/.test(trimmed)) return trimmed;
  const match = /^https:\/\/(?:www\.)?dndbeyond\.com\/characters\/(\d{1,12})(?:\/[a-z0-9-]*)*(?:[?#].*)?$/i.exec(trimmed);
  return match ? match[1] : null;
}
