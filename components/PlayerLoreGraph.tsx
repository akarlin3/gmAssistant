'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Eye,
  Lock,
  Network,
  Pin,
  Plus,
  Sparkles,
  Trash2,
  Clock,
} from 'lucide-react';
import type {
  AttitudeTag,
  PlayerLoreAnnotation,
  PlayerQuest,
  PlayerStickyCard,
  PlayerTheoryLink,
} from '@/lib/pc/types';
import type { RevealedProgressClock } from '@/lib/playerMode/types';

// ---- Segmented Progress Clock SVG & Strip ----------------------------------

export function SegmentedClockSvg({
  segmentsTotal,
  segmentsFilled,
  size = 56,
  category = 'quest',
}: {
  segmentsTotal: number;
  segmentsFilled: number;
  size?: number;
  category?: string;
}) {
  const total = Math.max(2, Math.min(24, segmentsTotal || 4));
  const filled = Math.max(0, Math.min(total, segmentsFilled || 0));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  const fillColor =
    category === 'encounter' || category === 'danger'
      ? '#f43f5e'
      : category === 'faction'
        ? '#f59e0b'
        : '#6366f1';

  const slices = [];
  for (let i = 0; i < total; i++) {
    const startAngle = (i * 2 * Math.PI) / total - Math.PI / 2;
    const endAngle = ((i + 1) * 2 * Math.PI) / total - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const isFilled = i < filled;
    slices.push(
      <path
        key={i}
        d={d}
        fill={isFilled ? fillColor : 'rgba(24, 24, 27, 0.85)'}
        stroke="#3f3f46"
        strokeWidth={1.5}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 drop-shadow"
      aria-label={`${filled} of ${total} segments`}
    >
      {slices}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#71717a"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function RevealedProgressClocksStrip({
  clocks,
}: {
  clocks: readonly RevealedProgressClock[];
}) {
  if (!Array.isArray(clocks) || clocks.length === 0) return null;

  return (
    <div
      data-testid="revealed-clocks-strip"
      className="rounded-xl border border-amber-500/25 bg-zinc-900/80 p-3.5 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          Active Progress Clocks ({clocks.length})
        </div>
        <span className="text-[11px] text-zinc-400">Revealed by GM</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {clocks.map((clock) => (
          <div
            key={clock.id}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-2.5"
          >
            <SegmentedClockSvg
              segmentsTotal={clock.segmentsTotal}
              segmentsFilled={clock.segmentsFilled}
              category={clock.category}
              size={52}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-bold text-zinc-100">
                  {clock.title}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-300">
                  {clock.category || 'Clock'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-amber-300/90">
                {clock.segmentsFilled} / {clock.segmentsTotal} segments
              </div>
              {clock.publicDescription && (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">
                  {clock.publicDescription}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Player Investigation Conspiracy Board / Graph -------------------------

export interface ConspiracyBoardNode {
  id: string;
  label?: string;
  name?: string;
  category: 'npc' | 'location' | 'faction' | 'quest' | 'item' | 'pc' | string;
  subtitle?: string;
  description?: string;
  attitudeTag?: AttitudeTag;
  attitude?: AttitudeTag;
}

export type LoreGraphEntityNode = ConspiracyBoardNode;

export interface ConspiracyGmEdge {
  id: string;
  fromId?: string;
  toId?: string;
  sourceId?: string;
  targetId?: string;
  kind?: string;
  label?: string;
}

export type LoreGraphGmEdge = ConspiracyGmEdge;

export interface PlayerLoreGraphProps {
  nodes?: readonly ConspiracyBoardNode[];
  entities?: readonly ConspiracyBoardNode[];
  gmEdges?: readonly ConspiracyGmEdge[];
  annotations?: readonly PlayerLoreAnnotation[];
  quests?: readonly PlayerQuest[];
  theoryLinks: readonly PlayerTheoryLink[];
  stickyCards: readonly PlayerStickyCard[];
  nodePositions?: Record<string, { x: number; y: number }>;
  onAddTheoryLink?: (link: Omit<PlayerTheoryLink, 'id'>) => void;
  onToggleTheoryLinkShare?: (linkId: string) => void;
  onDeleteTheoryLink?: (linkId: string) => void;
  onChangeTheoryLinks?: (links: PlayerTheoryLink[]) => void;
  onAddStickyCard?: (card: Omit<PlayerStickyCard, 'id'>) => void;
  onToggleStickyCardShare?: (cardId: string) => void;
  onDeleteStickyCard?: (cardId: string) => void;
  onChangeStickyCards?: (cards: PlayerStickyCard[]) => void;
  onUpdateNodePosition?: (nodeId: string, pos: { x: number; y: number }) => void;
  onChangeNodePositions?: (positions: Record<string, { x: number; y: number }>) => void;
  onSelectNode?: (nodeId: string) => void;
}

const ATTITUDE_STYLES: Record<
  AttitudeTag | 'default',
  { border: string; fill: string; text: string; badge: string }
> = {
  friendly: {
    border: '#10b981',
    fill: 'rgba(6, 78, 59, 0.85)',
    text: '#a7f3d0',
    badge: 'Friendly',
  },
  neutral: {
    border: '#38bdf8',
    fill: 'rgba(12, 74, 110, 0.85)',
    text: '#bae6fd',
    badge: 'Neutral',
  },
  suspicious: {
    border: '#f59e0b',
    fill: 'rgba(120, 53, 15, 0.85)',
    text: '#fde68a',
    badge: 'Suspicious',
  },
  hostile: {
    border: '#f43f5e',
    fill: 'rgba(136, 19, 55, 0.85)',
    text: '#fecdd3',
    badge: 'Hostile',
  },
  default: {
    border: '#6366f1',
    fill: 'rgba(30, 27, 75, 0.85)',
    text: '#e0e7ff',
    badge: 'Revealed',
  },
};

export function PlayerLoreGraph({
  nodes,
  entities,
  gmEdges = [],
  annotations = [],
  quests = [],
  theoryLinks,
  stickyCards,
  nodePositions = {},
  onAddTheoryLink,
  onToggleTheoryLinkShare,
  onDeleteTheoryLink,
  onChangeTheoryLinks,
  onAddStickyCard,
  onToggleStickyCardShare,
  onDeleteStickyCard,
  onChangeStickyCards,
  onUpdateNodePosition,
  onChangeNodePositions,
  onSelectNode,
}: PlayerLoreGraphProps) {
  const inputNodes = nodes ?? entities ?? [];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Theory Link Builder Form
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [linkLabel, setLinkLabel] = useState<string>('');
  const [linkColor, setLinkColor] = useState<string>('#ef4444');
  const [linkShareWithGm, setLinkShareWithGm] = useState<boolean>(false);

  // Mystery Sticky Card Form
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardTitle, setCardTitle] = useState('');
  const [cardContent, setCardContent] = useState('');
  const [cardColor, setCardColor] = useState('#fef08a');
  const [cardShareWithGm, setCardShareWithGm] = useState<boolean>(false);

  // Combine revealed nodes + active player quests
  const allBoardNodes = useMemo<Array<ConspiracyBoardNode & { label: string }>>(() => {
    const annByEntity = new Map<string, AttitudeTag>();
    for (const a of annotations) {
      if (a.entityId && a.attitudeTag) {
        annByEntity.set(a.entityId, a.attitudeTag);
      }
    }
    const base = inputNodes.map((n) => ({
      ...n,
      label: n.label || n.name || n.id,
      attitudeTag: n.attitudeTag ?? n.attitude ?? annByEntity.get(n.id),
    }));
    const existingIds = new Set(base.map((n) => n.id));
    for (const q of quests) {
      if (!existingIds.has(q.id)) {
        base.push({
          id: q.id,
          label: q.title || 'Quest',
          category: 'quest',
          subtitle: q.category || q.status,
          attitudeTag: annByEntity.get(q.id),
        });
        existingIds.add(q.id);
      }
    }
    return base;
  }, [inputNodes, annotations, quests]);

  // Compute deterministic circular layout for nodes without custom positions
  const computedPositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    const total = Math.max(1, allBoardNodes.length);
    const cx = 420;
    const cy = 230;
    const rx = Math.min(310, Math.max(150, total * 34));
    const ry = Math.min(165, Math.max(110, total * 22));

    allBoardNodes.forEach((node, idx) => {
      if (nodePositions[node.id]) {
        map[node.id] = nodePositions[node.id];
      } else {
        const angle = (idx * 2 * Math.PI) / total - Math.PI / 2;
        map[node.id] = {
          x: Math.round(cx + rx * Math.cos(angle)),
          y: Math.round(cy + ry * Math.sin(angle)),
        };
      }
    });
    return map;
  }, [allBoardNodes, nodePositions]);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingId || !svgRef.current) return;
    if (!onUpdateNodePosition && !onChangeNodePositions) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 840 / Math.max(1, rect.width);
    const scaleY = 460 / Math.max(1, rect.height);
    const x = Math.max(60, Math.min(780, Math.round((e.clientX - rect.left) * scaleX)));
    const y = Math.max(36, Math.min(424, Math.round((e.clientY - rect.top) * scaleY)));
    onUpdateNodePosition?.(draggingId, { x, y });
    onChangeNodePositions?.({ ...nodePositions, [draggingId]: { x, y } });
  };

  const handleCreateTheoryLink = (e: React.FormEvent) => {
    e.preventDefault();
    const src = sourceId || allBoardNodes[0]?.id;
    const tgt = targetId || allBoardNodes[1]?.id || allBoardNodes[0]?.id;
    if (!src || !tgt) return;
    const newLink: Omit<PlayerTheoryLink, 'id'> = {
      sourceId: src,
      targetId: tgt,
      label: linkLabel.trim() || 'Suspected Connection',
      color: linkColor as PlayerTheoryLink['color'],
      sharedWithGm: linkShareWithGm,
      updatedAt: Date.now(),
    };
    onAddTheoryLink?.(newLink);
    onChangeTheoryLinks?.([
      ...theoryLinks,
      { ...newLink, id: `theory-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
    setLinkLabel('');
    setLinkShareWithGm(false);
    setShowLinkForm(false);
  };

  const handleCreateStickyCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardTitle.trim() && !cardContent.trim()) return;
    const newCard: Omit<PlayerStickyCard, 'id'> = {
      title: cardTitle.trim() || 'Mystery Clue',
      content: cardContent.trim(),
      color: cardColor as PlayerStickyCard['color'],
      sharedWithGm: cardShareWithGm,
      updatedAt: Date.now(),
    };
    onAddStickyCard?.(newCard);
    onChangeStickyCards?.([
      ...stickyCards,
      { ...newCard, id: `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
    setCardTitle('');
    setCardContent('');
    setCardShareWithGm(false);
    setShowCardForm(false);
  };

  return (
    <div
      data-testid="player-conspiracy-board"
      className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-4"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Network className="h-4 w-4 text-amber-400" />
            Investigation &amp; Conspiracy Board
          </h3>
          <p className="text-xs text-zinc-400">
            Drag entities, connect clues with red string Theory Links, and pin Mystery Sticky Cards. New links &amp; cards default to <span className="text-amber-300 font-medium">🔒 Private</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowLinkForm((v) => !v);
              setShowCardForm(false);
              if (!sourceId && allBoardNodes[0]) setSourceId(allBoardNodes[0].id);
              if (!targetId && allBoardNodes[1]) setTargetId(allBoardNodes[1].id);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/50"
          >
            <Plus className="h-3.5 w-3.5" />
            + Theory Link
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCardForm((v) => !v);
              setShowLinkForm(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/50"
          >
            <Pin className="h-3.5 w-3.5" />
            + Mystery Sticky Card
          </button>
        </div>
      </div>

      {/* Add Theory Link Drawer */}
      {showLinkForm && (
        <form
          onSubmit={handleCreateTheoryLink}
          className="rounded-lg border border-rose-500/30 bg-zinc-900/90 p-3 space-y-3 text-xs"
        >
          <div className="font-semibold text-rose-300">Add Conspiracy Theory Link</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">From Node</label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
              >
                {allBoardNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label} ({n.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">To Node</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
              >
                {allBoardNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label} ({n.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Theory Label</label>
              <input
                type="text"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="e.g. Secretly funding, Murder suspect"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-zinc-100"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-zinc-300">
                <span>String Color:</span>
                <select
                  value={linkColor}
                  onChange={(e) => setLinkColor(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
                >
                  <option value="#ef4444">Crimson String</option>
                  <option value="#f59e0b">Amber Gold</option>
                  <option value="#10b981">Emerald</option>
                  <option value="#a855f7">Violet</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setLinkShareWithGm((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                  linkShareWithGm
                    ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300'
                }`}
              >
                {linkShareWithGm ? (
                  <>
                    <Eye className="h-3 w-3" /> 👁️ Share with GM
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" /> 🔒 Private (Local Only)
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLinkForm(false)}
                className="rounded border border-zinc-700 px-2.5 py-1 text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
              >
                Add Theory Link
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Add Mystery Sticky Card Drawer */}
      {showCardForm && (
        <form
          onSubmit={handleCreateStickyCard}
          className="rounded-lg border border-amber-500/30 bg-zinc-900/90 p-3 space-y-3 text-xs"
        >
          <div className="font-semibold text-amber-300">Pin Mystery Sticky Card</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder="Hypothesis / Clue Title..."
              className="rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-zinc-100"
            />
            <input
              type="text"
              value={cardContent}
              onChange={(e) => setCardContent(e.target.value)}
              placeholder="Details, alibis, ciphers, or questions..."
              className="rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-zinc-100"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCardShareWithGm((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                  cardShareWithGm
                    ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300'
                }`}
              >
                {cardShareWithGm ? (
                  <>
                    <Eye className="h-3 w-3" /> 👁️ Share with GM
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" /> 🔒 Private (Local Only)
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCardForm(false)}
                className="rounded border border-zinc-700 px-2.5 py-1 text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-amber-500 px-3 py-1 font-bold text-zinc-950 hover:bg-amber-400"
              >
                Pin Sticky Card
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Attitude Tag Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
        <span className="font-semibold text-zinc-300">Attitude Colors:</span>
        {(['friendly', 'neutral', 'suspicious', 'hostile'] as const).map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ATTITUDE_STYLES[tag].border }}
            />
            {ATTITUDE_STYLES[tag].badge}
          </span>
        ))}
        <span className="ml-auto text-zinc-500">
          Solid Line = GM Revealed • Dashed Line = Player Theory
        </span>
      </div>

      {/* Interactive SVG Conspiracy Graph */}
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:18px_18px] bg-zinc-950">
        {allBoardNodes.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center p-6 text-center text-xs text-zinc-500">
            <Sparkles className="h-6 w-6 text-zinc-600 mb-2" />
            No revealed entities or quests on the board yet. Add a quest or wait for the GM to reveal NPCs, Locations, or Factions.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox="0 0 840 460"
            className="h-[380px] w-full select-none touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDraggingId(null)}
            onPointerLeave={() => setDraggingId(null)}
          >
            {/* GM-Revealed Relationship Edges */}
            {gmEdges.map((edge) => {
              const p1 = computedPositions[edge.fromId || edge.sourceId || ''];
              const p2 = computedPositions[edge.toId || edge.targetId || ''];
              if (!p1 || !p2) return null;
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              return (
                <g key={`gm-${edge.id}`}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#52525b"
                    strokeWidth={2}
                  />
                  <rect
                    x={mx - 36}
                    y={my - 9}
                    width={72}
                    height={18}
                    rx={4}
                    fill="#18181b"
                    stroke="#3f3f46"
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    fill="#a1a1aa"
                    fontSize={9}
                  >
                    {edge.kind || edge.label || ''}
                  </text>
                </g>
              );
            })}

            {/* Player Theory Links (Dashed Conspiracy Strings) */}
            {theoryLinks.map((link) => {
              const p1 = computedPositions[link.sourceId];
              const p2 = computedPositions[link.targetId];
              if (!p1 || !p2) return null;
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2 - 12;
              return (
                <g key={link.id}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={link.color || '#ef4444'}
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                  />
                  <rect
                    x={mx - 58}
                    y={my - 10}
                    width={116}
                    height={20}
                    rx={5}
                    fill="#09090b"
                    stroke={link.color || '#ef4444'}
                    strokeWidth={1.2}
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    fill="#fef2f2"
                    fontSize={9.5}
                    fontWeight="bold"
                  >
                    {link.sharedWithGm ? '👁️ ' : '🔒 '}
                    {link.label.slice(0, 18)}
                  </text>
                </g>
              );
            })}

            {/* Entity Nodes */}
            {allBoardNodes.map((node) => {
              const pos = computedPositions[node.id] ?? { x: 420, y: 230 };
              const style = ATTITUDE_STYLES[node.attitudeTag ?? 'default'];
              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingId(node.id);
                  }}
                  onClick={() => onSelectNode?.(node.id)}
                >
                  <rect
                    x={-68}
                    y={-24}
                    width={136}
                    height={48}
                    rx={10}
                    fill={style.fill}
                    stroke={style.border}
                    strokeWidth={2}
                  />
                  <circle cx={0} cy={-20} r={3.5} fill={style.border} />
                  <text
                    x={0}
                    y={-2}
                    textAnchor="middle"
                    fill={style.text}
                    fontSize={11}
                    fontWeight="bold"
                  >
                    {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                  </text>
                  <text
                    x={0}
                    y={13}
                    textAnchor="middle"
                    fill="#d4d4d8"
                    fontSize={9}
                  >
                    {node.category.toUpperCase()}
                    {node.attitudeTag ? ` • ${style.badge}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Pinned Mystery Sticky Cards & Theory Links Management */}
      {(stickyCards.length > 0 || theoryLinks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Mystery Sticky Cards */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Pinned Mystery Sticky Cards ({stickyCards.length})
            </div>
            {stickyCards.length === 0 ? (
              <p className="text-xs text-zinc-500">No sticky cards pinned yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stickyCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-amber-200">{card.title}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteStickyCard?.(card.id);
                          onChangeStickyCards?.(stickyCards.filter((c) => c.id !== card.id));
                        }}
                        className="text-zinc-500 hover:text-rose-400"
                        title="Remove Sticky Card"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {card.content && (
                      <p className="text-zinc-300 text-[11px] whitespace-pre-wrap">
                        {card.content}
                      </p>
                    )}
                    <div className="pt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          onToggleStickyCardShare?.(card.id);
                          onChangeStickyCards?.(
                            stickyCards.map((c) =>
                              c.id === card.id ? { ...c, sharedWithGm: !c.sharedWithGm } : c,
                            ),
                          );
                        }}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium border ${
                          card.sharedWithGm
                            ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        {card.sharedWithGm ? '👁️ Shared with GM' : '🔒 Private'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Theory Links List */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
              Conspiracy Theory Links ({theoryLinks.length})
            </div>
            {theoryLinks.length === 0 ? (
              <p className="text-xs text-zinc-500">No custom theory links yet.</p>
            ) : (
              <div className="space-y-1.5">
                {theoryLinks.map((link) => {
                  const srcName =
                    allBoardNodes.find((n) => n.id === link.sourceId)?.label || link.sourceId;
                  const tgtName =
                    allBoardNodes.find((n) => n.id === link.targetId)?.label || link.targetId;
                  return (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-semibold text-zinc-200">{srcName}</span>
                        <span className="mx-1.5 text-rose-400">⎯[{link.label}]→</span>
                        <span className="font-semibold text-zinc-200">{tgtName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onToggleTheoryLinkShare?.(link.id);
                            onChangeTheoryLinks?.(
                              theoryLinks.map((l) =>
                                l.id === link.id ? { ...l, sharedWithGm: !l.sharedWithGm } : l,
                              ),
                            );
                          }}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium border ${
                            link.sharedWithGm
                              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                              : 'border-zinc-700 bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          {link.sharedWithGm ? '👁️ Shared' : '🔒 Private'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteTheoryLink?.(link.id);
                            onChangeTheoryLinks?.(theoryLinks.filter((l) => l.id !== link.id));
                          }}
                          className="text-zinc-500 hover:text-rose-400"
                          title="Delete Theory Link"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
