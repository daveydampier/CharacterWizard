import { readFileSync } from 'node:fs';
import { convertCharacter } from '@cw/ddb-import';
import { ABILITIES, SKILLS } from '@cw/model';
import { buildSheet } from '@cw/rules';
import type { Ability } from '@cw/model';

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

function rollLine(a: Ability): string {
  const dmg = (parts: { dice: string; type: string | null }[]): string =>
    parts.map((p) => `${p.dice}${p.type ? ` ${p.type.toLowerCase()}` : ''}`).join(' + ');
  switch (a.roll.kind) {
    case 'attack':
      return `Roll d20 ${signed(a.roll.bonus)}.${a.roll.damage.length ? ` Hit: ${dmg(a.roll.damage)}.` : ''}`;
    case 'save':
      return `They roll a ${a.roll.ability.toUpperCase()} save against ${a.roll.dc}.${a.roll.damage.length ? ` Fail: ${dmg(a.roll.damage)}.` : ''}`;
    case 'check':
      return `Roll d20 ${signed(a.roll.bonus)}.`;
    default:
      return '';
  }
}

const path = process.argv[2];
if (!path) {
  console.error('Usage: pnpm sheet <path to character JSON>');
  process.exit(1);
}

const sheet = buildSheet(convertCharacter(JSON.parse(readFileSync(path, 'utf8'))));

console.log(`${sheet.name}, level ${sheet.level}`);
console.log(`Proficiency ${signed(sheet.proficiencyBonus)}  AC ${sheet.armorClass}  Initiative ${signed(sheet.initiative)}  Attacks per action ${sheet.attacksPerAction}`);
console.log(`Scores  ${ABILITIES.map((a) => `${a.toUpperCase()} ${sheet.scores[a]}`).join('  ')}`);
console.log(`Saves   ${ABILITIES.map((a) => `${a.toUpperCase()} ${signed(sheet.saves[a])}`).join('  ')}`);
if (sheet.spellcasting) {
  console.log(`Spells  attack ${signed(sheet.spellcasting.attack)}  save DC ${sheet.spellcasting.saveDc}`);
}
const slotText = Object.entries(sheet.slots).map(([level, count]) => `L${level} x${count}`);
if (sheet.pactSlots) slotText.push(`Pact L${sheet.pactSlots.level} x${sheet.pactSlots.count}`);
if (slotText.length) console.log(`Slots   ${slotText.join('  ')}`);
console.log(`Skills  ${SKILLS.map((s) => `${s} ${signed(sheet.skills[s])}`).join(', ')}`);

for (const timing of ['action', 'bonus', 'reaction', 'free', 'long', 'unknown'] as const) {
  const group = sheet.abilities.filter((a) => a.timing === timing);
  if (group.length === 0) continue;
  console.log(`\n[${timing}]`);
  for (const a of group) console.log(`  ${a.name}${rollLine(a) ? `: ${rollLine(a)}` : ''}`);
}

if (sheet.resources.length) {
  console.log('\n[resources]');
  for (const r of sheet.resources) console.log(`  ${r.name}: ${r.max} (${r.reset})`);
}
