import type { Pool } from '@cw/rules';

/** Above this many, pips are too small to tap, so the pool shows a number with minus and plus. */
const MAX_PIPS = 6;

interface Props {
  pool: Pool;
  /** How many are left. */
  left: number;
  /** +1 spends one, -1 restores one. */
  onAdjust: (delta: number) => void;
}

const BUTTON = 'inline-flex h-8 min-w-6 items-center justify-center text-lg leading-none';

/** A pool the player spends and restores by hand: a filled pip is one left, an empty pip is one spent. */
export function Pips({ pool, left, onAdjust }: Props) {
  if (pool.max > MAX_PIPS) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" aria-label={`Spend one ${pool.name}`} onClick={() => onAdjust(1)} className={BUTTON}>−</button>
        <span className="tabular-nums">{left} / {pool.max}</span>
        <button type="button" aria-label={`Restore one ${pool.name}`} onClick={() => onAdjust(-1)} className={BUTTON}>+</button>
      </span>
    );
  }
  return (
    <span role="group" aria-label={`${pool.name}: ${left} of ${pool.max} left`} className="inline-flex">
      {Array.from({ length: pool.max }, (_, index) => {
        const filled = index < left;
        return (
          <button
            key={index}
            type="button"
            aria-label={filled ? `Spend one ${pool.name}` : `Restore one ${pool.name}`}
            onClick={() => onAdjust(filled ? 1 : -1)}
            className={`${BUTTON} ${filled ? 'text-slate-900' : 'text-slate-400'}`}
          >
            {filled ? '●' : '○'}
          </button>
        );
      })}
    </span>
  );
}
