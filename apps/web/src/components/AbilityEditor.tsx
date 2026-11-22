import type { Ability, ResetType, Tag, UsesEdit } from '@cw/model';
import { canEditUses, defaultViews, diffEdit, editForm, isFeatureKey, type EditForm, type Sheet } from '@cw/rules';
import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import {
  MAX_USES_ERROR, ShownIn, TagToggles, TimingSelect, UsesFields, checkedRoll, validMaxUses, withViews, type ViewsChosen,
} from './editorFields';
import { ALERT, BUTTON, CHECK, PRIMARY } from './fieldStyles';

/** What the form holds while it is open. The uses are kept apart so that unticking them forgets nothing. */
interface Draft extends Omit<EditForm, 'uses'> {
  limited: boolean;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
}

const sameTags = (a: Tag[], b: Tag[]): boolean => a.length === b.length && a.every((t) => b.includes(t));

/** Every row on `sheet`, listed or hidden, abilities and features alike. */
const rowsOf = (sheet: Sheet): Ability[] =>
  [...sheet.abilities, ...sheet.universal, ...sheet.hidden, ...Object.values(sheet.featureRows)];

/** The pool the ability with this key spends on `sheet`; null when it spends none. */
function poolOf(sheet: Sheet, key: string): string | null {
  const row = rowsOf(sheet).find((a) => a.key === key);
  return row?.cost.kind === 'uses' ? row.cost.resourceKey : null;
}

/** The keys of the abilities that spend `pool` on `sheet`. */
const spendersOf = (sheet: Sheet, pool: string): string[] =>
  [...new Set(rowsOf(sheet).filter((a) => a.cost.kind === 'uses' && a.cost.resourceKey === pool).map((a) => a.key))];

/**
 * Changes one ability from the sheet: when it is used, what it costs, how it is tagged, where it
 * is listed and what it rolls. An ability the player added has its own editor. A feature with no
 * ability of its own is edited here too, as the row it is, or would be, in play.
 */
export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const baseSheet = useStore((s) => s.baseSheet);
  const setEdit = useStore((s) => s.setEdit);
  const stored = useStore((s) => s.edits.abilities[ability.key]);
  /** A box counts as set by the player if an earlier edit recorded it. */
  const [chosen, setChosen] = useState<ViewsChosen>(() => ({
    combat: stored?.inCombat !== undefined, explore: stored?.inExplore !== undefined,
  }));
  const [start] = useState<EditForm | null>(() => (sheet ? editForm(sheet, ability) : null));
  const [draft, setDraft] = useState<Draft | null>(() =>
    start ? { ...start, limited: start.uses !== null, max: start.uses?.max ?? 1, reset: start.uses?.reset ?? 'long' } : null);
  const [error, setError] = useState<string | null>(null);

  if (!sheet || !baseSheet || !start || !draft) return null;

  const change = (next: Partial<Draft>): void => {
    const result = withViews(draft, next, chosen, ability);
    setDraft(result.draft);
    setChosen(result.chosen);
    setError(null);
  };
  const usesEditable = canEditUses(ability);
  const feature = isFeatureKey(ability.key);
  /** The ability as imported. An ability with none has nothing to compare against or go back to. */
  const base = [...baseSheet.abilities, ...baseSheet.universal].find((a) => a.key === ability.key) ?? baseSheet.featureRows[ability.key];
  const canRestore = base !== undefined && stored !== undefined;

  function save(event: FormEvent): void {
    event.preventDefault();
    if (!sheet || !baseSheet || !start || !draft || !base) return;
    // Only what the player changed is taken from the form. Everything else is read from the
    // ability as it stands now, which a sync or a re-import may have changed since the form opened.
    const now = editForm(sheet, ability);
    const draftUses: UsesEdit | null = draft.limited ? { max: draft.max, reset: draft.reset } : null;
    const usesChanged = draftUses === null || start.uses === null
      ? draftUses !== start.uses
      : draftUses.max !== start.uses.max || draftUses.reset !== start.uses.reset;
    // Untouched uses pass through as they are, even a maximum the editor would not accept.
    if (usesEditable && usesChanged && draftUses !== null && !validMaxUses(draftUses.max)) {
      setError(MAX_USES_ERROR);
      return;
    }
    const checked = checkedRoll(draft.roll, start.roll);
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    const timing = draft.timing !== start.timing ? draft.timing : now.timing;
    const tags = sameTags(draft.tags, start.tags) ? now.tags : draft.tags;
    /**
     * A box the player has not set follows the app's rule for the saved timing and tags, so
     * nothing is recorded for it. One they set is taken from the form where it changed.
     */
    const rule = defaultViews({ ...ability, timing, tags });
    const view = (name: 'combat' | 'explore', drafted: boolean, started: boolean, current: boolean): boolean =>
      !chosen[name] ? rule[name] : drafted !== started ? drafted : current;
    const form: EditForm = {
      timing,
      uses: usesEditable ? (usesChanged ? draftUses : now.uses) : null,
      tags,
      roll: draft.roll === start.roll ? now.roll : checked.roll,
      inCombat: view('combat', draft.inCombat, start.inCombat, now.inCombat),
      inExplore: view('explore', draft.inExplore, start.inExplore, now.inExplore),
      hidden: draft.hidden !== start.hidden ? draft.hidden : now.hidden,
    };
    const { uses: diffedUses, ...diffed } = diffEdit(baseSheet, base, form);
    const current = useStore.getState().edits.abilities;
    /**
     * Uses the player did not touch stay as this ability's own edit had them. What the pool reads
     * now may come from another ability's edit on the same pool, which is not this one's to record.
     */
    const kept = usesChanged ? diffedUses : current[ability.key]?.uses;
    setEdit(ability.key, kept === undefined ? diffed : { ...diffed, uses: kept });
    // A new maximum for a pool that other abilities also spend is the one that counts: only this edit holds it.
    const after = useStore.getState().sheet;
    if (usesEditable && usesChanged && draftUses !== null && after) {
      const pool = poolOf(after, ability.key);
      if (pool !== null) {
        for (const other of spendersOf(after, pool)) {
          const stored = current[other];
          if (other === ability.key || !stored || stored.uses === undefined || stored.uses === 'none') continue;
          const { uses: _dropped, ...rest } = stored;
          setEdit(other, rest);
        }
      }
    }
    onClose();
  }

  /** For a feature this comes first: whether it is in a view at all is the first thing to choose. */
  const shownIn = (
    <>
      <ShownIn inCombat={draft.inCombat} inExplore={draft.inExplore} onChange={change} />
      {feature ? <p className="text-sm text-slate-600">A feature is listed in Combat or Explore only when you tick it here.</p> : null}
    </>
  );

  return (
    <Dialog title={`Edit ${ability.name}`} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        {feature ? shownIn : null}
        <TimingSelect value={draft.timing} onChange={(timing) => change({ timing })} allowUnknown={start.timing === 'unknown'} />

        {usesEditable ? (
          <div className="space-y-3">
            <label className={CHECK}>
              <input type="checkbox" checked={draft.limited} onChange={(event) => change({ limited: event.target.checked })} className="size-5" />
              <span>Limited uses</span>
            </label>
            {draft.limited ? (
              <UsesFields max={draft.max} reset={draft.reset} onChange={change} allowUnknown={start.uses?.reset === 'unknown'} />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This ability costs a spell slot.</p>
        )}

        <TagToggles value={draft.tags} onChange={(tags) => change({ tags })} />
        {feature ? null : shownIn}
        <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />

        <label className={CHECK}>
          <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
          <span>{feature ? 'Hide this feature' : 'Hide this ability'}</span>
        </label>

        {error ? <p role="alert" className={ALERT}>{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
          {canRestore ? (
            <button
              type="button"
              onClick={() => {
                setEdit(ability.key, {});
                onClose();
              }}
              className={`${BUTTON} ml-auto`}
            >
              Back to imported
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
