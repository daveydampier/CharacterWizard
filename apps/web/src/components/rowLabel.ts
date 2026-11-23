import type { Ability } from '@cw/model';
import { costKind, type Sheet } from '@cw/rules';

/**
 * The name a row and its buttons are known by. It is the ability's name, with the kind of cost
 * added where another row on the sheet has the same name, listed or hidden: "Misty Step (pact
 * slot)" and "Misty Step (free cast)". Hiding one twin does not rename the other.
 */
export function rowLabel(ability: Ability, sheet: Sheet): string {
  const twin = [...sheet.abilities, ...sheet.universal, ...sheet.hidden].some((a) => a.name === ability.name && a.key !== ability.key);
  const kind = twin ? costKind(ability, sheet) : null;
  return kind === null ? ability.name : `${ability.name} (${kind})`;
}
