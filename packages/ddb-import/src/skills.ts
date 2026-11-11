import type { ProficiencyLevel, SkillCustom, SkillName } from '@cw/model';
import { abilityFromStatId, arr, own, type Raw } from './raw';

/** characterValues rows whose valueTypeId is this are per-skill customisations. */
const SKILL_ENTITY_TYPE = '1958004211';
const PROFICIENCY_LEVEL_TYPE = 26;
const ABILITY_OVERRIDE_TYPE = 27;

const SKILL_IDS: Record<string, SkillName> = {
  '2': 'athletics', '3': 'acrobatics', '4': 'sleight-of-hand', '5': 'stealth',
  '6': 'arcana', '7': 'history', '8': 'investigation', '9': 'nature', '10': 'religion',
  '11': 'animal-handling', '12': 'insight', '13': 'medicine', '14': 'perception',
  '15': 'survival', '16': 'deception', '17': 'intimidation', '18': 'performance',
  '19': 'persuasion',
};

/** Only 4 (expertise) is confirmed by fixtures; 1 to 3 follow the same ordering. */
const PROFICIENCY_LEVELS: Record<number, ProficiencyLevel> = {
  1: 'none', 2: 'half', 3: 'proficient', 4: 'expertise',
};

export function convertSkillCustom(d: Raw): Partial<Record<SkillName, SkillCustom>> {
  const out: Partial<Record<SkillName, SkillCustom>> = {};
  for (const v of arr(d.characterValues)) {
    if (String(v?.valueTypeId) !== SKILL_ENTITY_TYPE) continue;
    const skill = own(SKILL_IDS, v?.valueId);
    if (!skill) continue;
    const entry = (out[skill] ??= {});
    if (v.typeId === PROFICIENCY_LEVEL_TYPE) {
      const level = own(PROFICIENCY_LEVELS, v.value);
      if (level) entry.proficiency = level;
    } else if (v.typeId === ABILITY_OVERRIDE_TYPE) {
      const ability = abilityFromStatId(v.value);
      if (ability) entry.ability = ability;
    }
  }
  return out;
}
