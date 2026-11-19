import {
  CHARACTER_LIMIT, IMPORTS_PER_HOUR, RemoteError,
  type CharacterPush, type ImportAllowance, type ImportResult, type ItemPush, type Profile, type PushResult,
  type Remote, type RemoteCharacter, type RemoteItem,
} from './types';

const HOUR = 60 * 60 * 1000;

export interface MemoryServerOptions {
  /** The server's clock, in milliseconds. Tests replace it. */
  now?: () => number;
  /** What an allowed import returns. Local development points this at the dev server. */
  importer?: (ddbId: string) => Promise<ImportResult>;
}

export interface MemoryRemoteOptions {
  /** Who this device is signed in as. Omit for a signed-out device. */
  userId?: string | null;
  /** Who `signIn()` signs this device in as. The user is created, approved and admin, if new. */
  signInAs?: { id: string; displayName: string };
}

/** A Remote with the account's import check exposed, so tests can call it without an import. */
export interface MemoryRemote extends Remote {
  recordImport(): Promise<ImportAllowance>;
}

export interface MemoryServer {
  addUser(id: string, displayName: string, options?: { approved?: boolean; admin?: boolean }): void;
  /** A device's connection to this server. */
  remote(options?: MemoryRemoteOptions): MemoryRemote;
  /** While true, every call from every device rejects with RemoteError('offline'). */
  offline: boolean;
}

const itemId = (row: { characterId: string; kind: string; key: string }): string =>
  JSON.stringify([row.characterId, row.kind, row.key]);

/**
 * The account, in memory. It keeps the same rules as the SQL in supabase/migrations: who may see
 * and write what, the later change winning, the ten-character limit and the import rate limit.
 * `remote/contract.ts` runs one list of cases against both, so that they cannot drift apart.
 */
export function memoryServer(options: MemoryServerOptions = {}): MemoryServer {
  const now = options.now ?? Date.now;
  const profiles = new Map<string, Profile>();
  const characters = new Map<string, RemoteCharacter>();
  const items = new Map<string, RemoteItem>();
  const imports: { userId: string; at: number }[] = [];
  let rev = 0;

  /** The time a write is recorded as: its own, but never later than the server's clock. */
  const capped = (updatedAt: string): string => {
    const time = Date.parse(updatedAt);
    return new Date(Number.isFinite(time) ? Math.min(time, now()) : now()).toISOString();
  };
  const newer = (incoming: string, stored: string): boolean => Date.parse(incoming) > Date.parse(stored);
  const liveCount = (ownerId: string): number =>
    [...characters.values()].filter((c) => c.ownerId === ownerId && !c.deleted).length;

  const server: MemoryServer = {
    offline: false,

    addUser(id, displayName, { approved = false, admin = false } = {}) {
      profiles.set(id, { id, displayName, approved, isTableAdmin: admin });
    },

    remote(remoteOptions = {}) {
      let userId = remoteOptions.userId ?? null;
      let listener: (id: string | null) => void = () => undefined;

      /** The signed-in user's profile. Rejects when offline or signed out. */
      const caller = (): Profile => {
        if (server.offline) throw new RemoteError('offline');
        const profile = userId === null ? undefined : profiles.get(userId);
        if (!profile) throw new RemoteError('unauthorized');
        return profile;
      };
      const isAdmin = (p: Profile): boolean => p.approved && p.isTableAdmin;
      const canSee = (p: Profile, c: RemoteCharacter): boolean => p.approved && (c.ownerId === p.id || isAdmin(p));

      const recordImport = async (): Promise<ImportAllowance> => {
        const me = caller();
        if (!me.approved) return 'not-approved';
        const since = now() - HOUR;
        if (imports.filter((i) => i.userId === me.id && i.at > since).length >= IMPORTS_PER_HOUR) return 'rate-limited';
        imports.push({ userId: me.id, at: now() });
        return 'ok';
      };

      return {
        async start(onUser) {
          listener = onUser;
          onUser(userId);
        },
        async signIn() {
          const who = remoteOptions.signInAs;
          if (!who) return;
          if (!profiles.has(who.id)) server.addUser(who.id, who.displayName, { approved: true, admin: true });
          userId = who.id;
          listener(userId);
        },
        async signOut() {
          userId = null;
          listener(null);
        },

        async profile() {
          return { ...caller() };
        },
        async listProfiles() {
          const me = caller();
          const visible = isAdmin(me) ? [...profiles.values()] : [me];
          return visible.map((p) => ({ ...p })).sort((a, b) => a.displayName.localeCompare(b.displayName));
        },
        async setApproved(id, approved) {
          const me = caller();
          const target = profiles.get(id);
          if (!isAdmin(me) || id === me.id || !target) throw new RemoteError('refused');
          profiles.set(id, { ...target, approved });
        },

        async pushCharacters(rows: CharacterPush[]): Promise<PushResult> {
          const me = caller();
          const rejected: PushResult['rejected'] = [];
          for (const row of rows) {
            const existing = characters.get(row.id);
            if (!me.approved || (existing && !canSee(me, existing))) {
              rejected.push({ id: row.id, reason: 'refused' });
              continue;
            }
            const updatedAt = capped(row.updatedAt);
            if (existing && !newer(updatedAt, existing.updatedAt)) continue;
            const ownerId = existing?.ownerId ?? me.id;
            const becomesLive = !row.deleted && (!existing || existing.deleted);
            if (becomesLive && liveCount(ownerId) >= CHARACTER_LIMIT) {
              rejected.push({ id: row.id, reason: 'limit' });
              continue;
            }
            rev += 1;
            characters.set(row.id, structuredClone({
              ...row, ownerId, updatedAt, rawJson: row.deleted ? null : row.rawJson, rev,
            }));
            if (row.deleted) {
              for (const item of [...items.values()]) {
                if (item.characterId === row.id) items.delete(itemId(item));
              }
            }
          }
          return { rejected };
        },

        async pushItems(rows: ItemPush[]) {
          const me = caller();
          for (const row of rows) {
            const character = characters.get(row.characterId);
            if (!character || character.deleted || !canSee(me, character)) continue;
            const existing = items.get(itemId(row));
            const updatedAt = capped(row.updatedAt);
            if (existing && !newer(updatedAt, existing.updatedAt)) continue;
            rev += 1;
            items.set(itemId(row), structuredClone({ ...row, updatedAt, data: row.deleted ? null : row.data, rev }));
          }
        },

        async pullCharacters(afterRev) {
          const me = caller();
          return structuredClone(
            [...characters.values()].filter((c) => c.rev > afterRev && canSee(me, c)).sort((a, b) => a.rev - b.rev),
          );
        },
        async pullItems(afterRev) {
          const me = caller();
          const visible = (item: RemoteItem): boolean => {
            const character = characters.get(item.characterId);
            return character !== undefined && !character.deleted && canSee(me, character);
          };
          return structuredClone(
            [...items.values()].filter((i) => i.rev > afterRev && visible(i)).sort((a, b) => a.rev - b.rev),
          );
        },

        recordImport,
        async importCharacter(ddbId) {
          let allowed: ImportAllowance;
          try {
            allowed = await recordImport();
          } catch (error) {
            return { status: error instanceof RemoteError && error.kind === 'unauthorized' ? 'unauthorized' : 'unreachable' };
          }
          if (allowed !== 'ok') return { status: allowed };
          if (!options.importer) return { status: 'unreachable' };
          try {
            return await options.importer(ddbId);
          } catch {
            return { status: 'unreachable' };
          }
        },
      };
    },
  };
  return server;
}
