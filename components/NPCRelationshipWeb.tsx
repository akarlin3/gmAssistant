'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, RotateCcw, X } from 'lucide-react';
import type { Character } from '@/lib/character-schema';

// Lightweight node-link visualization of NPC ↔ NPC and NPC ↔ PC relationships.
// We run a tiny force-directed layout client-side (no external dep) so the
// graph self-organizes; positions are cached in state so they don't jump
// every render. Edges carry a typed label (ally/rival/owes/loves/loyal-to)
// and an intensity (1–5).

export type RelationshipEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: 'ally' | 'rival' | 'owes' | 'loves' | 'loyal' | 'enemy' | 'family' | 'custom';
  label?: string;
  intensity: number; // 1..5
};

export type RelationshipGraphState = {
  edges: RelationshipEdge[];
  /** Cached node positions keyed by node id. */
  positions: Record<string, { x: number; y: number }>;
};

type NPC = { id?: string; name?: string; type?: string; faction?: string; archetype?: string };

export function emptyGraph(): RelationshipGraphState {
  return { edges: [], positions: {} };
}

const KIND_STYLE: Record<RelationshipEdge['kind'], { color: string; label: string }> = {
  ally:   { color: '#3d5a2a', label: 'Ally' },
  rival:  { color: '#a87f2e', label: 'Rival' },
  owes:   { color: '#7a5a1e', label: 'Owes' },
  loves:  { color: '#c44456', label: 'Loves' },
  loyal:  { color: '#5c1f3d', label: 'Loyal to' },
  enemy:  { color: '#9a1d2e', label: 'Enemy' },
  family: { color: '#1e4a5a', label: 'Family' },
  custom: { color: '#52443a', label: 'Custom' },
};

type Props = {
  npcs: NPC[];
  characters: Character[];
  graph: RelationshipGraphState;
  onChange: (next: RelationshipGraphState) => void;
};

type Node = {
  id: string;
  label: string;
  kind: 'pc' | 'npc';
  faction?: string;
  color: string;
};

function nodeId(prefix: 'pc' | 'npc', id: string) {
  return `${prefix}:${id}`;
}

export default function NPCRelationshipWeb({ npcs, characters, graph, onChange }: Props) {
  const nodes: Node[] = useMemo(() => {
    const pcs: Node[] = characters.filter(c => !c.isSidekick).map(c => ({
      id: nodeId('pc', c.id),
      label: c.name || 'Unnamed PC',
      kind: 'pc',
      color: '#9a1d2e',
    }));
    const npcNodes: Node[] = npcs.map((n, i) => ({
      id: nodeId('npc', n.id ?? `idx-${i}`),
      label: n.name || n.archetype || `NPC ${i + 1}`,
      kind: 'npc',
      faction: n.faction,
      color: '#7a5a1e',
    }));
    return [...pcs, ...npcNodes];
  }, [characters, npcs]);

  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [pending, setPending] = useState<string | null>(null); // node id awaiting partner

  // Force-directed layout. Runs only when nodes or edges change, not on every
  // drag (the cached positions persist), so the graph is stable.
  const positions = useForceLayout(nodes, graph.edges, graph.positions);

  // Merge external positions (post-layout) back into the graph so they persist.
  useEffect(() => {
    const same =
      Object.keys(positions).length === Object.keys(graph.positions).length &&
      Object.keys(positions).every(k =>
        graph.positions[k]
        && Math.abs(graph.positions[k].x - positions[k].x) < 0.5
        && Math.abs(graph.positions[k].y - positions[k].y) < 0.5,
      );
    if (!same) {
      onChange({ ...graph, positions });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const p = positions[id] ?? { x: 0, y: 0 };
    setDrag({ id, offsetX: local.x - p.x, offsetY: local.y - p.y });
  };

  const onSvgMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const next = { ...graph.positions, [drag.id]: { x: local.x - drag.offsetX, y: local.y - drag.offsetY } };
    onChange({ ...graph, positions: next });
  };

  const onSvgMouseUp = () => setDrag(null);

  const handleNodeClick = (id: string) => {
    if (drag) return;
    if (pending === null) {
      setPending(id);
      return;
    }
    if (pending === id) {
      setPending(null);
      return;
    }
    // Create a default ally edge between pending and id.
    const edge: RelationshipEdge = {
      id: `e-${Date.now().toString(36)}`,
      fromId: pending,
      toId: id,
      kind: 'ally',
      intensity: 3,
    };
    onChange({ ...graph, edges: [...graph.edges, edge] });
    setPending(null);
    setSelectedEdge(edge.id);
  };

  const removeEdge = (id: string) => {
    onChange({ ...graph, edges: graph.edges.filter(e => e.id !== id) });
    if (selectedEdge === id) setSelectedEdge(null);
  };

  const updateEdge = (id: string, patch: Partial<RelationshipEdge>) => {
    onChange({ ...graph, edges: graph.edges.map(e => e.id === id ? { ...e, ...patch } : e) });
  };

  const resetLayout = () => {
    onChange({ ...graph, positions: {} });
  };

  const selected = graph.edges.find(e => e.id === selectedEdge) ?? null;

  return (
    <div className="space-y-3 text-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wide text-ink">Relationships</h2>
          <p className="font-serif text-xs italic text-ink-mute">
            Click a node, then click a second node to draw an edge. Drag to reposition.
            {pending && <span className="ml-1 font-display text-crimson">— select partner for {nodeLabel(nodes, pending)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={resetLayout}
            className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
          >
            <RotateCcw size={12} /> Re-layout
          </button>
        </div>
      </header>

      {nodes.length < 2 ? (
        <div className="rounded border border-dashed border-rule bg-parchment p-6 text-center font-serif text-xs italic text-ink-mute">
          Add at least two NPCs or characters to build a relationship web.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
          <div className="overflow-hidden rounded border border-rule bg-parchment shadow-card">
            <svg
              ref={svgRef}
              viewBox="0 0 800 500"
              className="h-[500px] w-full cursor-grab active:cursor-grabbing"
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
            >
              <defs>
                {Object.entries(KIND_STYLE).map(([kind, s]) => (
                  <marker
                    key={kind}
                    id={`arrow-${kind}`}
                    viewBox="0 0 10 10"
                    refX="9" refY="5"
                    markerWidth="6" markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={s.color} />
                  </marker>
                ))}
              </defs>
              {graph.edges.map(e => {
                const a = positions[e.fromId]; const b = positions[e.toId];
                if (!a || !b) return null;
                const style = KIND_STYLE[e.kind];
                const isSel = e.id === selectedEdge;
                const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
                return (
                  <g key={e.id} className="cursor-pointer" onClick={() => setSelectedEdge(e.id)}>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={style.color}
                      strokeWidth={isSel ? 3 : 1 + e.intensity * 0.4}
                      strokeOpacity={isSel ? 1 : 0.7}
                      markerEnd={`url(#arrow-${e.kind})`}
                    />
                    <text
                      x={mx} y={my - 4}
                      textAnchor="middle"
                      fontSize="10"
                      fill={style.color}
                      className="pointer-events-none select-none font-serif"
                    >
                      {e.label || style.label}
                    </text>
                  </g>
                );
              })}
              {nodes.map(n => {
                const p = positions[n.id]; if (!p) return null;
                const isPending = pending === n.id;
                const isHover = hoverNode === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x},${p.y})`}
                    onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                    onMouseEnter={() => setHoverNode(n.id)}
                    onMouseLeave={() => setHoverNode(null)}
                    onClick={() => handleNodeClick(n.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      r={n.kind === 'pc' ? 22 : 18}
                      fill={n.color}
                      stroke={isPending ? '#9a1d2e' : isHover ? '#a87f2e' : '#52443a'}
                      strokeWidth={isPending ? 3 : 1.5}
                      opacity={n.kind === 'pc' ? 1 : 0.85}
                    />
                    <text
                      y={n.kind === 'pc' ? 36 : 32}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#1a1410"
                      className="pointer-events-none select-none font-display"
                    >
                      {n.label}
                    </text>
                    {n.faction && (
                      <text
                        y={n.kind === 'pc' ? 48 : 44}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#8a7a6a"
                        className="pointer-events-none select-none font-serif italic"
                      >
                        {n.faction}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <aside className="max-h-[500px] space-y-3 overflow-y-auto rounded border border-rule bg-parchment p-3 shadow-card">
            <div className="space-y-2">
              <h3 className="font-display text-sm uppercase tracking-wide text-ink">Legend</h3>
              <ul className="space-y-1">
                {Object.entries(KIND_STYLE).map(([k, s]) => (
                  <li key={k} className="flex items-center gap-1.5 font-serif text-xs text-ink">
                    <span className="inline-block h-1 w-6" style={{ background: s.color }} />
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-sm uppercase tracking-wide text-ink">
                Edges <span className="font-display text-xs text-brass-deep">({graph.edges.length})</span>
              </h3>
              {graph.edges.length === 0 && (
                <p className="font-serif text-xs italic text-ink-mute">
                  Click a node, then click another to add a relationship.
                </p>
              )}
              <ul className="space-y-1">
                {graph.edges.map(e => {
                  const from = nodes.find(n => n.id === e.fromId);
                  const to = nodes.find(n => n.id === e.toId);
                  const sel = e.id === selectedEdge;
                  return (
                    <li
                      key={e.id}
                      className={`flex items-center gap-1.5 rounded border p-1.5 ${
                        sel ? 'border-crimson bg-crimson/5' : 'border-rule bg-parchment-soft'
                      }`}
                    >
                      <button
                        onClick={() => setSelectedEdge(e.id)}
                        className="flex-1 text-left font-serif text-xs text-ink"
                      >
                        <span className="font-display">{from?.label ?? '?'}</span>
                        <span className="mx-1 text-ink-mute">{KIND_STYLE[e.kind].label.toLowerCase()}</span>
                        <span className="font-display">{to?.label ?? '?'}</span>
                      </button>
                      <button
                        onClick={() => removeEdge(e.id)}
                        className="text-ink-mute hover:text-crimson"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {selected && (
              <div className="space-y-2 border-t border-rule pt-2">
                <h3 className="font-display text-sm uppercase tracking-wide text-ink">Edit edge</h3>
                <label className="flex flex-col gap-1">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Kind</span>
                  <select
                    value={selected.kind}
                    onChange={(e) => updateEdge(selected.id, { kind: e.target.value as RelationshipEdge['kind'] })}
                    className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
                  >
                    {Object.entries(KIND_STYLE).map(([k, s]) => (
                      <option key={k} value={k}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Label (optional)</span>
                  <input
                    value={selected.label ?? ''}
                    onChange={(e) => updateEdge(selected.id, { label: e.target.value })}
                    placeholder={KIND_STYLE[selected.kind].label}
                    className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="flex items-center justify-between font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Intensity <span className="text-ink">{selected.intensity}</span>
                  </span>
                  <input
                    type="range" min={1} max={5}
                    value={selected.intensity}
                    onChange={(e) => updateEdge(selected.id, { intensity: Number(e.target.value) })}
                    className="accent-crimson"
                  />
                </label>
                <button
                  onClick={() => removeEdge(selected.id)}
                  className="flex items-center gap-1 rounded border border-crimson/40 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10"
                >
                  <Trash2 size={12} /> Delete edge
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function nodeLabel(nodes: Node[], id: string): string {
  return nodes.find(n => n.id === id)?.label ?? id;
}

// Simple force-directed layout. We run ~200 iterations on mount and whenever
// the node set or edge set changes (not on drag).
function useForceLayout(
  nodes: Node[],
  edges: RelationshipEdge[],
  cachedPositions: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const cacheRef = useRef(cachedPositions);
  cacheRef.current = cachedPositions;
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(cachedPositions);

  // Recompute when node set changes.
  const nodeKey = useMemo(() => nodes.map(n => n.id).sort().join(','), [nodes]);
  const edgeKey = useMemo(() => edges.map(e => `${e.fromId}-${e.toId}`).sort().join(','), [edges]);

  useEffect(() => {
    const W = 800, H = 500, cx = W / 2, cy = H / 2;
    const cached = cacheRef.current;
    const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
    nodes.forEach((n, i) => {
      const c = cached[n.id];
      if (c) {
        pos[n.id] = { x: c.x, y: c.y, vx: 0, vy: 0 };
      } else {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        const r = 150;
        pos[n.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0 };
      }
    });

    // If no edges and all positions already cached, skip.
    const allCached = nodes.every(n => cached[n.id]);
    if (allCached && nodes.length === Object.keys(cached).length) {
      const next: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) next[n.id] = { x: cached[n.id].x, y: cached[n.id].y };
      setPositions(next);
      return;
    }

    const REPULSE = 8000;
    const SPRING_K = 0.03;
    const SPRING_L = 120;
    const DAMPING = 0.85;
    const CENTER_K = 0.005;

    for (let iter = 0; iter < 200; iter++) {
      // Repulsion between all pairs.
      const ids = Object.keys(pos);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = pos[ids[i]]; const b = pos[ids[j]];
          const dx = a.x - b.x; const dy = a.y - b.y;
          const d2 = Math.max(50, dx * dx + dy * dy);
          const d = Math.sqrt(d2);
          const f = REPULSE / d2;
          const fx = (dx / d) * f; const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      // Spring forces from edges.
      for (const e of edges) {
        const a = pos[e.fromId]; const b = pos[e.toId];
        if (!a || !b) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = SPRING_K * (d - SPRING_L);
        const fx = (dx / d) * force; const fy = (dy / d) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Centering.
      for (const id of ids) {
        const p = pos[id];
        p.vx += (cx - p.x) * CENTER_K;
        p.vy += (cy - p.y) * CENTER_K;
        p.vx *= DAMPING; p.vy *= DAMPING;
        p.x += p.vx; p.y += p.vy;
        // Constrain to viewport with margin.
        p.x = Math.max(40, Math.min(W - 40, p.x));
        p.y = Math.max(40, Math.min(H - 40, p.y));
      }
    }
    const next: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) next[n.id] = { x: pos[n.id].x, y: pos[n.id].y };
    setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edgeKey]);

  return positions;
}
