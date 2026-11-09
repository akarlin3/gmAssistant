// Shared types for the player-side campaign view, extracted from
// PlayerCampaignView.tsx. These describe the redacted, projection-derived
// shapes the player UI renders — they do NOT change the projection pipeline in
// lib/playerMode (which this module only consumes).

import type { SlotProjection } from '@/lib/playerMode/types';
import type { ChangeEvent } from '@/lib/sessionEvents';

// A projected, redacted entity record (characters, npcs, locations, factions,
// clocks). Always carries `id`; every other field is GM-controlled content.
export type EntityRecord = Record<string, unknown>;

// The editable list fields a player may add/remove/edit on their own PC sheet.
export type PcListField = 'goals' | 'bonds' | 'ideals' | 'flaws';

// Ownership marker on a projected PC, used to split "my" sheets from the party.
export type PcOwnership = {
  ownerType?: string;
  playerSlotId?: string;
};

import type {
  CoinPurse,
  InventoryItem,
  PactMagicSlots,
  PcFeature,
  PcResourcePool,
  PlayerJournalEntry,
  PlayerLoreAnnotation,
  PlayerQuest,
  SpellSlotGroup,
} from '@/lib/pc/types';

// A projected player-character sheet. Modeled loosely (most fields optional and
// best-effort typed) because the projection emits a redacted subset and the UI
// reads many fields defensively with fallbacks.
export type PlayerPc = {
  id: string;
  name?: string;
  race?: string;
  level?: number;
  ac?: number;
  speed?: number;
  initiativeMod?: number;
  inspiration?: boolean;
  notes?: string;
  exhaustion?: number;
  conditions?: string[];
  proficiencyBonus?: number;
  ownership?: PcOwnership;
  hp?: { current?: number; max?: number; temp?: number };
  hitDice?: { dieSize?: 4 | 6 | 8 | 10 | 12; max?: number; used?: number };
  deathSaves?: { successes?: number; failures?: number };
  abilities?: Record<string, number>;
  proficiencies?: { savingThrows?: string[]; skills?: string[] };
  classes?: Array<{ name?: string; level?: number }>;
  spellSlots?: SpellSlotGroup[];
  pactSlots?: PactMagicSlots | null;
  resourcePools?: PcResourcePool[];
  features?: PcFeature[];
  inventory?: InventoryItem[];
  attunedCount?: number;
  currency?: CoinPurse;
  partyLoot?: string;
  goals?: string[];
  bonds?: string[];
  ideals?: string[];
  flaws?: string[];
  sharedQuests?: PlayerQuest[];
  sharedAnnotations?: PlayerLoreAnnotation[];
  sharedJournal?: PlayerJournalEntry[];
  [field: string]: unknown;
};

// A session recap entry rendered in the "Sessions" tab. Optional fields mirror
// the prop the parent passes through verbatim.
export type SessionRecap = {
  id: string;
  title: string;
  date: string;
  body: string;
  events?: ChangeEvent[];
  xpAwarded?: number;
  strongStart?: string;
  secretsRevealed?: string[];
  scenesUsed?: string[];
  goalUpdates?: Array<{ goal: string; from: string; to: string }>;
};

export type PlayerCampaignViewProps = {
  token: string;
  slotId: string;
  campaignId: string;
  displayName: string;
  campaignName: string;
  onSwitch: () => void;
  playlistUrl?: string;
  sessionRecaps?: SessionRecap[];
  unredactedCharacters?: EntityRecord[];
};

// A rendered navigation tab.
export type PlayerTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

// Convenience: the union of projected entity-list keys on a SlotProjection.
export type ProjectionEntityKey = keyof SlotProjection['entities'];
