import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANN, BEN, DEE, NEW, character, item, remoteContract, type ContractBackend, type ContractClient,
} from '../../apps/web/src/remote/contract';
import {
  characterFromRow, characterToRow, itemFromRow, itemToRow, profileFromRow, rejectedFromJson, remoteErrorFrom,
} from '../../apps/web/src/remote/rows';
import type { ImportAllowance } from '../../apps/web/src/remote/types';
import { openDatabase, queryAs, resetDatabase } from './database';

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase();
}, 60_000);

/** Makes the same calls supabaseRemote makes, straight against the database. */
function client(userId: string): ContractClient {
  const run = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try {
      return await queryAs<T>(db, userId, sql, params);
    } catch (error) {
      throw remoteErrorFrom(error as { code?: string; message?: string });
    }
  };
  return {
    async profile() {
      const rows = await run<Record<string, unknown>>('select * from public.profiles where id = $1', [userId]);
      return rows[0] ? profileFromRow(rows[0]) : null;
    },
    async listProfiles() {
      return (await run<Record<string, unknown>>('select * from public.profiles order by display_name')).map(profileFromRow);
    },
    async setApproved(player, approved) {
      await run('select public.set_player_approved($1, $2)', [player, approved]);
    },
    async pushCharacters(rows) {
      const [result] = await run<{ rejected: unknown }>(
        'select public.push_characters($1::jsonb) as rejected', [JSON.stringify(rows.map(characterToRow))],
      );
      return { rejected: rejectedFromJson(result.rejected) };
    },
    async pushItems(rows) {
      await run('select public.push_items($1::jsonb)', [JSON.stringify(rows.map(itemToRow))]);
    },
    async pullCharacters(afterRev) {
      return (await run<Record<string, unknown>>(
        'select * from public.characters where rev > $1 order by rev', [afterRev],
      )).map(characterFromRow);
    },
    async pullItems(afterRev) {
      return (await run<Record<string, unknown>>(
        'select * from public.character_items where rev > $1 order by rev', [afterRev],
      )).map(itemFromRow);
    },
    async recordImport() {
      const [row] = await run<{ result: ImportAllowance }>('select public.record_import() as result');
      return row.result;
    },
  };
}

async function backend(): Promise<ContractBackend> {
  await resetDatabase(db);
  return {
    async addUser(id, displayName, { approved = false, admin = false } = {}) {
      // What Supabase Auth does on a first Discord sign-in, then what the owner does by hand.
      await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [
        id, JSON.stringify({ full_name: displayName }),
      ]);
      await db.query('update public.profiles set approved = $2, is_table_admin = $3 where id = $1', [id, approved, admin]);
    },
    as: client,
  };
}

remoteContract('the SQL migrations', backend);

describe('the database, beyond the shared rules', () => {
  const table = async (): Promise<ContractBackend> => {
    const b = await backend();
    await b.addUser(ANN, 'Ann', { approved: true });
    await b.addUser(BEN, 'Ben', { approved: true });
    await b.addUser(DEE, 'Dee', { approved: true, admin: true });
    await b.addUser(NEW, 'Newcomer');
    return b;
  };

  it('names a new profile from Discord, preferring the display name, and falls back to "Player"', async () => {
    await backend();
    const add = (id: string, meta: unknown) =>
      db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify(meta)]);
    await add(ANN, { full_name: 'ann#1234', name: 'ann', custom_claims: { global_name: 'Ann of the Dice' } });
    await add(BEN, { name: 'ben' });
    await add(NEW, {});
    const names = (await db.query<{ display_name: string }>('select display_name from public.profiles order by display_name')).rows;
    expect(names.map((n) => n.display_name)).toEqual(['Ann of the Dice', 'Player', 'ben']);
  });

  it('gives a request with no token nothing at all', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    for (const tableName of ['profiles', 'characters', 'character_items', 'import_log']) {
      await expect(queryAs(db, null, `select * from public.${tableName}`)).rejects.toThrow(/permission denied/);
    }
    await expect(queryAs(db, null, 'select public.record_import()')).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, null, `select public.push_characters('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
  });

  it('lets nobody write a profile directly, not even their own or as admin', async () => {
    await table();
    for (const user of [NEW, ANN, DEE]) {
      await expect(queryAs(db, user, `update public.profiles set approved = true, is_table_admin = true where id = $1`, [user]))
        .rejects.toThrow(/permission denied/);
    }
    await expect(queryAs(db, NEW, `insert into public.profiles (id, approved) values ($1, true)`, [NEW]))
      .rejects.toThrow(/permission denied/);
  });

  it('lets nobody read or write the import log directly', async () => {
    await table();
    await expect(queryAs(db, ANN, 'select * from public.import_log')).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, DEE, `delete from public.import_log`)).rejects.toThrow(/permission denied/);
  });

  it('lets nobody delete a character or an item outright', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    await b.as(ANN).pushItems([item('a1', 'play', 'state')]);
    await expect(queryAs(db, ANN, `delete from public.characters where id = 'a1'`)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, DEE, `delete from public.character_items`)).rejects.toThrow(/permission denied/);
  });

  it('holds the rules against direct writes to the tables, not only through the functions', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    // Ben cannot see Ann's row, so his update changes nothing; a newcomer's insert is refused.
    await queryAs(db, BEN, `update public.characters set name = 'Stolen', updated_at = now() where id = 'a1'`);
    expect((await b.as(ANN).pullCharacters(0))[0].name).toBe('Character a1');
    await expect(queryAs(db, NEW, `
      insert into public.characters (id, owner_id, imported_at, updated_at) values ('n1', $1, now(), now())`, [NEW]))
      .rejects.toThrow(/row-level security/);
    // Nobody can create a character in someone else's name, admin included.
    await expect(queryAs(db, DEE, `
      insert into public.characters (id, owner_id, imported_at, updated_at) values ('x1', $1, now(), now())`, [ANN]))
      .rejects.toThrow(/row-level security/);
    // An owner cannot give a character away: the owner column does not change.
    await queryAs(db, ANN, `update public.characters set owner_id = $1, updated_at = '2026-02-01T00:00:00Z' where id = 'a1'`, [BEN]);
    expect((await b.as(DEE).pullCharacters(0))[0].ownerId).toBe(ANN);
  });

  it('refuses an item of an unknown kind', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    await expect(b.as(ANN).pushItems([item('a1', 'turn' as never, 'state')])).rejects.toThrow();
  });

  it('counts only the last hour of imports, and clears out rows older than a day', async () => {
    const b = await table();
    await db.query(`
      insert into public.import_log (user_id, at)
      select $1, now() - interval '61 minutes' from generate_series(1, 30)`, [ANN]);
    await db.query(`insert into public.import_log (user_id, at) values ($1, now() - interval '2 days')`, [ANN]);
    expect(await b.as(ANN).recordImport()).toBe('ok');
    const rows = (await db.query<{ n: number }>('select count(*)::int as n from public.import_log where user_id = $1', [ANN])).rows;
    expect(rows[0].n).toBe(31);
  });

  it('removes a player\'s characters and items when their account is deleted', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    await b.as(ANN).pushItems([item('a1', 'play', 'state')]);
    await db.query('delete from auth.users where id = $1', [ANN]);
    expect(await b.as(DEE).pullCharacters(0)).toEqual([]);
    expect(await b.as(DEE).pullItems(0)).toEqual([]);
  });
});
