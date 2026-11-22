import type { Ability } from '@cw/model';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { AbilityEditor } from './AbilityEditor';
import { CustomAbilityEditor } from './CustomAbilityEditor';

/** What the editor is open for: an ability on the sheet, by key, or one that does not exist yet. */
type Target = { key: string } | 'new' | null;

interface Editing {
  /** Opens the editor for an ability. */
  edit: (ability: Ability) => void;
  /** Opens the editor for a new ability of the player's own. */
  add: () => void;
  /** The open editor, to render once in the view. */
  editor: ReactNode;
}

/**
 * What a view needs to make Edit work. An ability the player added opens the custom ability
 * editor; everything else, a custom action imported from D&D Beyond included, opens the ordinary
 * one. The ability is remembered by key, so the editor closes by itself if the ability leaves the
 * sheet while it is open.
 */
export function useAbilityEdit(): Editing {
  const sheet = useStore((s) => s.sheet);
  const customs = useStore((s) => s.edits.custom);
  const [target, setTarget] = useState<Target>(null);
  const close = (): void => setTarget(null);

  const key = target !== null && target !== 'new' ? target.key : null;
  const ability = sheet && key !== null ? [...sheet.abilities, ...sheet.universal].find((a) => a.key === key) : undefined;
  const custom = ability?.source === 'custom' ? customs.find((c) => c.key === ability.key) : undefined;

  // Forget an ability that has left the sheet, so its editor does not come back if the ability does.
  useEffect(() => {
    if (key !== null && !ability) setTarget(null);
  }, [key, ability]);

  let editor: ReactNode = null;
  if (target === 'new') editor = <CustomAbilityEditor custom={null} onClose={close} />;
  // Keyed, so that opening the editor for another ability starts a new form.
  else if (custom) editor = <CustomAbilityEditor key={custom.key} custom={custom} onClose={close} />;
  else if (ability) editor = <AbilityEditor key={ability.key} ability={ability} onClose={close} />;

  return { edit: (a) => setTarget({ key: a.key }), add: () => setTarget('new'), editor };
}
