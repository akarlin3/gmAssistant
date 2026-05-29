'use client';

// Custom React Flow node, keyed by entity type. Color encodes the entity type
// (ENTITY_COLORS); a selection ring and spotlight dimming are driven by data
// flags set in GraphCanvas. Hidden center handles let edges attach at the node
// center (the floating edge computes the real path).

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ENTITY_COLORS, ENTITY_LABELS } from '@/lib/wiki/colors';
import type { EntityType } from '@/lib/wiki/types';

export type EntityNodeData = {
  type: EntityType;
  name: string;
  selected: boolean;
  dimmed: boolean;
  /** GM editable graph (CP5): expose grabbable connect handles for drag-to-connect. */
  editable?: boolean;
};

function EntityNodeImpl({ data }: NodeProps) {
  const d = data as unknown as EntityNodeData;
  const fill = ENTITY_COLORS[d.type] ?? '#52443a';
  const r = d.selected ? 11 : 8;
  const size = r * 2;
  // In the editable GM graph the handles must be grabbable so the GM can drag a
  // connection from one node to another; in the read-only player graph (and the
  // read-only GM view) they stay hidden + non-connectable so they can't be
  // dragged and the floating center-to-center edge is the only visible line.
  const handleStyle = d.editable ? CONNECT_HANDLE : HIDDEN_HANDLE;
  return (
    <div
      className="flex flex-col items-center"
      style={{ opacity: d.dimmed ? 0.18 : 1, transition: 'opacity 120ms' }}
      title={`${ENTITY_LABELS[d.type] ?? d.type}: ${d.name}${d.editable ? ' — drag the dot to connect' : ''}`}
    >
      {/* Center handles: edges anchor here; the floating edge draws the visible
          center-to-center path. Hidden + inert unless the graph is editable. */}
      <Handle type="target" position={Position.Top} style={handleStyle} isConnectable={!!d.editable} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectable={!!d.editable} />
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: fill,
          border: d.selected ? '2.5px solid #1a1410' : '1.5px solid #f5ecd7',
          boxShadow: d.selected ? '0 0 0 3px rgba(154,29,46,0.35)' : 'none',
        }}
      />
      <span
        className="pointer-events-none mt-0.5 max-w-[120px] truncate font-serif text-[10px] leading-tight text-ink"
        style={{ textShadow: '0 1px 2px rgba(245,236,215,0.9)' }}
      >
        {d.name}
      </span>
    </div>
  );
}

const HIDDEN_HANDLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none',
};

// Editable graph: a small brass connect dot the GM can grab to drag a new edge.
const CONNECT_HANDLE: React.CSSProperties = {
  width: 9,
  height: 9,
  minWidth: 0,
  minHeight: 0,
  background: '#9a7b3f',
  border: '1.5px solid #f5ecd7',
  opacity: 0.85,
};

export const EntityNode = memo(EntityNodeImpl);
