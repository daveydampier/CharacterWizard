import type { PlayState, TurnState } from '@cw/model';

/** The part of the play state that syncs: what is spent and what is being concentrated on. */
export type PlayItem = Pick<PlayState, 'spent' | 'concentrationKey'>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Stored and synced records are checked and repaired before use, because they may have been
 * written by an older version of the app, by another device, or by hand in the database.
 * These functions never throw.
 */
export function normalisePlayItem(data: unknown): PlayItem {
  const source = isRecord(data) ? data : {};
  const spent: Record<string, number> = {};
  if (isRecord(source.spent)) {
    for (const [key, value] of Object.entries(source.spent)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) spent[key] = Math.floor(value);
    }
  }
  const concentrationKey = typeof source.concentrationKey === 'string' ? source.concentrationKey : null;
  return { spent, concentrationKey };
}

export function normaliseTurn(data: unknown): TurnState {
  const source = isRecord(data) ? data : {};
  return {
    action: source.action === true,
    bonus: source.bonus === true,
    reaction: source.reaction === true,
    slotSpentThisTurn: source.slotSpentThisTurn === true,
  };
}
