import { ABILITIES, type AbilityName } from '@cw/model';
import { arr, num, type Raw } from './raw';

const byId = (list: unknown, id: number): number | null =>
  num(arr(list).find((s) => s?.id === id)?.value);

/** stats + bonusStats. Overrides are carried separately by `scoreOverrides`. */
export function baseScores(d: Raw): Record<AbilityName, number> {
  const out = {} as Record<AbilityName, number>;
  ABILITIES.forEach((ability, i) => {
    out[ability] = (byId(d.stats, i + 1) ?? 0) + (byId(d.bonusStats, i + 1) ?? 0);
  });
  return out;
}

/** overrideStats values that are set. Each replaces the final score outright. */
export function scoreOverrides(d: Raw): Partial<Record<AbilityName, number>> {
  const out: Partial<Record<AbilityName, number>> = {};
  ABILITIES.forEach((ability, i) => {
    const override = byId(d.overrideStats, i + 1);
    if (override !== null) out[ability] = override;
  });
  return out;
}
