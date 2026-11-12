# Character Wizard

A play aid for D&D (2024 rules). It imports a character from D&D Beyond and shows what the character can do, grouped by Action, Bonus Action and Reaction, with every roll written out.

This repository contains the import, the sheet maths, the turn engine and the web app. See `docs/superpowers/specs/` for the design.

## Commands

    pnpm install
    pnpm test
    pnpm typecheck
    pnpm dev
    pnpm build
    pnpm sheet fixtures/characters/vlad.json
    pnpm fetch-character https://www.dndbeyond.com/characters/<id> <slug>

`pnpm dev` starts the app on your machine and on your local network, and answers character imports itself, so no Supabase project is needed for development. `fetch-character` and the app's import both need the sheet's Character Privacy set to Public.

## Packages

- `packages/model`: shared types.
- `packages/ddb-import`: converts D&D Beyond JSON into the app's `Character` format.
- `packages/rules`: calculates the sheet, the list of abilities, the roll lines and the turn engine.
- `apps/web`: the React app. Characters and play state are stored on the device.
- `supabase/functions/import-character`: the Edge Function that fetches a public character.

## Licensing and attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Character Wizard is not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast.
