import type { CampaignContext } from '@/lib/generators/types';
import type { Character } from '@/lib/character-schema';
import type { Get, SetVal, SectionKey } from '../types';

export type SessionSyncAnchor = {
  positionSec: number;
  anchorWallTimeMs: number;
  playlistIndex: number;
};

export type Props = {
  get: Get;
  setVal: SetVal;
  characters: Character[];
  onEndSession: () => void;
  onExitWithoutEnding: () => void;
  onOpenLibrary: () => void;
  campaignContext?: CampaignContext;
  campaignId?: string;
  campaignName?: string;
  // Music sync anchor: ephemeral, kept in CampaignEditor React state so the
  // ~15s update cadence doesn't append to the CRDT log every cycle. Players
  // still receive it through publishProjections.
  sessionPlaylistAnchor?: SessionSyncAnchor | null;
  setSessionPlaylistAnchor?: (next: SessionSyncAnchor | null) => void;
};

export type { SectionKey };
