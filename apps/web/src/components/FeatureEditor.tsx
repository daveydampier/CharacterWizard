import type { Feature } from '@cw/model';
import { withHidden } from '@cw/rules';
import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { BUTTON, CHECK, PRIMARY } from './fieldStyles';
import { rowLabel } from './rowLabel';

/**
 * The editor for a feature that already has rows in play. Those rows are edited where they are
 * listed, so all this offers is hiding the feature, and it says which rows they are.
 */
export function FeatureEditor({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const setEdit = useStore((s) => s.setEdit);
  const stored = useStore((s) => s.edits.abilities[feature.key]);
  const [hidden, setHidden] = useState(false);

  if (!sheet) return null;

  const all = [...sheet.abilities, ...sheet.universal, ...sheet.hidden];
  const rows = feature.playKeys.flatMap((key) => {
    const ability = all.find((a) => a.key === key);
    return ability ? [rowLabel(ability, sheet)] : [];
  });

  function save(event: FormEvent): void {
    event.preventDefault();
    if (hidden) setEdit(feature.key, withHidden(stored, true, feature.hiddenOnSheet));
    onClose();
  }

  return (
    <Dialog title={`Edit ${feature.name}`} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <p className="text-sm text-slate-700">
          {rows.length > 0 ? `In play as: ${rows.join(', ')}.` : 'This feature already has rows in play.'}
          {' '}Change those rows where they are listed, in Combat or Explore.
        </p>

        <label className={CHECK}>
          <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} className="size-5" />
          <span>Hide this feature</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
