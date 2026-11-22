import type { AbilityEdit, CustomAbility, ResetType, Roll, Tag, Timing } from '@cw/model';
import { defaultViews, editForm } from '@cw/rules';
import { useId, useState, type FormEvent } from 'react';
import { newCustomKey, useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import {
  MAX_USES_ERROR, ShownIn, checkedRoll, TagToggles, TimingSelect, UsesFields, validMaxUses, withViews, type ViewsChosen,
} from './editorFields';
import { ALERT, BUTTON, CHECK, INPUT, LABEL, PRIMARY } from './fieldStyles';

type CostKind = CustomAbility['cost']['kind'];

const COST_OPTIONS: { value: CostKind; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'uses', label: 'Limited uses' },
  { value: 'slot', label: 'A spell slot' },
];

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** What the form holds while it is open. Every kind of cost keeps its fields, so switching between them forgets nothing. */
interface Draft {
  name: string;
  description: string;
  timing: Timing;
  cost: CostKind;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
  minLevel: number;
  concentration: boolean;
  tags: Tag[];
  roll: Roll;
  inCombat: boolean;
  inExplore: boolean;
  hidden: boolean;
}

function draftOf(custom: CustomAbility | null, shown: { inCombat: boolean; inExplore: boolean; hidden: boolean }): Draft {
  const cost = custom?.cost ?? { kind: 'none' };
  return {
    name: custom?.name ?? '',
    description: custom?.description ?? '',
    timing: custom?.timing ?? 'action',
    cost: cost.kind,
    max: cost.kind === 'uses' ? cost.max : 1,
    reset: cost.kind === 'uses' ? cost.reset : 'long',
    minLevel: cost.kind === 'slot' ? cost.minLevel : 1,
    concentration: custom?.concentration ?? false,
    tags: custom?.tags ?? [],
    roll: custom?.roll ?? { kind: 'none' },
    ...shown,
  };
}

/**
 * Adds an ability of the player's own (`custom` is null), or changes or deletes one. Unlike an
 * ability from the sheet it has a name, a description and a cost to set, and nothing to go back to.
 */
export function CustomAbilityEditor({ custom, onClose }: { custom: CustomAbility | null; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const saveCustom = useStore((s) => s.saveCustom);
  const deleteCustom = useStore((s) => s.deleteCustom);
  const setEdit = useStore((s) => s.setEdit);
  const stored = useStore((s) => (custom ? s.edits.abilities[custom.key] : undefined));
  /** A box counts as set by the player if an earlier edit recorded it. */
  const [chosen, setChosen] = useState<ViewsChosen>(() => ({
    combat: stored?.inCombat !== undefined, explore: stored?.inExplore !== undefined,
  }));
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => {
    // Where an existing ability is listed, and whether it is hidden, come from the sheet.
    const row = custom && sheet ? [...sheet.abilities, ...sheet.hidden].find((a) => a.key === custom.key) : undefined;
    const form = row && sheet ? editForm(sheet, row) : null;
    return draftOf(custom, { inCombat: form?.inCombat ?? true, inExplore: form?.inExplore ?? false, hidden: form?.hidden ?? false });
  });
  const [error, setError] = useState<string | null>(null);

  const change = (next: Partial<Draft>): void => {
    const result = withViews(draft, next, chosen, { ritual: false });
    setDraft(result.draft);
    setChosen(result.chosen);
    setError(null);
  };

  function save(event: FormEvent): void {
    event.preventDefault();
    const name = draft.name.trim();
    if (name === '') {
      setError('Give the ability a name.');
      return;
    }
    if (draft.cost === 'uses' && !validMaxUses(draft.max)) {
      setError(MAX_USES_ERROR);
      return;
    }
    // A roll the player did not touch is kept as it was saved.
    const checked = checkedRoll(draft.roll, custom?.roll ?? null);
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    const { roll } = checked;
    const cost: CustomAbility['cost'] =
      draft.cost === 'uses'
        ? { kind: 'uses', max: draft.max, reset: draft.reset }
        : draft.cost === 'slot'
          ? { kind: 'slot', minLevel: draft.minLevel }
          : { kind: 'none' };
    const key = custom?.key ?? newCustomKey();
    saveCustom({
      key, name, timing: draft.timing, roll, cost, tags: draft.tags, concentration: draft.concentration, description: draft.description,
    });
    if (custom) {
      // Only a choice that differs from where the app would list the saved ability is recorded.
      const after = useStore.getState().sheet;
      const saved = after ? [...after.abilities, ...after.hidden].find((a) => a.key === key) : undefined;
      const fallback = saved ? defaultViews(saved) : { combat: draft.inCombat, explore: draft.inExplore };
      const edit: AbilityEdit = {};
      if (draft.inCombat !== fallback.combat) edit.inCombat = draft.inCombat;
      if (draft.inExplore !== fallback.explore) edit.inExplore = draft.inExplore;
      if (draft.hidden) edit.hidden = true;
      setEdit(key, edit);
    }
    onClose();
  }

  function remove(): void {
    if (!custom) return;
    if (!window.confirm(`Delete ${custom.name}? This can't be undone.`)) return;
    deleteCustom(custom.key);
    onClose();
  }

  return (
    <Dialog title={custom ? `Edit ${custom.name}` : 'Add an ability'} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <div>
          <label htmlFor={`${id}-name`} className={LABEL}>Name</label>
          <input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            value={draft.name}
            onChange={(event) => change({ name: event.target.value })}
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor={`${id}-description`} className={LABEL}>Description</label>
          <textarea
            id={`${id}-description`}
            rows={3}
            value={draft.description}
            onChange={(event) => change({ description: event.target.value })}
            className={INPUT}
          />
        </div>

        <TimingSelect value={draft.timing} onChange={(timing) => change({ timing })} allowUnknown={custom?.timing === 'unknown'} />

        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-cost`} className={LABEL}>Cost</label>
            <select id={`${id}-cost`} value={draft.cost} onChange={(event) => change({ cost: event.target.value as CostKind })} className={INPUT}>
              {COST_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {draft.cost === 'uses' ? (
            <UsesFields
              max={draft.max}
              reset={draft.reset}
              onChange={change}
              allowUnknown={custom?.cost.kind === 'uses' && custom.cost.reset === 'unknown'}
            />
          ) : null}
          {draft.cost === 'slot' ? (
            <div>
              <label htmlFor={`${id}-level`} className={LABEL}>Lowest slot level</label>
              <select id={`${id}-level`} value={draft.minLevel} onChange={(event) => change({ minLevel: Number(event.target.value) })} className={INPUT}>
                {SLOT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
          ) : null}
        </div>

        <label className={CHECK}>
          <input type="checkbox" checked={draft.concentration} onChange={(event) => change({ concentration: event.target.checked })} className="size-5" />
          <span>Concentration</span>
        </label>

        <TagToggles value={draft.tags} onChange={(tags) => change({ tags })} />
        <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />

        {custom ? (
          <>
            <ShownIn inCombat={draft.inCombat} inExplore={draft.inExplore} onChange={change} />
            <label className={CHECK}>
              <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
              <span>Hide this ability</span>
            </label>
          </>
        ) : null}

        {error ? <p role="alert" className={ALERT}>{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
          {custom ? <button type="button" onClick={remove} className={`${BUTTON} ml-auto border-red-300 text-red-800`}>Delete</button> : null}
        </div>
      </form>
    </Dialog>
  );
}
