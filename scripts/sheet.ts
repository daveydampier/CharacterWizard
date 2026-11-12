import { readFileSync } from 'node:fs';
import { convertCharacter } from '@cw/ddb-import';
import { ABILITIES, SKILLS } from '@cw/model';
import { buildSheet, rollLine } from '@cw/rules';

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

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
  for (const a of group) {
    const line = rollLine(a.roll);
    console.log(`  ${a.name}${line ? `: ${line}` : ''}`);
  }
}

if (sheet.resources.length) {
  console.log('\n[resources]');
  for (const r of sheet.resources) console.log(`  ${r.name}: ${r.max} (${r.reset})`);
}
