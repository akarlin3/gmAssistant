'use client';

// Read-only player relationship graph (CP2). Renders the same React Flow canvas
// as the GM graph, but built strictly from the redacted SlotProjection
// (buildPlayerGraph). There is no sidebar editor and no edge popover here:
// players only see the connections their GM chose to share, and private edges /
// hidden entities have already been removed by the projection pipeline upstream.

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { buildClusters } from '@/lib/wiki/graphModel';
import { buildPlayerGraph } from '@/lib/playerMode/graphProjection';
import type { SlotProjection } from '@/lib/playerMode/types';

// Lazy-load the React Flow canvas (heavy) only when the player opens this tab.
const GraphCanvas = dynamic(() => import('@/components/wiki/graph/GraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center rounded-lg border border-rule bg-parchment-soft font-serif text-sm italic text-ink-mute">
      Loading graph…
    </div>
  ),
});

export default function ConnectionsTab({ projection }: { projection: SlotProjection }) {
  const { nodes, edges } = useMemo(() => buildPlayerGraph(projection), [projection]);
  const clusters = useMemo(() => buildClusters(nodes, edges), [nodes, edges]);

  return (
    <div className="space-y-2">
      <p className="font-serif text-xs italic text-ink-mute">
        How the people, places, and factions you know connect. Pan, zoom, and click a node to focus.
      </p>
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        clusters={clusters}
        emptyLabel="Your GM hasn’t shared any connections yet."
      />
    </div>
  );
}
