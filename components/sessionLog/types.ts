import type { SessionLogEntry } from '@/lib/sessionLog';
import type { Character } from '@/lib/character-schema';

export type NPC = {
  id?: string;
  name?: string;
  type?: string;
  faction?: string;
  archetype?: string;
  goal?: string;
  method?: string;
  isPublic?: boolean;
};

export type LocationRow = {
  id?: string;
  name: string;
  type: string;
  aspects: [string, string, string];
  factions: string;
};

/**
 * Campaign-scoped reference data shared by the SessionLogTab and its
 * SessionCard children. Grouping these props keeps the wiring readable
 * without changing the public component contract.
 */
export type SessionLogCampaignData = {
  campaignId?: string;
  campaignSecrets: string[];
  campaignScenes: string[];
  npcs: NPC[];
  locations: LocationRow[];
  monsters: string[];
  items: unknown[];
  treasure: string[];
  characters: Character[];
  campaignStrongStart: string;
  onStrongStartChange?: (v: string) => void;
};

export type SessionLogTabProps = {
  entries: SessionLogEntry[];
  onChange: (entries: SessionLogEntry[]) => void;
  campaignId?: string;
  campaignSecrets?: string[];
  campaignScenes?: string[];
  npcs?: NPC[];
  locations?: LocationRow[];
  monsters?: string[];
  items?: unknown[];
  treasure?: string[];
  characters?: Character[];
  campaignStrongStart?: string;
  onStrongStartChange?: (v: string) => void;
};
