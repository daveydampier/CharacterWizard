import type { Ability, PlayState } from '@cw/model';
import { availability, costLabel, pools, remaining, rollLine, type Pool, type Sheet, type ViewMode } from '@cw/rules';
import { useState } from 'react';
import { Description } from './Description';
import { Pips } from './Pips';

interface Props {
  ability: Ability;
  sheet: Sheet;
  state: PlayState;
  mode: ViewMode;
  onUse: (ability: Ability) => void;
  onAdjust: (pool: Pool, delta: number) => void;
}

/** The small labels after the name: what it costs and what kind of ability it is. */
function labels(ability: Ability, sheet: Sheet, state: PlayState): string[] {
  const out: string[] = [];
  const cost = costLabel(ability, sheet, state);
  if (cost) out.push(cost);
  if (ability.concentration) out.push('concentration');
  if (ability.ritual) out.push('ritual');
  if (ability.timing === 'long') out.push('takes a minute or more');
  out.push(...ability.tags);
  return out;
}

/** One ability: name, labels, roll line, notes, a Use button, and the description on tap. */
export function AbilityRow({ ability, sheet, state, mode, onUse, onAdjust }: Props) {
  const [open, setOpen] = useState(false);
  const a = availability(ability, sheet, state, mode);
  const line = rollLine(ability.roll);
  const pool = ability.poolKey ? pools(sheet).find((p) => p.key === ability.poolKey) : undefined;
  const blocked = a.hasUse && !a.canUse;
  const meta = labels(ability, sheet, state);

  return (
    <article aria-label={ability.name} className="border-t border-slate-200 py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`min-w-0 flex-1 text-left ${blocked ? 'text-slate-500' : ''}`}
        >
          <span className="font-medium">{ability.name}</span>
          {meta.length > 0 ? <span className="ml-2 text-xs text-slate-500">{meta.join(' · ')}</span> : null}
          {line ? <span className="block text-sm">{line}</span> : null}
          {ability.notes.map((note) => <span key={note} className="block text-sm text-slate-600">{note}</span>)}
          {a.ends ? <span className="block text-sm text-amber-800">Ends your {a.ends}.</span> : null}
          {blocked && a.reason ? <span className="block text-sm">{a.reason}</span> : null}
        </button>
        {a.hasUse ? (
          <button
            type="button"
            aria-label={`Use ${ability.name}`}
            disabled={!a.canUse}
            onClick={() => onUse(ability)}
            className="rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium disabled:border-slate-200 disabled:text-slate-400"
          >
            Use
          </button>
        ) : null}
      </div>
      {pool ? (
        <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
          <span>Charges</span>
          <Pips pool={pool} left={remaining(pool, state)} onAdjust={(delta) => onAdjust(pool, delta)} />
        </div>
      ) : null}
      {open ? <div className="mt-2 rounded-lg bg-slate-100 p-2"><Description html={ability.description} /></div> : null}
    </article>
  );
}
