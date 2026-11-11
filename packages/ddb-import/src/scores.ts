import { ABILITIES, type AbilityName } from '@cw/model';
import { arr, num, type Raw } from './raw';

/** stats + bonusStats, unless overrideStats sets the score outright. */
export function baseScores(d: Raw): Record<AbilityName, number> {
  const byId = (list: unknown, id: number): number | null =>
    num(arr(list).find((s) => s?.id === id)?.value);
  const out = {} as Record<AbilityName, number>;
  ABILITIES.forEach((ability, i) => {
    const id = i + 1;
    const override = byId(d.overrideStats, id);
    out[ability] = override ?? (byId(d.stats, id) ?? 0) + (byId(d.bonusStats, id) ?? 0);
  });
  return out;
}
