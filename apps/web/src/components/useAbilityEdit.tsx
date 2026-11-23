import type { ViewName } from '@cw/model';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { AbilityEditor } from './AbilityEditor';
import { CustomAbilityEditor } from './CustomAbilityEditor';
import { FeatureEditor } from './FeatureEditor';

/** What the editor is open for: a row on the sheet, by key, or an ability that does not exist yet, added from a view. */
type Target = { key: string } | { add: ViewName } | null;

interface Editing {
  /** Opens the editor for an ability or a feature. */
  edit: (row: { key: string }) => void;
  /** Opens the editor for a new ability of the player's own, added from `view`. */
  add: (view: ViewName) => void;
  /** The open editor, to render once in the view. */
  editor: ReactNode;
}

/**
 * What a view needs to make Edit work. An ability the player added opens the custom ability
 * editor. A feature that already has rows in play opens the small editor that only hides it.
 * Everything else opens the ordinary one: an ability from the sheet, a custom action imported
 * from D&D Beyond, and a feature with no ability of its own, which is edited as the row it would
 * be in play. The row is remembered by key, so the editor closes by itself if the row leaves the
 * sheet while it is open.
 */
export function useAbilityEdit(): Editing {
  const sheet = useStore((s) => s.sheet);
  const customs = useStore((s) => s.edits.custom);
  const [target, setTarget] = useState<Target>(null);
  const close = (): void => setTarget(null);

  const key = target !== null && 'key' in target ? target.key : null;
  const ability = sheet && key !== null
    ? [...sheet.abilities, ...sheet.universal].find((a) => a.key === key) ?? sheet.featureRows[key]
    : undefined;
  const custom = ability?.source === 'custom' ? customs.find((c) => c.key === ability.key) : undefined;
  const feature = sheet && key !== null && !ability
    ? sheet.featureSource.list.find((f) => f.key === key && f.playKeys.length > 0)
    : undefined;

  // Forget a row that has left the sheet, so its editor does not come back if the row does.
  useEffect(() => {
    if (key !== null && !ability && !feature) setTarget(null);
  }, [key, ability, feature]);

  let editor: ReactNode = null;
  if (target !== null && 'add' in target) editor = <CustomAbilityEditor custom={null} view={target.add} onClose={close} />;
  // Keyed, so that opening the editor for another row starts a new form.
  else if (custom) editor = <CustomAbilityEditor key={custom.key} custom={custom} onClose={close} />;
  else if (ability) editor = <AbilityEditor key={ability.key} ability={ability} onClose={close} />;
  else if (feature) editor = <FeatureEditor key={feature.key} feature={feature} onClose={close} />;

  return { edit: (row) => setTarget({ key: row.key }), add: (view) => setTarget({ add: view }), editor };
}
