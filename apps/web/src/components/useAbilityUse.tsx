import type { Ability } from '@cw/model';
import { availability, type ViewMode } from '@cw/rules';
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { SlotSheet } from './SlotSheet';

/**
 * What a view needs to make Use work: `request` uses the ability, first asking which slot pays
 * when more than one could, and `slotSheet` is that question, to render once in the view.
 */
export function useAbilityUse(mode: ViewMode): { request: (ability: Ability) => void; slotSheet: ReactNode } {
  const sheet = useStore((s) => s.sheet);
  const play = useStore((s) => s.play);
  const use = useStore((s) => s.use);
  const [pending, setPending] = useState<Ability | null>(null);

  function request(ability: Ability): void {
    if (!sheet) return;
    const a = availability(ability, sheet, play, mode);
    if (!a.canUse) return;
    if (a.slotOptions.length > 1) setPending(ability);
    else use(ability, mode);
  }

  const slotSheet = pending && sheet ? (
    <SlotSheet
      ability={pending}
      options={availability(pending, sheet, play, mode).slotOptions}
      onPick={(slotKey) => {
        use(pending, mode, slotKey);
        setPending(null);
      }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { request, slotSheet };
}
