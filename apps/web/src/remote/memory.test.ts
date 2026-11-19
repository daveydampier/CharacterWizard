import { describe, expect, it, vi } from 'vitest';
import { ANN, character, remoteContract, type ContractBackend } from './contract';
import { memoryServer } from './memory';
import { IMPORTS_PER_HOUR, RemoteError } from './types';

remoteContract('memoryServer', async (): Promise<ContractBackend> => {
  const server = memoryServer();
  return {
    async addUser(id, displayName, options) {
      server.addUser(id, displayName, options);
    },
    as: (userId) => server.remote({ userId }),
  };
});

describe('memoryServer', () => {
  it('rejects every call from a signed-out device as unauthorized', async () => {
    const remote = memoryServer().remote();
    await expect(remote.profile()).rejects.toBeInstanceOf(RemoteError);
    await expect(remote.pullCharacters(0)).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(remote.pushCharacters([character('a1')])).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('rejects every call as offline while offline', async () => {
    const server = memoryServer();
    server.addUser(ANN, 'Ann', { approved: true });
    const remote = server.remote({ userId: ANN });
    server.offline = true;
    await expect(remote.pullItems(0)).rejects.toMatchObject({ kind: 'offline' });
    server.offline = false;
    expect(await remote.pullItems(0)).toEqual([]);
  });

  it('tells the listener who is signed in at start, after sign-in and after sign-out', async () => {
    const server = memoryServer();
    const remote = server.remote({ signInAs: { id: ANN, displayName: 'Test player' } });
    const seen: (string | null)[] = [];
    await remote.start((userId) => seen.push(userId));
    await remote.signIn();
    await remote.signOut();
    expect(seen).toEqual([null, ANN, null]);
  });

  it('creates the sign-in user as an approved admin, which is what local development wants', async () => {
    const remote = memoryServer().remote({ signInAs: { id: ANN, displayName: 'Test player' } });
    await remote.start(() => undefined);
    await remote.signIn();
    expect(await remote.profile()).toEqual({ id: ANN, displayName: 'Test player', approved: true, isTableAdmin: true });
  });

  it('forgets imports older than an hour', async () => {
    let now = Date.parse('2026-11-18T12:00:00.000Z');
    const server = memoryServer({ now: () => now });
    server.addUser(ANN, 'Ann', { approved: true });
    const remote = server.remote({ userId: ANN });
    for (let i = 0; i < IMPORTS_PER_HOUR; i += 1) await remote.recordImport();
    expect(await remote.recordImport()).toBe('rate-limited');
    now += 61 * 60 * 1000;
    expect(await remote.recordImport()).toBe('ok');
  });

  it('checks before it imports, and passes an allowed import to the importer', async () => {
    const importer = vi.fn(async () => ({ status: 'ok' as const, raw: { data: { id: 42 } } }));
    const server = memoryServer({ importer });
    server.addUser(ANN, 'Ann');
    const remote = server.remote({ userId: ANN });
    expect(await remote.importCharacter('42')).toEqual({ status: 'not-approved' });
    expect(importer).not.toHaveBeenCalled();
    server.addUser(ANN, 'Ann', { approved: true });
    expect(await remote.importCharacter('42')).toEqual({ status: 'ok', raw: { data: { id: 42 } } });
    expect(importer).toHaveBeenCalledWith('42');
  });

  it('answers an import from a signed-out device with unauthorized, and with unreachable when offline', async () => {
    const server = memoryServer();
    expect(await server.remote().importCharacter('42')).toEqual({ status: 'unauthorized' });
    server.addUser(ANN, 'Ann', { approved: true });
    server.offline = true;
    expect(await server.remote({ userId: ANN }).importCharacter('42')).toEqual({ status: 'unreachable' });
  });

  it('answers unreachable when the importer itself fails', async () => {
    const server = memoryServer({
      importer: async () => {
        throw new Error('network down');
      },
    });
    server.addUser(ANN, 'Ann', { approved: true });
    const remote = server.remote({ userId: ANN });
    expect(await remote.importCharacter('42')).toEqual({ status: 'unreachable' });
  });
});
