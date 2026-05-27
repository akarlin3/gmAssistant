'use client';

// Read-only player map viewer. Renders the player-visible projection (image +
// markers + pointcrawl nodes/edges) with plain DOM/SVG so the public player
// bundle never has to load Konva. Coordinates are normalized (0–1).

import { useState } from 'react';
import type { PlayerMap } from '@/lib/maps/playerProjection';

const ICON_GLYPH: Record<string, string> = {
  pin: '📍', star: '⭐', sword: '⚔️', eye: '👁️', skull: '💀', house: '🏠', cave: '🕳️', tree: '🌲',
};

function MapView({ map }: { map: PlayerMap }) {
  const aspect = map.height > 0 ? (map.height / map.width) * 100 : 62.5;
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  return (
    <div className="overflow-hidden rounded border border-rule bg-zinc-900 shadow-card">
      <div className="relative w-full" style={{ paddingTop: `${aspect}%` }}>
        {map.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={map.imageUrl} alt={map.name} className="absolute inset-0 size-full object-contain" />
        )}

        {(map.edges.length > 0 || map.nodes.length > 0) && (
          <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {map.edges.map((e) => {
              const a = nodeById.get(e.fromNodeId);
              const b = nodeById.get(e.toNodeId);
              if (!a || !b) return null;
              return (
                <line
                  key={e.id}
                  x1={a.x * 100}
                  y1={a.y * 100}
                  x2={b.x * 100}
                  y2={b.y * 100}
                  stroke={e.hazardous ? '#ef4444' : '#94a3b8'}
                  strokeWidth={0.4}
                  strokeDasharray={e.hazardous ? '1.2,0.8' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        )}

        {map.nodes.map((n) => (
          <div
            key={n.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
          >
            <span className="block size-3 rounded-full border-2 border-zinc-800 bg-violet-400" />
            {n.label && <span className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-900/80 px-1 text-[11px] text-zinc-100">{n.label}</span>}
          </div>
        ))}

        {map.markers.map((m) => (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          >
            <span className="block size-4 rounded-full border-2 border-zinc-800" style={{ background: m.color ?? '#f472b6' }} />
            {(m.icon || m.label) && (
              <span className="absolute left-5 top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded bg-zinc-900/80 px-1 text-[11px] text-zinc-100">
                {m.icon && ICON_GLYPH[m.icon]} {m.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlayerMapView({ maps }: { maps: PlayerMap[] }) {
  const [activeId, setActiveId] = useState<string>(maps[0]?.id ?? '');
  if (maps.length === 0) return null;
  const active = maps.find((m) => m.id === activeId) ?? maps[0];
  return (
    <div className="space-y-3">
      {maps.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveId(m.id)}
              className={`rounded border px-2.5 py-1 font-display text-xs uppercase tracking-wider ${m.id === active.id ? 'border-crimson bg-crimson/10 text-crimson' : 'border-rule text-ink-soft hover:bg-parchment-deep'}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      <MapView map={active} />
    </div>
  );
}
