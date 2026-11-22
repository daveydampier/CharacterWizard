import type { Ability, ResetType, Roll, UsesEdit } from '@cw/model';
import { canEditUses, diffEdit, editForm, isFeatureKey, normaliseRoll, type EditForm } from '@cw/rules';
import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import {
  MAX_USES_ERROR, ROLL_ERROR, ShownIn, TagToggles, TimingSelect, UsesFields, validMaxUses, withViews, type ViewsChosen,
} from './editorFields';
import { ALERT, BUTTON, CHECK, PRIMARY } from './fieldStyles';

/** What the form holds while it is open. The uses are kept apart so that unticking them forgets nothing. */
interface Draft extends Omit<EditForm, 'uses'> {
  limited: boolean;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
}

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
    if (!baseSheet || !start || !draft || !base) return;
    const draftUses: UsesEdit | null = draft.limited ? { max: draft.max, reset: draft.reset } : null;
    const usesChanged = draftUses === null || start.uses === null
      ? draftUses !== start.uses
      : draftUses.max !== start.uses.max || draftUses.reset !== start.uses.reset;
    // Untouched uses pass through as they are, even a maximum the editor would not accept.
    if (usesEditable && usesChanged && draftUses !== null && !validMaxUses(draftUses.max)) {
      setError(MAX_USES_ERROR);
      return;
    }
    // A roll the player did not touch is kept exactly as it is; one they changed must be a finished roll.
    const roll: Roll | null = draft.roll === start.roll ? draft.roll : normaliseRoll(draft.roll);
    if (!roll) {
      setError(ROLL_ERROR);
      return;
    }
    const form: EditForm = {
      timing: draft.timing,
      uses: usesEditable ? (usesChanged ? draftUses : start.uses) : null,
      tags: draft.tags,
      roll,
      inCombat: draft.inCombat,
      inExplore: draft.inExplore,
      hidden: draft.hidden,
    };
    setEdit(ability.key, diffEdit(baseSheet, base, form));
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
