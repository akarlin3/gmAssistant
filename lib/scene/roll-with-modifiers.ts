// Resolves the dice expression for a Scene Mode "What to Roll" suggestion when
// rolled against a specific PC: skill modifier if the suggestion names a known
// skill (ability mod + proficiency bonus when proficient), else the bare
// ability modifier.

import { abilityMod } from '@/lib/pc/derived';
import { skillModifier, SKILL_ABILITIES } from '@/lib/pc/skills';
import type { PlayerCharacter, SkillName } from '@/lib/pc/types';
import type { SuggestedRoll } from './types';

// The numeric modifier a PC brings to a suggested roll: skill modifier (ability
// mod + proficiency when proficient) if the suggestion names a known skill,
// else the bare ability modifier.
export function modifierForSuggestion(
  pc: PlayerCharacter,
  suggested: SuggestedRoll,
): number {
  if (suggested.skill && suggested.skill in SKILL_ABILITIES) {
    return skillModifier(pc, suggested.skill as SkillName);
  }
  return abilityMod(pc.abilities[suggested.ability]);
}

export function rollExprForSuggestion(
  pc: PlayerCharacter,
  suggested: SuggestedRoll,
): string {
  const mod = modifierForSuggestion(pc, suggested);
  return mod >= 0 ? `1d20+${mod}` : `1d20${mod}`;
}
