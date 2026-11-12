import type { PlayState } from '@cw/model';
import { remaining, type Pool } from '@cw/rules';
import { useState } from 'react';
import { Pips } from './Pips';

/** How many pools are shown before the rest fold behind a "more" button. */
const SHOWN = 4;

interface Props {
  pools: Pool[];
  state: PlayState;
  onAdjust: (pool: Pool, delta: number) => void;
}

/** Every limited pool as a chip with tappable pips. */
export function ResourceChips({ pools, state, onAdjust }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (pools.length === 0) return null;
  const visible = showAll ? pools : pools.slice(0, SHOWN);
  const hidden = pools.length - visible.length;
  return (
    <section aria-label="Resources" className="flex flex-wrap items-center gap-2">
      {visible.map((pool) => (
        <span key={pool.key} className="inline-flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pl-3 pr-1 text-sm">
          <span>{pool.name}</span>
          <Pips pool={pool} left={remaining(pool, state)} onAdjust={(delta) => onAdjust(pool, delta)} />
        </span>
      ))}
      {pools.length > SHOWN ? (
        <button type="button" onClick={() => setShowAll(!showAll)} className="rounded-full px-2 py-1 text-sm text-indigo-700">
          {showAll ? 'Show fewer' : `+${hidden} more`}
        </button>
      ) : null}
    </section>
  );
}
