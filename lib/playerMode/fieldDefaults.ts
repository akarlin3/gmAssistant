// First-pass field-privacy defaults per entity type. These are the
// "pre-tagged defaults" the spec calls for; GMs override them per-campaign
// (campaign.data.player.fieldDefaults) and per-instance (fieldOverrides).
//
// Rule of thumb: surface roleplay-facing texture (name, appearance, archetype)
// and hide GM levers (goals, methods, secrets, internal knowledge). Any field
// not listed here resolves to 'private' (fail-closed) — see resolveVisibility.

import type { FieldPrivacyMap, FieldVisibilityDefaults, PlayerEntityType } from './types';

const CHARACTER_DEFAULTS: FieldPrivacyMap = {
  // Party-facing identity & roleplay
  name: 'public',
  player: 'public',
  race: 'public',
  classLevel: 'public',
  classLevel2: 'public',
  background: 'public',
  alignment: 'public',
  appearance: 'public',
  personality: 'public',
  ideals: 'public',
  bonds: 'public',
  flaws: 'public',
  // Combat stats the party generally sees
  abilities: 'public',
  saves: 'public',
  ac: 'public',
  hp: 'public',
  hpMax: 'public',
  initiative: 'public',
  speed: 'public',
  profBonus: 'public',
  hitDice: 'public',
  skills: 'public',
  passivePerception: 'public',
  languages: 'public',
  proficiencies: 'public',
  attacks: 'public',
  equipment: 'public',
  currency: 'public',
  features: 'public',
  spellcasting: 'public',
  spells: 'public',
  // Personal / private by default
  experience: 'private',
  backstory: 'private',
  notes: 'private',
};

// First-class PCs (data.pcs). Default reveal is intentionally minimal — name +
// level only — with party-relevant combat fields available to opt into.
const PC_DEFAULTS: FieldPrivacyMap = {
  name: 'public',
  level: 'public',
  hp: 'private',
  ac: 'private',
  conditions: 'private',
  exhaustion: 'private',
};

const NPC_DEFAULTS: FieldPrivacyMap = {
  name: 'public',
  faction: 'public',
  archetype: 'public',
  appearance: 'public',
  talent: 'public',
  mannerism: 'public',
  // GM levers
  type: 'private',
  goal: 'private',
  method: 'private',
  abilities: 'private',
  interactions: 'private',
  knowledge: 'private',
  ideal: 'private',
  bond: 'private',
  flaw: 'private',
};

const LOCATION_DEFAULTS: FieldPrivacyMap = {
  name: 'public',
  type: 'public',
  aspects: 'public',
  factions: 'public',
};

const FACTION_DEFAULTS: FieldPrivacyMap = {
  name: 'public',
  archetype: 'public',
  identity: 'public',
  area: 'public',
  // GM levers
  power: 'private',
  ideology: 'private',
  shortGoals: 'private',
  midGoals: 'private',
  longGoal: 'private',
  renown: 'private',
  rankLabels: 'private',
};

const CLOCK_DEFAULTS: FieldPrivacyMap = {
  text: 'public',
  faction: 'public',
  max: 'public',
  filled: 'public',
  // GM's private annotations on a clock
  notes: 'private',
};

// Frozen so callers can't accidentally mutate the shared constant.
export const DEFAULT_FIELD_VISIBILITY: Required<FieldVisibilityDefaults> = Object.freeze({
  characters: Object.freeze({ ...CHARACTER_DEFAULTS }),
  pcs: Object.freeze({ ...PC_DEFAULTS }),
  npcs: Object.freeze({ ...NPC_DEFAULTS }),
  locations: Object.freeze({ ...LOCATION_DEFAULTS }),
  factions: Object.freeze({ ...FACTION_DEFAULTS }),
  clocks: Object.freeze({ ...CLOCK_DEFAULTS }),
}) as Required<FieldVisibilityDefaults>;

// A fresh, deeply-cloned copy suitable for writing onto a campaign doc.
export function cloneDefaultFieldVisibility(): FieldVisibilityDefaults {
  const out: FieldVisibilityDefaults = {};
  for (const [type, map] of Object.entries(DEFAULT_FIELD_VISIBILITY)) {
    out[type as PlayerEntityType] = { ...map };
  }
  return out;
}
