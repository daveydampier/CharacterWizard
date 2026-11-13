import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseCharacterId } from '@cw/ddb-import';
import { sanitize } from './sanitize';

const ENDPOINT = 'https://character-service.dndbeyond.com/character/v5/character/';

async function main(): Promise<void> {
  const [input, slug] = process.argv.slice(2);
  const id = parseCharacterId(input ?? '');
  if (!id || !slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error('Usage: pnpm fetch-character <dndbeyond character URL or ID> <slug>');
    process.exit(1);
  }
  const response = await fetch(`${ENDPOINT}${id}`);
  if (response.status === 403) {
    console.error('This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.');
    process.exit(1);
  }
  if (response.status === 404) {
    console.error('No character with that ID.');
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`D&D Beyond didn't respond as expected (HTTP ${response.status}).`);
    process.exit(1);
  }
  const clean = sanitize(await response.json());
  mkdirSync('fixtures/characters', { recursive: true });
  const path = `fixtures/characters/${slug}.json`;
  writeFileSync(path, JSON.stringify(clean));
  console.log(`Wrote ${path}. Add fixtures/expected/${slug}.json with values read from the D&D Beyond sheet.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
