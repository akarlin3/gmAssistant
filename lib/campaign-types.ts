/**
 * TypeScript interfaces for Campaign.data sub-objects.
 *
 * Campaign.data is a large Record<string, any>. The interfaces here provide
 * typed access to the most common sub-structures without breaking existing
 * code that treats it as a plain record.
 */

export type PrintStatus = 'queued' | 'sliced' | 'printed';

export interface NpcEntity {
  id: string;
  name: string;
  description?: string;
  role?: string;
  status?: string;
  notes?: string;
  relationship?: string;
  player_visible?: boolean;
  isPublic?: boolean;
  gmSpoiler?: string;
  stl_link?: string;
  print_status?: PrintStatus;
  is_boss?: boolean;
}

export interface LocationEntity {
  id: string;
  name: string;
  description?: string;
  type?: string;
  connections?: string[];
  notes?: string;
  aspects?: string[];
  lighting?: string;
  terrainTags?: string[];
  player_visible?: boolean;
  isPublic?: boolean;
  gmSpoiler?: string;
  stl_link?: string;
  print_status?: PrintStatus;
}

export interface MonsterEntry {
  id: string;
  name: string;
  cr?: string;
  hp?: string;
  ac?: string;
  notes?: string;
  player_visible?: boolean;
  stl_link?: string;
  print_status?: PrintStatus;
  is_boss?: boolean;
}

export interface FactionEntry {
  id: string;
  name: string;
  attitude?: string;
  description?: string;
  notes?: string;
  heat?: number;
  renown?: number;
  player_visible?: boolean;
  isPublic?: boolean;
  gmSpoiler?: string;
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
  id?: string;
  name: string;
  player?: string;
  race?: string;
  class?: string;
  level?: number | string;
  notes?: string;
  hpMax?: number | string;
  maxHp?: number | string;
  ac?: number | string;
  isSidekick?: boolean;
  type?: string;
  [key: string]: any;
}

export type Character = PlayerCharacter;

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
  mode?: 'solo' | 'duet' | 'standard' | 'player';
  modeMigratedAt?: number;
  legacySoloMode?: boolean;
  [key: string]: unknown;
}

/**
 * Casts a raw `data` record to `CampaignData` without runtime transformation.
 * Useful for getting typed access to campaign data without a deep clone.
 */
export function typedCampaignData(data: Record<string, any>): CampaignData {
  return data as CampaignData;
}
