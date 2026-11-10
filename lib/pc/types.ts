// First-class Player Character (PC) sheet types. PCs live in the campaign blob
// at `data.pcs` (array, capped at PC_CAP). They are distinct from the legacy
// freeform `data.characters` notes — a PC is a structured, mechanically-aware
// entity that Scene Mode, Session Mode, the character parser, and Player Mode
// all read from.

export type AbilityName = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export const ABILITY_NAMES: readonly AbilityName[] = [
  'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA',
];

export type SkillName =
  | 'Acrobatics' | 'Animal Handling' | 'Arcana' | 'Athletics' | 'Deception'
  | 'History' | 'Insight' | 'Intimidation' | 'Investigation' | 'Medicine'
  | 'Nature' | 'Perception' | 'Performance' | 'Persuasion' | 'Religion'
  | 'Sleight of Hand' | 'Stealth' | 'Survival';

export type SrdCondition = string;

export type SpellSlotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const SPELL_SLOT_LEVELS: readonly SpellSlotLevel[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

export type SpellSlot = { max: number; used: number };
export type SpellSlotGroup = { level: number; max: number; used: number };

export type PcClass = { name: string; level: number; subclass?: string };

export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  weight?: number;
  description?: string;
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
  sharedWithGm?: boolean;
};

export type RechargeTiming = 'short' | 'long' | 'dawn' | 'manual';

export type PcResourcePool = {
  id: string;
  name: string;
  current: number;
  max: number;
  rechargeOn: RechargeTiming;
};

export type PactMagicSlots = {
  level: SpellSlotLevel;
  slotLevel?: SpellSlotLevel;
  max: number;
  used: number;
};

export type SpellSlotGroupItem = {
  level: number;
  max: number;
  used: number;
};

export type SpellSlotsRecord = Partial<Record<SpellSlotLevel, SpellSlot>> & {
  some?: (predicate: (slot: SpellSlotGroupItem) => boolean) => boolean;
  find?: (predicate: (slot: SpellSlotGroupItem) => boolean) => SpellSlotGroupItem | undefined;
  map?: <T>(fn: (slot: SpellSlotGroupItem) => T) => T[];
  filter?: (predicate: (slot: SpellSlotGroupItem) => boolean) => SpellSlotGroupItem[];
  forEach?: (fn: (slot: SpellSlotGroupItem) => void) => void;
};

export type CoinPurse = {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
};

export type PlayerQuestStatus = 'active' | 'completed' | 'failed';
export type PlayerQuestCategory = 'quest' | 'goal' | 'rumor' | 'mystery';

export type PlayerQuest = {
  id: string;
  title: string;
  status: PlayerQuestStatus;
  notes: string;
  linkedEntityIds: string[];
  sharedWithGm: boolean;
  category?: PlayerQuestCategory;
  updatedAt?: number;
};

export type AttitudeTag = 'friendly' | 'neutral' | 'suspicious' | 'hostile';
export type LoreAttitudeTag = AttitudeTag;

export type PlayerLoreAnnotation = {
  id: string;
  entityId: string;
  entityType?: string;
  entityName?: string;
  attitudeTag?: AttitudeTag;
  privateNotes: string;
  sharedNotes?: string;
  sharedWithGm: boolean;
  updatedAt?: number;
};

export type PlayerJournalEntry = {
  id: string;
  sessionNumber: number;
  date: string;
  title: string;
  content: string;
  linkedEntityIds?: string[];
  sharedWithGm: boolean;
  updatedAt?: number;
};

export type PlayerWritebackTombstone = {
  id: string;
  kind: 'quest' | 'annotation' | 'journal';
  removedAtMs: number;
};

export type TurnActionEconomy = {
  action?: boolean;
  bonusAction?: boolean;
  movement?: boolean;
  reaction?: boolean;
  freeInteraction?: boolean;
  actionUsed?: boolean;
  bonusActionUsed?: boolean;
  movementUsed?: boolean;
  reactionUsed?: boolean;
  freeInteractionUsed?: boolean;
};

export type Attack = {
  id: string;
  name: string;
  attackBonus: number;
  damageExpr: string; // "1d8+3"
  damageType: string; // "slashing"
  range: string; // "5 ft." or "150/600 ft."
  notes?: string;
};

export type RefreshKind = 'short' | 'long';

export type FeatureEntry = {
  id: string;
  name: string;
  source: string; // "Fighter 3", "Background", "Race"
  description: string;
  uses?: { max: number; used: number; refresh: RefreshKind };
};

export type PcFeature = FeatureEntry;

export type PcProficiencies = {
  savingThrows: AbilityName[];
  skills: SkillName[];
  languages: string[];
  tools: string[];
  armor: string[];
  weapons: string[];
};

export type DeathSaveCount = 0 | 1 | 2 | 3;
export type ExhaustionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlayerCharacter = {
  id: string;
  name: string;
  player?: string;
  level: number; // 1-20
  classes: PcClass[];
  race: string;
  background: string;
  alignment?: string;

  abilities: Record<AbilityName, number>;
  proficiencies: PcProficiencies;
  proficiencyBonus: number; // auto-computed but stored for override

  hp: { current: number; max: number; temp: number };
  hitDice: { dieSize: number; max: number; used: number };
  ac: number;
  initiativeMod: number; // defaults to DEX mod; overridable
  speed: number;
  inspiration?: boolean;

  conditions: SrdCondition[];
  exhaustion: ExhaustionLevel;
  deathSaves: { successes: DeathSaveCount; failures: DeathSaveCount };

  spellSlots?: SpellSlotsRecord;
  pactSlots?: PactMagicSlots | null;
  spellsKnown?: string[];
  spellcastingAbility?: AbilityName;
  resourcePools?: PcResourcePool[];

  inventory: InventoryItem[];
  attunedCount?: number; // 0-3
  currency?: CoinPurse;
  partyLoot?: string;
  attacks: Attack[];
  features: FeatureEntry[];

  notes: string;
  goals: string[];
  bonds: string[];
  ideals: string[];
  flaws: string[];

  sharedQuests?: PlayerQuest[];
  sharedAnnotations?: PlayerLoreAnnotation[];
  sharedJournal?: PlayerJournalEntry[];
  quests?: PlayerQuest[];
  journalEntries?: PlayerJournalEntry[];

  turnEconomy?: TurnActionEconomy;
  concentrationSpell?: string;
  downtimeDays?: number;
  renown?: number | Record<string, number>;
  updatedAt?: number;

  skillExpertise?: SkillName[];
  resistances?: string[];
  immunities?: string[];
  senses?: string[];
  backstory?: string;
  privateNotes?: string;
  gmNotes?: string;
  gmSecrets?: string | string[];
  evaluation?: PcEvaluation;

  // Optional flat aliases populated by normalizePc / evaluateCharacterSheet
  currentHp?: number;
  maxHp?: number;
  tempHp?: number;
  passivePerception?: number;
  passiveInvestigation?: number;
  passiveInsight?: number;
  spellSaveDc?: number | null;
  spellAttackBonus?: number | null;
  carryingCapacity?: number;

  // VTT Map & Whisper Writeback state
  tokenPosition?: PlayerTokenPosition;
  mapPing?: PlayerMapPingPayload;
  playerWhispers?: PlayerWhisperMessage[];

  ownership?: PcOwnership;
};

export type PlayerTokenPosition = {
  mapId?: string;
  x: number;
  y: number;
  updatedAt?: number;
};

export type PlayerMapPingPayload = {
  mapId?: string;
  pcId: string;
  x: number;
  y: number;
  color: string;
  timestamp: number;
};

export type PlayerWhisperMessage = {
  id: string;
  text: string;
  entityId?: string;
  entityName?: string;
  timestamp: number;
};

export type TablePauseSignal = {
  type: 'table_pause_requested';
  timestamp: number;
};

export type PartyRole = 'Frontline' | 'Striker' | 'Controller' | 'Support' | 'Utility' | 'Face';

export type PcDefensiveProfile = {
  acSummary: string;
  strongestSaves: string[];
  weakestSaves: string[];
  resistances: string[];
  immunities: string[];
  specialSenses: string[];
};

export type PcAuditNote = {
  id: string;
  severity: 'info' | 'warning';
  category: 'attunement' | 'math' | 'concentration' | 'resources' | 'proficiency';
  message: string;
};

export type PcDerivedStats = {
  abilityModifiers: Record<AbilityName, number>;
  proficiencyBonus: number;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  initiativeBonus: number;
  carryingCapacity: number;
};

export type PcEvaluation = {
  partyRoles: PartyRole[];
  defensiveProfile: PcDefensiveProfile;
  auditNotes: PcAuditNote[];
  derivedStats: PcDerivedStats;
  evaluatedAt?: number;
};

export type PcOwnership = {
  ownerType: 'dm' | 'player';
  playerSlotId?: string;
};

export const PC_CAP = 6;


