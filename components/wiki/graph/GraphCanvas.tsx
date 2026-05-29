'use client';

// Shared read-only React Flow canvas for the campaign node graph (CP2). Used by
// both the GM graph (WikiGraph) and the player graph (read-only projection).
// It does NOT fetch or write anything: it renders the GraphNode/GraphEdge model
// it is handed, runs a d3-force layout once per structural change, and reports
// node/edge clicks upward. Pan/zoom/select are interactive; node dragging is
// disabled so the settled layout can't drift.

import { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { computeLayout } from '@/lib/wiki/graphLayout';
import { ENTITY_COLORS } from '@/lib/wiki/colors';
import type { GraphNode, GraphEdge } from '@/lib/wiki/graphModel';
import { EntityNode } from './EntityNode';
import { RelationshipEdge, arrowMarker } from './RelationshipEdge';

const nodeTypes = { entity: EntityNode };
const edgeTypes = { relationship: RelationshipEdge };

export type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** nodeKey -> faction cluster id (or null). From buildClusters(). */
  clusters: Map<string, string | null>;
  selectedKey?: string | null;
  /** Spotlight set: when non-null, nodes/edges outside it are dimmed. */
  highlightKeys?: Set<string> | null;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge, screenPos: { x: number; y: number }) => void;
  emptyLabel?: string;
};

function GraphCanvasInner({
  nodes,
  edges,
  clusters,
  selectedKey,
  highlightKeys,
  onNodeClick,
  onEdgeClick,
  emptyLabel = 'Nothing to graph yet.',
}: GraphCanvasProps) {
  const { fitView } = useReactFlow();

  // Only edges whose endpoints are both present as nodes.
  const nodeKeys = useMemo(() => new Set(nodes.map((n) => n.key)), [nodes]);
  const presentEdges = useMemo(
    () => edges.filter((e) => nodeKeys.has(e.source) && nodeKeys.has(e.target) && e.source !== e.target),
    [edges, nodeKeys],
  );

  // Structural keys: layout only recomputes when the node/edge set or clustering
  // changes — not when selection/spotlight changes.
  const nodesSig = useMemo(() => nodes.map((n) => n.key).sort().join(','), [nodes]);
  const edgesSig = useMemo(
    () => presentEdges.map((e) => `${e.source}>${e.target}:${e.weight.toFixed(2)}`).sort().join(','),
    [presentEdges],
  );
  const clusterSig = useMemo(
    () => [...clusters.entries()].map(([k, v]) => `${k}=${v ?? ''}`).sort().join(','),
    [clusters],
  );

  const positions = useMemo(
    () =>
      computeLayout(
        nodes.map((n) => ({ id: n.key, cluster: clusters.get(n.key) ?? null })),
        presentEdges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodesSig, edgesSig, clusterSig],
  );

  const rfNodes = useMemo<Node[]>(
    () =>
      nodes.map((n) => {
        const dimmed = !!highlightKeys && !highlightKeys.has(n.key);
        return {
          id: n.key,
          type: 'entity',
          position: positions[n.key] ?? { x: 0, y: 0 },
          data: { type: n.type, name: n.name, selected: n.key === selectedKey, dimmed },
          draggable: false,
          selectable: true,
        };
      }),
    [nodes, positions, selectedKey, highlightKeys],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      presentEdges.map((e) => {
        const dimmed = !!highlightKeys && (!highlightKeys.has(e.source) || !highlightKeys.has(e.target));
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'relationship',
          data: { kind: e.kind, weight: e.weight, directed: e.directed, dimmed },
          markerEnd: e.directed ? arrowMarker(e.kind) : undefined,
        };
      }),
    [presentEdges, highlightKeys],
  );

  // Re-fit when the structure changes (new layout).
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [nodesSig, fitView]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-rule bg-parchment-soft text-center font-serif text-sm italic text-ink-mute">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-[60vh] overflow-hidden rounded-lg border border-rule bg-parchment-soft shadow-card">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const n = nodes.find((x) => x.key === node.id);
          if (n) onNodeClick?.(n);
        }}
        onEdgeClick={(evt, edge) => {
          const e = presentEdges.find((x) => x.id === edge.id);
          if (e) onEdgeClick?.(e, { x: evt.clientX, y: evt.clientY });
        }}
      >
        <Background color="#d8cbb0" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => ENTITY_COLORS[(n.data as { type?: keyof typeof ENTITY_COLORS })?.type ?? 'scene'] ?? '#52443a'}
          maskColor="rgba(90,76,58,0.15)"
        />
      </ReactFlow>
    </div>
  );
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
