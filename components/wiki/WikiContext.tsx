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
import type { EdgeInit, EdgePatch } from '@/lib/wiki/relationships';

export type WikiContextValue = {
  index: EntityIndex;
  relationships: Relationship[];
  addRelationship: (
    from: { type: EntityType; id: string },
    to: { type: EntityType; id: string },
    kind: RelationshipKind,
    notes?: string,
  ) => void;
  /** Create a graph edge with explicit weight/visibility (drag-to-connect, CP5). */
  createEdge: (
    from: { type: EntityType; id: string },
    to: { type: EntityType; id: string },
    kind: RelationshipKind,
    init?: EdgeInit,
  ) => void;
  /** Edit an existing edge's kind/weight/visibility in place (edge editor, CP5). */
  updateRelationship: (id: string, patch: EdgePatch) => void;
  removeRelationship: (id: string) => void;
  /** Patch a canonical entity record by id (e.g. mark an NPC dead) — same write
   * path as the sidebar editor, so the reactive world-event observer can pick it
   * up and enqueue a propagation proposal (CP5). */
  updateEntityState: (type: EntityType, id: string, patch: Record<string, unknown>) => void;
  /** Read the raw canonical entity record by id (for state editors that need
   * fields beyond the index's name/body, e.g. an NPC's `dead` flag). */
  getEntityState: (type: EntityType, id: string) => Record<string, unknown> | undefined;
  acceptSuggestion: (id: string) => void;
  rejectSuggestion: (id: string) => void;
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
