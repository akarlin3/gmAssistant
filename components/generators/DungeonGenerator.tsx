'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import {
  computeMapBounds,
  expandFromExit,
  generateDungeon,
  TILE_PX,
} from '@/lib/generators/dungeon';
import type {
  DungeonChallengeTier,
  DungeonSize,
  DungeonTheme,
} from '@/lib/generators/tables/dungeon-tables';
import type {
  CampaignContext,
  DungeonExit,
  DungeonExitDirection,
  DungeonResult,
  DungeonRoom,
  DungeonRoomKind,
} from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';

const SIZE_OPTIONS: { value: DungeonSize; label: string }[] = [
  { value: 'small', label: 'Small (5 rooms)' },
  { value: 'medium', label: 'Medium (10 rooms)' },
  { value: 'large', label: 'Large (20 rooms)' },
  { value: 'sprawling', label: 'Sprawling (40 rooms)' },
];

const THEME_OPTIONS: { value: DungeonTheme; label: string }[] = [
  { value: 'ruin', label: 'Ruin' },
  { value: 'lair', label: 'Lair' },
  { value: 'tomb', label: 'Tomb' },
  { value: 'stronghold', label: 'Stronghold' },
  { value: 'temple', label: 'Temple' },
  { value: 'cave', label: 'Cave' },
  { value: 'sewer', label: 'Sewer' },
  { value: 'manor', label: 'Manor / Mansion' },
  { value: 'mine', label: 'Mine / Quarry' },
  { value: 'ship', label: 'Ship / Wreck' },
  { value: 'woods', label: 'Woods / Forest' },
  { value: 'swamp', label: 'Swamp / Marsh' },
  { value: 'mountain', label: 'Mountain Pass' },
  { value: 'frozen', label: 'Frozen Wastes' },
  { value: 'city', label: 'City Streets' },
];

const TIER_OPTIONS: { value: DungeonChallengeTier; label: string }[] = [
  { value: '0-4', label: 'CR 0–4' },
  { value: '5-10', label: 'CR 5–10' },
  { value: '11-16', label: 'CR 11–16' },
  { value: '17+', label: 'CR 17+' },
];

const INPUTS: InputSpec[] = [
  { kind: 'select', key: 'size', label: 'Size', default: 'medium', options: SIZE_OPTIONS },
  { kind: 'select', key: 'theme', label: 'Theme', default: 'ruin', options: THEME_OPTIONS },
  { kind: 'select', key: 'challengeTier', label: 'Challenge Tier', default: '5-10', options: TIER_OPTIONS },
];

// Map-cell tint per room kind. Tuned for the parchment palette.
const KIND_FILL: Record<DungeonRoomKind, string> = {
  empty: '#e7d9b8',
  monster: '#c25450',
  trap: '#d98a3a',
  hazard: '#c79a4a',
  treasure: '#c89f3a',
  feature: '#5e7a98',
  puzzle: '#8a6dab',
};
const KIND_STROKE: Record<DungeonRoomKind, string> = {
  empty: '#8c7a52',
  monster: '#7c2825',
  trap: '#8c4a18',
  hazard: '#8c5d18',
  treasure: '#8c6b18',
  feature: '#33485a',
  puzzle: '#4d3a68',
};
const KIND_LABEL: Record<DungeonRoomKind, string> = {
  empty: 'empty',
  monster: 'monster',
  trap: 'trap',
  hazard: 'hazard',
  treasure: 'treasure',
  feature: 'feature',
  puzzle: 'puzzle',
};

function copyText(r: DungeonResult): string {
  const lines: string[] = [
    r.name,
    `${r.inputs.theme} · ${r.inputs.size} · CR ${r.inputs.challengeTier}`,
  ];
  if (r.hook) lines.push(`\n${r.hook}`);
  if (r.details.hazards.length) lines.push('\nHazards:', ...r.details.hazards.map(h => `  - ${h}`));
  if (r.details.inhabitants.length) lines.push('\nInhabitants:', ...r.details.inhabitants.map(h => `  - ${h}`));
  lines.push(`\nRooms (${r.details.rooms.length}):`);
  for (const rm of r.details.rooms) {
    lines.push(`  ${rm.index}. ${rm.name}`);
    lines.push(`     ${rm.contents}`);
    lines.push(`     ${rm.dressing}`);
  }
  return lines.join('\n');
}

export default function DungeonGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  saveToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  saveToCampaign?: { label?: string; onSave: (result: DungeonResult) => void };
}) {
  return (
    <GeneratorPanel<{ size: string; theme: string; challengeTier: string }, DungeonResult>
      title="Dungeon"
      description="Generate a dungeon by size, theme, and challenge tier: rooms with contents and dressing, hazards, and theme-keyed inhabitants. The map view places rooms on a tile grid — click an amber '?' exit to grow the dungeon room-by-room."
      inputs={INPUTS}
      generate={(inputs, rng) =>
        generateDungeon({
          size: inputs.size as DungeonSize,
          theme: inputs.theme as DungeonTheme,
          challengeTier: inputs.challengeTier as DungeonChallengeTier,
        }, rng)
      }
      enhance={{ kind: 'dungeon' }}
      campaignContext={campaignContext}
      saveToCampaign={saveToCampaign}
      log={{
        kind: 'dungeon',
        entries,
        onEntriesChange,
        titleFor: (r) => r.name,
        copyText,
      }}
      renderResult={(r, ctx) => (
        <DungeonResultView result={r} onUpdate={ctx.onUpdate} />
      )}
    />
  );
}

function DungeonResultView({
  result,
  onUpdate,
}: {
  result: DungeonResult;
  onUpdate?: (next: DungeonResult) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleExpand = (roomIndex: number, exitId: string) => {
    if (!onUpdate) return;
    const { dungeon, outcome } = expandFromExit(result, roomIndex, exitId);
    onUpdate(dungeon);
    if (outcome === 'placed') {
      const newest = dungeon.details.rooms[dungeon.details.rooms.length - 1];
      if (newest) setSelectedIndex(newest.index);
    }
  };

  return (
    <div className="space-y-3 font-serif text-sm text-ink">
      <div>
        <div className="font-display tracking-wide text-base">{result.name}</div>
        <div className="text-xs text-ink-mute italic">
          {result.inputs.theme} · {result.inputs.size} · CR {result.inputs.challengeTier}
        </div>
      </div>
      {result.hook && (
        <p className="italic text-ink-soft border-l-2 border-crimson/40 pl-2">{result.hook}</p>
      )}

      <DungeonMap
        rooms={result.details.rooms}
        selectedIndex={selectedIndex}
        onSelectRoom={setSelectedIndex}
        onExpandExit={onUpdate ? handleExpand : undefined}
      />

      <div>
        <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Hazards</div>
        <ul className="list-disc ml-5">
          {result.details.hazards.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Inhabitants</div>
        <ul className="list-disc ml-5">
          {result.details.inhabitants.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">
          Rooms ({result.details.rooms.length})
        </div>
        <ol className="space-y-1.5 mt-1 list-decimal ml-5">
          {result.details.rooms.map((rm) => {
            const isSelected = rm.index === selectedIndex;
            return (
              <li
                key={rm.index}
                id={`dungeon-room-${rm.index}`}
                onClick={() => setSelectedIndex(rm.index)}
                className={`cursor-pointer rounded px-2 py-1 -mx-2 transition-colors ${
                  isSelected ? 'bg-crimson/10 ring-1 ring-crimson/30' : 'hover:bg-parchment-deep/40'
                }`}
              >
                <div className="font-display tracking-wide">{rm.name}</div>
                <div>{rm.contents}</div>
                <div className="text-xs text-ink-soft italic">{rm.dressing}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function DungeonMap({
  rooms,
  selectedIndex,
  onSelectRoom,
  onExpandExit,
}: {
  rooms: DungeonRoom[];
  selectedIndex: number | null;
  onSelectRoom: (index: number) => void;
  onExpandExit?: (roomIndex: number, exitId: string) => void;
}) {
  const bounds = useMemo(() => computeMapBounds(rooms), [rooms]);

  if (bounds.empty) {
    return (
      <div className="text-xs text-ink-mute italic font-serif border border-rule rounded bg-parchment-soft/60 p-3">
        No map layout available for this dungeon. (Saved before the map view was added — content fields below are still accurate.)
      </div>
    );
  }

  const viewW = (bounds.maxX - bounds.minX) * TILE_PX;
  const viewH = (bounds.maxY - bounds.minY) * TILE_PX;
  const viewBox = `${bounds.minX * TILE_PX} ${bounds.minY * TILE_PX} ${viewW} ${viewH}`;

  const roomsByIndex = new Map<number, DungeonRoom>();
  for (const r of rooms) roomsByIndex.set(r.index, r);

  // Lines for connected exits — draw each connection once by using a Set.
  const seen = new Set<string>();
  const connections: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const r of rooms) {
    if (r.x == null || r.exits == null) continue;
    for (const e of r.exits) {
      if (e.toRoomIndex == null || e.toRoomIndex < 0) continue;
      const target = roomsByIndex.get(e.toRoomIndex);
      if (!target || target.x == null) continue;
      const key = r.index < target.index ? `${r.index}-${target.index}` : `${target.index}-${r.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cx1 = ((r.x ?? 0) + (r.w ?? 0) / 2) * TILE_PX;
      const cy1 = ((r.y ?? 0) + (r.h ?? 0) / 2) * TILE_PX;
      const cx2 = ((target.x ?? 0) + (target.w ?? 0) / 2) * TILE_PX;
      const cy2 = ((target.y ?? 0) + (target.h ?? 0) / 2) * TILE_PX;
      connections.push({ x1: cx1, y1: cy1, x2: cx2, y2: cy2 });
    }
  }

  return (
    <div className="rounded border border-rule bg-parchment-soft/40 p-2">
      <svg
        viewBox={viewBox}
        style={{ maxHeight: 380, width: '100%', height: 'auto' }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Dungeon map"
      >
        {connections.map((c, i) => (
          <line
            key={i}
            x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke="#8c7a52"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}

        {rooms.map((rm) => {
          if (rm.x == null || rm.y == null || rm.w == null || rm.h == null) return null;
          const kind = (rm.kind ?? 'empty') as DungeonRoomKind;
          const isSelected = rm.index === selectedIndex;
          return (
            <g
              key={rm.index}
              onClick={() => onSelectRoom(rm.index)}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${rm.name} — ${KIND_LABEL[kind]}`}</title>
              <rect
                x={rm.x * TILE_PX}
                y={rm.y * TILE_PX}
                width={rm.w * TILE_PX}
                height={rm.h * TILE_PX}
                fill={KIND_FILL[kind]}
                stroke={isSelected ? '#a01d23' : KIND_STROKE[kind]}
                strokeWidth={isSelected ? 3 : 1.5}
                rx={3}
              />
              <text
                x={(rm.x + rm.w / 2) * TILE_PX}
                y={(rm.y + rm.h / 2) * TILE_PX + 4}
                textAnchor="middle"
                fontSize={14}
                fontFamily="ui-serif, Georgia, serif"
                fill="#2b1f10"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {rm.index}
              </text>
            </g>
          );
        })}

        {rooms.map((rm) =>
          (rm.exits ?? [])
            .filter((e) => e.toRoomIndex === null)
            .map((e) => renderUnexploredMarker(rm, e, onExpandExit))
        )}
      </svg>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-mute mt-2">
        {(Object.keys(KIND_FILL) as DungeonRoomKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: KIND_FILL[k], border: `1px solid ${KIND_STROKE[k]}` }}
            />
            <span>{KIND_LABEL[k]}</span>
          </span>
        ))}
        {onExpandExit && (
          <span className="flex items-center gap-1 italic">
            <Sparkles size={10} className="text-crimson" />
            click <span className="text-crimson font-bold">?</span> to grow
          </span>
        )}
      </div>
    </div>
  );
}

function renderUnexploredMarker(
  room: DungeonRoom,
  exit: DungeonExit,
  onExpandExit?: (roomIndex: number, exitId: string) => void,
) {
  if (room.x == null || room.y == null || room.w == null || room.h == null) return null;
  const cx = (room.x + room.w / 2) * TILE_PX;
  const cy = (room.y + room.h / 2) * TILE_PX;
  let mx = cx, my = cy;
  const offset = TILE_PX * 0.65;
  switch (exit.direction as DungeonExitDirection) {
    case 'N': my = room.y * TILE_PX - offset; break;
    case 'S': my = (room.y + room.h) * TILE_PX + offset; break;
    case 'E': mx = (room.x + room.w) * TILE_PX + offset; break;
    case 'W': mx = room.x * TILE_PX - offset; break;
  }
  return (
    <g
      key={`${room.index}-${exit.id}`}
      onClick={(ev) => {
        ev.stopPropagation();
        if (onExpandExit) onExpandExit(room.index, exit.id);
      }}
      style={{ cursor: onExpandExit ? 'pointer' : 'default' }}
    >
      <title>
        {`Unexplored ${exit.type}${exit.state ? ` (${exit.state})` : ''}${onExpandExit ? ' — click to grow' : ''}`}
      </title>
      <circle
        cx={mx}
        cy={my}
        r={8}
        fill="#fff4dc"
        stroke="#a01d23"
        strokeWidth={2}
        strokeDasharray="3 2"
      />
      <text
        x={mx}
        y={my + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight="bold"
        fill="#a01d23"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        ?
      </text>
    </g>
  );
}
