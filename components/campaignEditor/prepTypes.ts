// Shared type definitions extracted verbatim from CampaignEditor.tsx. These
// are pure data shapes used by the prep editor sub-components and the main
// CampaignEditor body — kept in one place so the heavy component file stays
// focused on orchestration.

export type EncounterMonster = { cr: string; count: number };
export type EncounterCalcState = { pcLevel: number; monsters: EncounterMonster[]; gestalt?: boolean };

export type DowntimeEntry = {
  id: string;
  type: string;
  fields: Record<string, string>;
  createdAt: string;
  archived?: boolean;
};

export type LookupKind = 'all' | 'npcs' | 'locations' | 'secrets' | 'factions' | 'items';
export type KnowledgeFilter = 'all' | 'known' | 'unknown';
