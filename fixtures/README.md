# Fixtures

Real characters used as examples to test the converter and the sheet maths. The app is not built for these characters; they exist to prove the general rules against known-correct numbers.

- `characters/<slug>.json`: a D&D Beyond character response after `scripts/sanitize.ts`. Usernames, user IDs, campaign, portraits, backstory and all rules text are removed.
- `expected/<slug>.json`: the numbers D&D Beyond's own sheet showed for that character on the date in the file's `source` field. Spell slot counts come from the class table.

## Adding a fixture

1. Set the sheet's Character Privacy to Public on D&D Beyond.
2. Run `pnpm fetch-character <url> <slug>`.
3. Open the sheet on D&D Beyond and copy its numbers into `expected/<slug>.json`, using an existing file as the template.
4. Add the slug to `SLUGS` in `test-utils/fixtures.ts`.

Never edit an expected file to make a test pass. If the maths disagrees with D&D Beyond, fix the maths.
