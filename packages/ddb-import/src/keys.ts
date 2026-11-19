/**
 * Edits are stored by key, so two different things must never share one. The first row with a key
 * keeps it; each later row with the same key gets `#2`, `#3` and so on, in the order given.
 */
export function numberDuplicates<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const count = (seen.get(row.key) ?? 0) + 1;
    seen.set(row.key, count);
    return count === 1 ? row : { ...row, key: `${row.key}#${count}` };
  });
}

/** FNV-1a, 32 bits, as eight hex digits. Stable across runs and platforms; not for security. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
