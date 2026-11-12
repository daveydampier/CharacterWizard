import type { Ability } from '@cw/model';
import { TIMING_LABEL, combatGroups, pools, type Sheet, type TurnTiming } from '@cw/rules';
import { useMemo, type ReactNode } from 'react';
import { AbilityRow } from '../components/AbilityRow';
import { ConcentrationBanner } from '../components/ConcentrationBanner';
import { NotesList } from '../components/NotesList';
import { ResourceChips } from '../components/ResourceChips';
import { useAbilityUse } from '../components/useAbilityUse';
import { useStore } from '../store';

const TIMINGS: TurnTiming[] = ['action', 'bonus', 'reaction'];

const SUMMARY = 'flex min-h-11 cursor-pointer items-center justify-between py-2 text-sm font-medium text-slate-700';

/** A group that is always open: Action, Bonus Action, Reaction, Other. */
function Group({ title, hint, spent, children }: { title: string; hint?: string; spent?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={`mt-4 ${spent ? 'opacity-60' : ''}`}>
      <h2 className="flex items-baseline justify-between text-sm font-medium text-slate-700">
        <span>{spent ? `${title} · spent` : title}</span>
        {hint ? <span className="text-xs font-normal text-slate-600">{hint}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** A group that starts folded. */
function Folded({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="mt-4 border-t border-slate-200">
      <summary className={SUMMARY}>
        <span>{count !== undefined ? `${title} (${count})` : title}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      {children}
    </details>
  );
}

export function CombatView({ sheet }: { sheet: Sheet }) {
  const play = useStore((s) => s.play);
  const adjust = useStore((s) => s.adjust);
  const togglePill = useStore((s) => s.togglePill);
  const endConcentration = useStore((s) => s.endConcentration);
  const { request, slotSheet } = useAbilityUse('combat');
  const groups = useMemo(() => combatGroups(sheet), [sheet]);
  const allPools = useMemo(() => pools(sheet), [sheet]);

  const rows = (abilities: Ability[]): ReactNode =>
    abilities.map((ability) => (
      <AbilityRow
        key={ability.key}
        ability={ability}
        sheet={sheet}
        state={play}
        mode="combat"
        onUse={request}
        onAdjust={(pool, delta) => adjust(pool.key, delta)}
      />
    ));

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 flex gap-2 bg-slate-50 px-4 py-2">
        {TIMINGS.map((timing) => {
          const spent = play.turn[timing];
          return (
            <button
              key={timing}
              type="button"
              aria-pressed={spent}
              aria-label={`${TIMING_LABEL[timing]}: ${spent ? 'spent' : 'available'}`}
              onClick={() => togglePill(timing)}
              className={`min-h-11 flex-1 rounded-full border px-2 py-1.5 text-sm ${
                spent ? 'border-slate-300 text-slate-500 line-through' : 'border-indigo-300 bg-indigo-50 text-indigo-900'
              }`}
            >
              {TIMING_LABEL[timing]}
            </button>
          );
        })}
      </div>

      <ResourceChips pools={allPools} state={play} onAdjust={(pool, delta) => adjust(pool.key, delta)} />

      <ConcentrationBanner sheet={sheet} concentrationKey={play.concentrationKey} onEnd={endConcentration} />

      <Group
        title="Action"
        spent={play.turn.action}
        hint={sheet.attacksPerAction > 1 ? `Attack action: ${sheet.attacksPerAction} attacks` : undefined}
      >
        {rows(groups.action)}
      </Group>
      <Group title="Bonus Action" spent={play.turn.bonus}>
        {groups.bonus.length > 0 ? rows(groups.bonus) : <p className="py-2 text-sm text-slate-600">Nothing uses your Bonus Action.</p>}
      </Group>
      <Group title="Reaction" spent={play.turn.reaction}>
        {groups.reaction.length > 0 ? rows(groups.reaction) : <p className="py-2 text-sm text-slate-600">Nothing uses your Reaction.</p>}
      </Group>
      {groups.other.length > 0 ? <Group title="Other">{rows(groups.other)}</Group> : null}
      {groups.free.length > 0 ? <Folded title="No action needed" count={groups.free.length}>{rows(groups.free)}</Folded> : null}
      <Folded title="Anyone can do this">{rows(sheet.universal)}</Folded>
      <Folded title="Keep in mind" count={sheet.notes.length}>
        <NotesList notes={sheet.notes} empty="No conditional notes on this sheet." />
      </Folded>

      {slotSheet}
    </div>
  );
}
