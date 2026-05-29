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
};

function EntityNodeImpl({ data }: NodeProps) {
  const d = data as unknown as EntityNodeData;
  const fill = ENTITY_COLORS[d.type] ?? '#52443a';
  const r = d.selected ? 11 : 8;
  const size = r * 2;
  return (
    <div
      className="flex flex-col items-center"
      style={{ opacity: d.dimmed ? 0.18 : 1, transition: 'opacity 120ms' }}
      title={`${ENTITY_LABELS[d.type] ?? d.type}: ${d.name}`}
    >
      {/* Hidden center handles: edges anchor here; the floating edge draws the
          visible center-to-center path. */}
      <Handle type="target" position={Position.Top} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={HIDDEN_HANDLE} isConnectable={false} />
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

export const EntityNode = memo(EntityNodeImpl);
