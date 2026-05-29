'use client';

// Floating, center-to-center relationship edge. React Flow's built-in edges
// anchor to handle positions; for a relationship web we want lines between node
// centers regardless of orientation, so we read the live node geometry via
// useInternalNode and draw a straight path. Color encodes relationship kind,
// thickness encodes effective weight, and an arrowhead marks directed kinds.

import { memo } from 'react';
import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  MarkerType,
  type EdgeProps,
} from '@xyflow/react';
import { edgeColor } from '@/lib/wiki/colors';
import type { RelationshipKind } from '@/lib/wiki/types';

export type RelationshipEdgeData = {
  kind: RelationshipKind;
  weight: number;
  directed: boolean;
  dimmed: boolean;
};

function center(node: ReturnType<typeof useInternalNode>): { x: number; y: number } | null {
  if (!node) return null;
  const { x, y } = node.internals.positionAbsolute;
  return {
    x: x + (node.measured.width ?? 20) / 2,
    y: y + (node.measured.height ?? 20) / 2,
  };
}

function RelationshipEdgeImpl({ id, source, target, data, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const s = center(sourceNode);
  const t = center(targetNode);
  if (!s || !t) return null;

  const d = data as unknown as RelationshipEdgeData;
  const color = edgeColor(d.kind);
  const width = 1 + Math.min(1, Math.max(0, d.weight)) * 5; // 1..6px

  const [path] = getStraightPath({ sourceX: s.x, sourceY: s.y, targetX: t.x, targetY: t.y });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={d.directed ? markerEnd : undefined}
      style={{
        stroke: color,
        strokeWidth: width,
        opacity: d.dimmed ? 0.08 : 0.7,
      }}
    />
  );
}

export const RelationshipEdge = memo(RelationshipEdgeImpl);

/** Per-edge arrow marker descriptor for directed kinds. */
export function arrowMarker(kind: RelationshipKind) {
  return { type: MarkerType.ArrowClosed, color: edgeColor(kind), width: 16, height: 16 };
}
