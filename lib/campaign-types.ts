/**
 * TypeScript interfaces for Campaign.data sub-objects.
 *
 * Campaign.data is a large Record<string, any>. The interfaces here provide
 * typed access to the most common sub-structures without breaking existing
 * code that treats it as a plain record.
 */

export interface NpcEntity {
  id: string;
  name: string;
  description?: string;
  role?: string;
  status?: string;
  notes?: string;
  relationship?: string;
}

export interface LocationEntity {
  id: string;
  name: string;
  description?: string;
  type?: string;
  connections?: string[];
  notes?: string;
}

export interface MonsterEntry {
  id: string;
  name: string;
  cr?: string;
  hp?: string;
  ac?: string;
  notes?: string;
}

export interface FactionEntry {
  id: string;
  name: string;
  attitude?: string;
  description?: string;
  notes?: string;
}

export interface SessionLogEntry {
  id: string;
  title?: string;
  summary?: string;
  date?: string;
  linkedNpcs?: string[];
  linkedLocations?: string[];
}

export interface PlayerCharacter {
  id: string;
  name: string;
  player?: string;
  race?: string;
  class?: string;
  level?: number;
  notes?: string;
}

/**
 * Typed view of a campaign's `data` field.
 * All fields are optional — older campaigns may not have every sub-structure.
 */
export interface CampaignData {
  npcs?: NpcEntity[];
  locations?: LocationEntity[];
  monsters?: MonsterEntry[];
  factions?: FactionEntry[];
  sessionLog?: SessionLogEntry[];
  players?: PlayerCharacter[];
  [key: string]: unknown;
}

/**
 * Casts a raw `data` record to `CampaignData` without runtime transformation.
 * Useful for getting typed access to campaign data without a deep clone.
 */
export function typedCampaignData(data: Record<string, any>): CampaignData {
  return data as CampaignData;
}
