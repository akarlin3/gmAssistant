'use client';

// Campaign-wide relationship graph (Phase 3). Dependency-free SVG force-directed
// layout — same approach as components/NPCRelationshipWeb but generalized to
// every entity type and typed relationship kind. Node fill = entity type, edge
// color = relationship kind. Clicking a node selects it (parent opens a side
// panel). "Spotlight" dims everything more than `spotlightDepth` edges from the
// selected node. Layout runs once per node/edge-set change and is cached in
// state, so dragging a node doesn't trigger a re-layout.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ENTITY_COLORS } from '@/lib/wiki/colors';
import { edgeColor } from '@/lib/wiki/colors';
import { entityKey, type WikiEntity } from '@/lib/wiki/entities';
import type { Relationship } from '@/lib/wiki/types';

type Pos = { x: number; y: number };

const W = 900;
const H = 620;

export default function WikiGraph({
  entities,
  relationships,
  selectedKey,
  spotlightDepth,
  onNodeClick,
}: {
  entities: WikiEntity[];
  relationships: Relationship[];
  selectedKey: string | null;
  spotlightDepth: number;
  onNodeClick: (e: WikiEntity) => void;
}) {
  // Only edges whose endpoints are both present as nodes.
  const nodeKeys = useMemo(() => new Set(entities.map((e) => entityKey(e.type, e.id))), [entities]);
  const edges = useMemo(
    () =>
      relationships
        .map((r) => ({
          rel: r,
          source: entityKey(r.fromType, r.fromId),
          target: entityKey(r.toType, r.toId),
        }))
        .filter((e) => nodeKeys.has(e.source) && nodeKeys.has(e.target) && e.source !== e.target),
    [relationships, nodeKeys],
  );

  const positions = useForceLayout(entities, edges);
  const [drag, setDrag] = useState<{ key: string; offX: number; offY: number } | null>(null);
  const [livePos, setLivePos] = useState<Record<string, Pos>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pos = (key: string): Pos => livePos[key] ?? positions[key] ?? { x: W / 2, y: H / 2 };

  // Reset manual overrides when the computed layout changes.
  useEffect(() => setLivePos({}), [positions]);

  // BFS spotlight set: keys within `spotlightDepth` edges of the selected node.
  const spotlight = useMemo(() => {
    if (!selectedKey) return null;
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
      (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
    }
    const within = new Set<string>([selectedKey]);
    let frontier = [selectedKey];
    for (let d = 0; d < spotlightDepth; d++) {
      const next: string[] = [];
      for (const k of frontier) {
        for (const n of adj.get(k) ?? []) {
          if (!within.has(n)) {
            within.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return within;
  }, [selectedKey, edges, spotlightDepth]);

  const dim = (key: string) => (spotlight ? !spotlight.has(key) : false);

  const toLocal = (e: React.MouseEvent): Pos | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const l = pt.matrixTransform(ctm.inverse());
    return { x: l.x, y: l.y };
  };

  const onMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const l = toLocal(e);
    if (!l) return;
    setLivePos((p) => ({ ...p, [drag.key]: { x: l.x - drag.offX, y: l.y - drag.offY } }));
  };

  if (entities.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-rule bg-parchment-soft text-center font-serif text-sm italic text-ink-mute">
        No entities match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-parchment-soft shadow-card">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[60vh] w-full cursor-grab active:cursor-grabbing"
        onMouseMove={onMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        {edges.map((e) => {
          const a = pos(e.source);
          const b = pos(e.target);
          const faded = dim(e.source) || dim(e.target);
          const c = edgeColor(e.rel.kind);
          return (
            <line
              key={e.rel.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={c}
              strokeWidth={1.4}
              strokeOpacity={faded ? 0.08 : 0.65}
            />
          );
        })}
        {entities.map((ent) => {
          const key = entityKey(ent.type, ent.id);
          const p = pos(key);
          const faded = dim(key);
          const selected = key === selectedKey;
          return (
            <g
              key={key}
              transform={`translate(${p.x},${p.y})`}
              opacity={faded ? 0.18 : 1}
              className="cursor-pointer"
              onMouseDown={(ev) => {
                const l = toLocal(ev);
                if (l) setDrag({ key, offX: l.x - p.x, offY: l.y - p.y });
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                if (!drag) onNodeClick(ent);
              }}
            >
              <circle
                r={selected ? 11 : 8}
                fill={ENTITY_COLORS[ent.type]}
                stroke={selected ? '#1a1410' : '#f5ecd7'}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <text
                y={-12}
                textAnchor="middle"
                fontSize={10}
                fill="#1a1410"
                className="pointer-events-none select-none font-serif"
              >
                {ent.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function useForceLayout(
  nodes: WikiEntity[],
  edges: Array<{ source: string; target: string }>,
): Record<string, Pos> {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const nodeKey = useMemo(
    () =>
      nodes
        .map((n) => entityKey(n.type, n.id))
        .sort()
        .join(','),
    [nodes],
  );
  const edgeKey = useMemo(
    () =>
      edges
        .map((e) => `${e.source}>${e.target}`)
        .sort()
        .join(','),
    [edges],
  );

  useEffect(() => {
    const keys = nodes.map((n) => entityKey(n.type, n.id));
    const cx = W / 2;
    const cy = H / 2;
    const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
    keys.forEach((k, i) => {
      const angle = (i / Math.max(1, keys.length)) * Math.PI * 2;
      const r = Math.min(W, H) / 3;
      pos[k] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0 };
    });

    const iterations = keys.length > 150 ? 90 : 220;
    const REPULSE = 9000;
    const SPRING_K = 0.04;
    const SPRING_L = 110;
    const DAMPING = 0.85;
    const CENTER_K = 0.006;

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const a = pos[keys[i]];
          const b = pos[keys[j]];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = Math.max(50, dx * dx + dy * dy);
          const d = Math.sqrt(d2);
          const f = REPULSE / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      for (const e of edges) {
        const a = pos[e.source];
        const b = pos[e.target];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = SPRING_K * (d - SPRING_L);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const k of keys) {
        const p = pos[k];
        p.vx += (cx - p.x) * CENTER_K;
        p.vy += (cy - p.y) * CENTER_K;
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.x += p.vx;
        p.y += p.vy;
        p.x = Math.max(30, Math.min(W - 30, p.x));
        p.y = Math.max(30, Math.min(H - 30, p.y));
      }
    }
    const next: Record<string, Pos> = {};
    for (const k of keys) next[k] = { x: pos[k].x, y: pos[k].y };
    setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edgeKey]);

  return positions;
}
