import { ABILITIES, SKILLS, type ProficiencyLevel } from '@cw/model';
import { abilityLabel, exploreAbilities, pools, rollLine, skillLabel, type Note, type Sheet } from '@cw/rules';
import { useMemo, useState, type ReactNode } from 'react';
import { AbilityRow } from '../components/AbilityRow';
import { NotesList } from '../components/NotesList';
import { ResourceChips } from '../components/ResourceChips';
import { useAbilityUse } from '../components/useAbilityUse';
import { useStore } from '../store';

/** One skill or saving throw: a name, a d20 roll and any notes that belong to it. */
interface CheckRow {
  key: string;
  label: string;
  bonus: number;
  /** "proficient", "expertise", "half proficiency", or null. */
  level: string | null;
  proficient: boolean;
  notes: Note[];
}

const LEVEL_LABEL: Record<ProficiencyLevel, string | null> = {
  none: null,
  half: 'half proficiency',
  proficient: 'proficient',
  expertise: 'expertise',
};

function skillRows(sheet: Sheet): CheckRow[] {
  return SKILLS.map((skill) => ({
    key: skill,
    label: skillLabel(skill),
    bonus: sheet.skills[skill],
    level: LEVEL_LABEL[sheet.skillLevels[skill]],
    proficient: sheet.skillLevels[skill] !== 'none',
    notes: sheet.notes.filter((n) => n.target.kind === 'skill' && n.target.skill === skill),
  }));
}

function saveRows(sheet: Sheet): CheckRow[] {
  return ABILITIES.map((ability) => ({
    key: ability,
    label: `${abilityLabel(ability)} save`,
    bonus: sheet.saves[ability],
    level: sheet.saveProficiency[ability] ? 'proficient' : null,
    proficient: sheet.saveProficiency[ability],
    notes: sheet.notes.filter((n) => n.target.kind === 'save' && n.target.ability === ability),
  }));
}

function Check({ row }: { row: CheckRow }) {
  return (
    <article aria-label={row.label} className="border-t border-slate-200 py-2">
      <span className="font-medium">{row.label}</span>
      {row.level ? <span className="ml-2 text-xs text-slate-500">{row.level}</span> : null}
      <span className="block text-sm">{rollLine({ kind: 'check', bonus: row.bonus })}</span>
      {row.notes.map((note) => <span key={note.text} className="block text-sm text-indigo-800">{note.text}</span>)}
    </article>
  );
}

/** Proficient rows first; the rest folded away unless the player is searching. */
function CheckList({ title, rows, searching, more }: { title: string; rows: CheckRow[]; searching: boolean; more: string }) {
  if (rows.length === 0) return null;
  const first = searching ? rows : rows.filter((row) => row.proficient);
  const rest = searching ? [] : rows.filter((row) => !row.proficient);
  return (
    <section aria-label={title} className="mt-4">
      <h2 className="text-sm font-medium text-slate-700">{title}</h2>
      {first.map((row) => <Check key={row.key} row={row} />)}
      {rest.length > 0 ? (
        <details className="border-t border-slate-200">
          <summary className="flex cursor-pointer items-center justify-between py-2 text-sm text-slate-700">
            <span>{`${rest.length} more ${more}`}</span>
            <span aria-hidden="true">▾</span>
          </summary>
          {rest.map((row) => <Check key={row.key} row={row} />)}
        </details>
      ) : null}
    </section>
  );
}

export function ExploreView({ sheet }: { sheet: Sheet }) {
  const play = useStore((s) => s.play);
  const adjust = useStore((s) => s.adjust);
  const rest = useStore((s) => s.rest);
  const { request, slotSheet } = useAbilityUse('explore');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (text: string): boolean => needle === '' || text.toLowerCase().includes(needle);

  const allPools = useMemo(() => pools(sheet), [sheet]);
  const skills = useMemo(() => skillRows(sheet), [sheet]);
  const saves = useMemo(() => saveRows(sheet), [sheet]);
  const abilities = useMemo(() => exploreAbilities(sheet), [sheet]);
  const otherNotes = useMemo(() => sheet.notes.filter((n) => n.target.kind === 'other'), [sheet]);

  const shownSkills = skills.filter((row) => matches(row.label));
  const shownSaves = saves.filter((row) => matches(row.label));
  const shownAbilities = abilities.filter((a) => matches(a.name));
  const nothing = shownSkills.length + shownSaves.length + shownAbilities.length === 0;

  let abilityList: ReactNode = null;
  if (shownAbilities.length > 0) {
    abilityList = shownAbilities.map((ability) => (
      <AbilityRow
        key={ability.key}
        ability={ability}
        sheet={sheet}
        state={play}
        mode="explore"
        onUse={request}
        onAdjust={(pool, delta) => adjust(pool.key, delta)}
      />
    ));
  } else if (needle === '') {
    abilityList = <p className="py-2 text-sm text-slate-600">Nothing on this sheet is marked for use outside combat.</p>;
  }

  return (
    <div>
      <label htmlFor="search" className="sr-only">Search skills and abilities</label>
      <input
        id="search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search skills and abilities"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
      />

      <ResourceChips pools={allPools} state={play} onAdjust={(pool, delta) => adjust(pool.key, delta)} />

      {nothing ? <p className="mt-4 text-sm text-slate-600">Nothing matches "{query.trim()}".</p> : null}

      <CheckList title="Skill checks" rows={shownSkills} searching={needle !== ''} more="skills" />
      <CheckList title="Saving throws" rows={shownSaves} searching={needle !== ''} more="saves" />

      {abilityList ? (
        <section aria-label="Out of combat abilities" className="mt-4">
          <h2 className="text-sm font-medium text-slate-700">Out of combat abilities</h2>
          {abilityList}
        </section>
      ) : null}

      <section aria-label="Keep in mind" className="mt-4">
        <h2 className="text-sm font-medium text-slate-700">Keep in mind</h2>
        <NotesList notes={otherNotes} empty="No other notes on this sheet." />
      </section>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => rest('short')} className="flex-1 rounded-lg border border-slate-400 px-3 py-3 font-medium">
          Short Rest
        </button>
        <button type="button" onClick={() => rest('long')} className="flex-1 rounded-lg border border-slate-400 px-3 py-3 font-medium">
          Long Rest
        </button>
      </div>

      {slotSheet}
    </div>
  );
}
