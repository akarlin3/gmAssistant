'use client';

// Shares the campaign-wide relationship graph with the entity cards scattered
// across the editor without threading half a dozen props through every call
// site. CampaignEditor renders <WikiProvider> around its content; cards render
// <RelationshipsSection> which reads everything it needs from here. Outside a
// provider (e.g. the read-only player view) the context is `null` and
// RelationshipsSection renders nothing.

import { createContext, useContext } from 'react';
import type { EntityIndex, WikiEntity } from '@/lib/wiki/entities';
import type { EntityType, Relationship, RelationshipKind } from '@/lib/wiki/types';

export type WikiContextValue = {
  index: EntityIndex;
  relationships: Relationship[];
  addRelationship: (
    from: { type: EntityType; id: string },
    to: { type: EntityType; id: string },
    kind: RelationshipKind,
    notes?: string,
  ) => void;
  removeRelationship: (id: string) => void;
  /** Patch editable fields of one edge (kind/weight/visibility/notes…). */
  updateRelationship?: (id: string, patch: Partial<Omit<Relationship, 'id' | 'createdAt'>>) => void;
  acceptSuggestion: (id: string) => void;
  rejectSuggestion: (id: string) => void;
  /** Merge derivation proposals into the review queue. Returns count added. */
  proposeRelationships?: (proposals: Relationship[]) => number;
  /** Persisted graph node positions (entityKey -> {x,y}); GM-only. */
  graphPositions?: Record<string, { x: number; y: number }>;
  /** Persist dragged graph node positions. */
  setGraphPositions?: (positions: Record<string, { x: number; y: number }>) => void;
  /** Optional jump-to-entity (e.g. select it in the graph side panel). */
  navigateToEntity?: (type: EntityType, id: string) => void;
  resolve: (type: EntityType, id: string) => WikiEntity | undefined;
  /** Scan session recaps / scratchpad / scene transcripts for new suggestions. Returns how many were added. */
  rescan?: () => number;
};

const WikiContext = createContext<WikiContextValue | null>(null);

export function WikiProvider({
  value,
  children,
}: {
  value: WikiContextValue;
  children: React.ReactNode;
}) {
  return <WikiContext.Provider value={value}>{children}</WikiContext.Provider>;
}

export function useWiki(): WikiContextValue | null {
  return useContext(WikiContext);
}
