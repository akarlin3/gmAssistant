// SRD 5.1 skill catalog and the skill/save modifier resolvers. Modifiers are
// always derived (never stored) so they auto-update the moment an ability
// score or proficiency changes.

import { abilityMod } from './derived';
import type { AbilityName, PlayerCharacter, SkillName } from './types';

export const SKILL_ABILITIES: Record<SkillName, AbilityName> = {
  'Acrobatics': 'DEX',
  'Animal Handling': 'WIS',
  'Arcana': 'INT',
  'Athletics': 'STR',
  'Deception': 'CHA',
  'History': 'INT',
  'Insight': 'WIS',
  'Intimidation': 'CHA',
  'Investigation': 'INT',
  'Medicine': 'WIS',
  'Nature': 'INT',
  'Perception': 'WIS',
  'Performance': 'CHA',
  'Persuasion': 'CHA',
  'Religion': 'INT',
  'Sleight of Hand': 'DEX',
  'Stealth': 'DEX',
  'Survival': 'WIS',
};

export const SKILL_NAMES: readonly SkillName[] = Object.keys(
  SKILL_ABILITIES,
) as SkillName[];

export function skillModifier(pc: PlayerCharacter, skill: SkillName): number {
  const ability = SKILL_ABILITIES[skill];
  const base = abilityMod(pc.abilities[ability]);
  const prof = pc.proficiencies.skills.includes(skill) ? pc.proficiencyBonus : 0;
  return base + prof;
}

export function savingThrowModifier(
  pc: PlayerCharacter,
  ability: AbilityName,
): number {
  const base = abilityMod(pc.abilities[ability]);
  const prof = pc.proficiencies.savingThrows.includes(ability)
    ? pc.proficiencyBonus
    : 0;
  return base + prof;
}

export function passivePerception(pc: PlayerCharacter): number {
  return 10 + skillModifier(pc, 'Perception');
}
