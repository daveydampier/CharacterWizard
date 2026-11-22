import type { Ability } from '@cw/model';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { AbilityEditor } from './AbilityEditor';

/**
 * What a view needs to make Edit work: `edit` opens the editor for an ability, and `editor` is
 * that dialog, to render once in the view. The ability is remembered by key, so the editor closes
 * by itself if the ability leaves the sheet while it is open.
 */
export function useAbilityEdit(): { edit: (ability: Ability) => void; editor: ReactNode } {
  const sheet = useStore((s) => s.sheet);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const editing = sheet && editingKey !== null
    ? [...sheet.abilities, ...sheet.universal].find((a) => a.key === editingKey)
    : undefined;

  // Forget an ability that has left the sheet, so its editor does not come back if the ability does.
  useEffect(() => {
    if (editingKey !== null && !editing) setEditingKey(null);
  }, [editingKey, editing]);

  return {
    edit: (ability) => setEditingKey(ability.key),
    // Keyed, so that opening the editor for another ability starts a new form.
    editor: editing ? <AbilityEditor key={editing.key} ability={editing} onClose={() => setEditingKey(null)} /> : null,
  };
}
