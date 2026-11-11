import type { CharacterClass } from '@cw/model';
import { abilityFromStatId, arr, num, obj, str, type Raw } from './raw';

export function convertClasses(d: Raw): CharacterClass[] {
  return arr(d.classes).map((c) => {
    const cd = obj(c?.definition);
    const sd = c?.subclassDefinition ? obj(c.subclassDefinition) : null;
    const level = num(c?.level) ?? 0;
    const featureNames = arr(c?.classFeatures)
      .map((f) => obj(f?.definition))
      .filter((f) => (num(f.requiredLevel) ?? 0) <= level)
      .map((f) => str(f.name));
    const isPactMagic = featureNames.includes('Pact Magic');
    const hasSpellcasting = isPactMagic || featureNames.includes('Spellcasting');
    const row = arr(arr(obj(cd.spellRules).levelSpellSlots)[level]).map((n) => num(n) ?? 0);
    return {
      name: str(cd.name),
      level,
      subclassName: sd ? str(sd.name) : null,
      spellcastingAbility:
        abilityFromStatId(cd.spellCastingAbilityId) ?? abilityFromStatId(sd?.spellCastingAbilityId),
      hasSpellcasting,
      isPactMagic,
      slots: hasSpellcasting ? row : [],
    };
  });
}
