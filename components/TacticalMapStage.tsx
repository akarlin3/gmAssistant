'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  makeDefaultLayer,
  makeMap,
  newId,
  readMaps,
  type CampaignMap,
  type MapFogRegion,
  type MapPing,
  type MapTokenPin,
  type MapTrapPin,
} from '@/lib/maps/types';
import {
  projectFogRegions,
  projectMapPings,
  projectMapTokens,
  type PlayerMap,
} from '@/lib/maps/playerProjection';
import type { PlayerCharacter } from '@/lib/pc/types';

export interface TacticalMapStageProps {
  /** Role of the viewer: 'gm' (full authoring + fog/trap controls), 'standalone-player', or 'shared-player'. */
  role: 'gm' | 'standalone-player' | 'shared-player';
  /** Raw campaign maps (for GM / standalone-player) or projected PlayerMap[] (for shared-player). */
  maps?: CampaignMap[] | PlayerMap[];
  /** Party PCs for 1-click PC token spawning & ownership lookup. */
  pcs?: PlayerCharacter[];
  /** Monsters / NPCs for 1-click monster/NPC token spawning (GM only). */
  monsters?: Array<{ id?: string; name: string }>;
  npcs?: Array<{ id?: string; name: string }>;
  /** Claimed PC ID when role === 'shared-player' or 'standalone-player'. */
  activePcId?: string | null;
  activePcColor?: string;
  /** Callback for GM / standalone-player to persist updated CampaignMap[] into campaign data. */
  onChangeMaps?: (nextMaps: CampaignMap[]) => void;
  /** Callback for claimed player in /player to move their own PC token via pcWritebacks. */
  onPlayerMoveOwnToken?: (pos: { mapId: string; x: number; y: number; updatedAt: number }) => void;
  /** Callback for claimed player in /player to emit a 3-second live map ping via pcWritebacks. */
  onPlayerEmitPing?: (ping: { id: string; mapId: string; pcId: string; x: number; y: number; color: string; timestamp: number }) => void;
  /** Optional callback to flash the map image as a party handout (GM only). */
  onFlashMapAsHandout?: (map: CampaignMap) => void;
  compact?: boolean;
}

type GmMapTool = 'select' | 'ping' | 'fog-room' | 'fog-poly' | 'fog-brush' | 'add-token' | 'add-trap';

const PRESET_GRID_BACKGROUNDS = [
  { label: 'Dungeon Stone Grid', value: '' },
  {
    label: 'Ancient Crypt (SVG)',
    value:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
          <rect width="800" height="500" fill="#0f172a"/>
          <rect x="60" y="60" width="240" height="180" fill="#1e293b" stroke="#475569" stroke-width="4"/>
          <rect x="300" y="120" width="160" height="60" fill="#1e293b" stroke="#475569" stroke-width="4"/>
          <rect x="460" y="50" width="280" height="220" fill="#1e293b" stroke="#475569" stroke-width="4"/>
          <rect x="460" y="310" width="260" height="140" fill="#1e293b" stroke="#475569" stroke-width="4"/>
          <rect x="570" y="270" width="40" height="40" fill="#1e293b" stroke="#475569" stroke-width="3"/>
          <circle cx="600" cy="160" r="28" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
        </svg>`,
      ),
  },
  {
    label: 'Forest Clearing & Ruins (SVG)',
    value:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
          <rect width="800" height="500" fill="#06281e"/>
          <ellipse cx="400" cy="250" rx="280" ry="180" fill="#113e2f" stroke="#10b981" stroke-opacity="0.3" stroke-width="3"/>
          <circle cx="160" cy="110" r="45" fill="#064e3b"/>
          <circle cx="660" cy="120" r="55" fill="#064e3b"/>
          <circle cx="150" cy="390" r="50" fill="#064e3b"/>
          <circle cx="640" cy="380" r="48" fill="#064e3b"/>
          <rect x="340" y="190" width="120" height="120" fill="#1e293b" stroke="#94a3b8" stroke-width="3" stroke-dasharray="10 6"/>
        </svg>`,
      ),
  },
];

const PING_LIFETIME_MS = 3000;
const LONG_PRESS_MS = 420;

export function TacticalMapStage({
  role,
  maps: rawMapsProp,
  pcs = [],
  monsters = [],
  npcs = [],
  activePcId,
  activePcColor,
  onChangeMaps,
  onPlayerMoveOwnToken,
  onPlayerEmitPing,
  onFlashMapAsHandout,
  compact = false,
}: TacticalMapStageProps) {
  const isGm = role === 'gm';
  const canAuthorMap = role === 'gm' || role === 'standalone-player';

  const normalizedMaps: CampaignMap[] = useMemo(() => {
    if (!Array.isArray(rawMapsProp) || rawMapsProp.length === 0) return [];
    if (role === 'shared-player') {
      // Convert PlayerMap[] into safe display CampaignMap[] (already redacted by projection)
      return (rawMapsProp as PlayerMap[]).map((pm) => ({
        id: pm.id,
        name: pm.name,
        type: pm.type,
        imageUrl: pm.imageUrl,
        width: pm.width || 1600,
        height: pm.height || 1000,
        markers: (pm.markers ?? []) as CampaignMap['markers'],
        layers: (pm.layers ?? []).map((l) => ({
          ...l,
          visible: true,
          visibleToPlayers: true,
        })),
        tokens: pm.tokens ?? [],
        fogEnabled: pm.fogEnabled,
        fogRevealedRegions: pm.fogRevealedRegions ?? [],
        pings: pm.pings ?? [],
        createdAt: 0,
      }));
    }
    return readMaps({ maps: rawMapsProp });
  }, [rawMapsProp, role]);

  const [selectedMapId, setSelectedMapId] = useState<string>('');
  const [tool, setTool] = useState<GmMapTool>('select');
  const [newMapName, setNewMapName] = useState('');
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenColor, setNewTokenColor] = useState('#ef4444');
  const [newTokenSize, setNewTokenSize] = useState(1);
  const [newTokenVisibility, setNewTokenVisibility] = useState<'party' | 'private'>('party');
  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [polygonDraftPoints, setPolygonDraftPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [localTokenOverrides, setLocalTokenOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [localPings, setLocalPings] = useState<MapPing[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [previewPlayerRedaction, setPreviewPlayerRedaction] = useState(false);

  const stageRef = useRef<SVGSVGElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ clientX: number; clientY: number; triggered: boolean } | null>(null);

  const activeMap: CampaignMap | null = useMemo(() => {
    if (normalizedMaps.length === 0) return null;
    return normalizedMaps.find((m) => m.id === selectedMapId) ?? normalizedMaps[0];
  }, [normalizedMaps, selectedMapId]);

  useEffect(() => {
    if (activeMap && activeMap.id !== selectedMapId) {
      setSelectedMapId(activeMap.id);
    }
  }, [activeMap, selectedMapId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Prune expired 3-second map pings automatically
  useEffect(() => {
    const allPings = [...(activeMap?.pings ?? []), ...localPings];
    const hasActive = allPings.some((p) => Date.now() - p.timestamp < PING_LIFETIME_MS);
    if (!hasActive) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      setLocalPings((prev) => prev.filter((p) => now - p.timestamp < PING_LIFETIME_MS));
    }, 250);
    return () => window.clearInterval(timer);
  }, [activeMap?.pings, localPings]);

  const commitMapUpdate = useCallback(
    (updater: (m: CampaignMap) => CampaignMap) => {
      if (!activeMap || !onChangeMaps) return;
      const next = normalizedMaps.map((m) => (m.id === activeMap.id ? updater(m) : m));
      onChangeMaps(next);
    },
    [activeMap, normalizedMaps, onChangeMaps],
  );

  const handleCreateDefaultTacticalMap = () => {
    if (!onChangeMaps) return;
    const layer = makeDefaultLayer(0);
    layer.visibleToPlayers = true;
    const created = makeMap({
      name: newMapName.trim() || 'Tactical Dungeon Stage',
      type: 'dungeon',
      imageUrl: PRESET_GRID_BACKGROUNDS[1].value,
    });
    created.layers = [layer];
    created.fogEnabled = true;
    created.fogRevealedRegions = [
      {
        id: newId('fog'),
        label: 'Room 1: Entry Hall',
        shape: 'rect',
        x: 0.06,
        y: 0.1,
        width: 0.32,
        height: 0.4,
        revealed: true,
      },
      {
        id: newId('fog'),
        label: 'Room 2: Inner Sanctum',
        shape: 'rect',
        x: 0.55,
        y: 0.08,
        width: 0.38,
        height: 0.48,
        revealed: false,
        gmNotes: 'Boss ambush waiting behind the altar.',
      },
    ];
    // Auto-place party PC tokens in the entry hall
    created.tokens = pcs.slice(0, 6).map((pc, idx) => ({
      id: `tok_pc_${pc.id}`,
      label: pc.name || `PC ${idx + 1}`,
      x: 0.14 + (idx % 3) * 0.07,
      y: 0.22 + Math.floor(idx / 3) * 0.1,
      size: 1,
      color: '#38bdf8',
      pcId: pc.id,
      visibility: 'party' as const,
    }));
    const next = [...normalizedMaps, created];
    onChangeMaps(next);
    setSelectedMapId(created.id);
    setNewMapName('');
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMap) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        commitMapUpdate((m) => ({
          ...m,
          imageUrl: reader.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const toNormalizedCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = stageRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
    const y = Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height));
    return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
  };

  // Can the current viewer drag a given token?
  const canDragToken = useCallback(
    (token: MapTokenPin): boolean => {
      if (isGm && !previewPlayerRedaction) return true;
      if (role === 'standalone-player') {
        return !activePcId || token.pcId === activePcId;
      }
      if (role === 'shared-player') {
        // Strict ownership guard: claimed player can drag ONLY their own PC token
        return Boolean(activePcId && token.pcId && token.pcId === activePcId);
      }
      return false;
    },
    [activePcId, isGm, previewPlayerRedaction, role],
  );

  const emitMapPingAt = useCallback(
    (x: number, y: number) => {
      if (!activeMap) return;
      const now = Date.now();
      const pingPcId = activePcId || (isGm ? 'gm' : 'player');
      const pingColor = activePcColor || (isGm ? '#f43f5e' : '#f59e0b');
      const pingId = newId('ping');
      const ping: MapPing = {
        id: pingId,
        pcId: pingPcId,
        x,
        y,
        color: pingColor,
        timestamp: now,
      };
      setLocalPings((prev) => [...prev.filter((p) => now - p.timestamp < PING_LIFETIME_MS), ping]);
      setNowTick(now);

      if (canAuthorMap && onChangeMaps) {
        commitMapUpdate((m) => ({
          ...m,
          pings: [...(m.pings ?? []).filter((p) => now - p.timestamp < PING_LIFETIME_MS), ping],
        }));
      } else if (role === 'shared-player' && activePcId && onPlayerEmitPing) {
        onPlayerEmitPing({
          id: pingId,
          mapId: activeMap.id,
          pcId: activePcId,
          x,
          y,
          color: pingColor,
          timestamp: now,
        });
      }
    },
    [activeMap, activePcColor, activePcId, canAuthorMap, commitMapUpdate, isGm, onChangeMaps, onPlayerEmitPing, role],
  );

  const commitPolygonFogRoom = useCallback(
    (points: Array<{ x: number; y: number }>) => {
      if (!activeMap || points.length < 3) return;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const roomIndex = (activeMap.fogRevealedRegions?.length ?? 0) + 1;
      const polyRegion: MapFogRegion = {
        id: newId('fog_poly'),
        label: newRoomLabel.trim() || `Polygon Zone ${roomIndex}`,
        shape: 'polygon',
        x: minX,
        y: minY,
        width: Math.max(0.05, maxX - minX),
        height: Math.max(0.05, maxY - minY),
        points,
        revealed: false, // hidden by default until revealed by GM
      };
      commitMapUpdate((m) => ({
        ...m,
        fogEnabled: true,
        fogRevealedRegions: [...(m.fogRevealedRegions ?? []), polyRegion],
      }));
      setPolygonDraftPoints([]);
      setNewRoomLabel('');
    },
    [activeMap, commitMapUpdate, newRoomLabel],
  );

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleStagePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeMap || draggingTokenId) return;
    clearLongPressTimer();
    const clientX = e.clientX;
    const clientY = e.clientY;
    longPressOriginRef.current = { clientX, clientY, triggered: false };
    longPressTimerRef.current = window.setTimeout(() => {
      const coords = toNormalizedCoords(clientX, clientY);
      if (coords && longPressOriginRef.current) {
        longPressOriginRef.current.triggered = true;
        emitMapPingAt(coords.x, coords.y);
      }
    }, LONG_PRESS_MS);
  };

  const handleStageClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!activeMap || draggingTokenId) return;
    if (longPressOriginRef.current?.triggered) {
      longPressOriginRef.current.triggered = false;
      return;
    }
    const coords = toNormalizedCoords(e.clientX, e.clientY);
    if (!coords) return;

    // Shared players can single-click empty map canvas (or use Ping / double-click / long-press) to emit a 3s Map Ping
    if (tool === 'ping' || e.detail === 2 || role === 'shared-player') {
      if (tool !== 'fog-poly') {
        emitMapPingAt(coords.x, coords.y);
        return;
      }
    }

    if (!canAuthorMap) return;

    if (tool === 'fog-poly') {
      const nextPts = [...polygonDraftPoints, coords];
      if (e.detail === 2 && nextPts.length >= 3) {
        commitPolygonFogRoom(nextPts);
      } else {
        setPolygonDraftPoints(nextPts);
      }
      return;
    }

    if (tool === 'fog-brush') {
      const brushRegion: MapFogRegion = {
        id: newId('fog_brush'),
        label: `Brush Reveal`,
        shape: 'brush',
        x: Math.max(0, coords.x - 0.09),
        y: Math.max(0, coords.y - 0.09),
        width: 0.18,
        height: 0.18,
        radius: 0.1,
        revealed: true,
      };
      commitMapUpdate((m) => ({
        ...m,
        fogEnabled: true,
        fogRevealedRegions: [...(m.fogRevealedRegions ?? []), brushRegion],
      }));
    } else if (tool === 'fog-room') {
      const roomIndex = (activeMap.fogRevealedRegions?.length ?? 0) + 1;
      const roomRegion: MapFogRegion = {
        id: newId('fog_room'),
        label: newRoomLabel.trim() || `Room ${roomIndex}`,
        shape: 'rect',
        x: Math.max(0, Math.min(0.76, coords.x - 0.12)),
        y: Math.max(0, Math.min(0.76, coords.y - 0.12)),
        width: 0.24,
        height: 0.24,
        revealed: false, // default: hidden until brushed open or revealed room-by-room
      };
      commitMapUpdate((m) => ({
        ...m,
        fogEnabled: true,
        fogRevealedRegions: [...(m.fogRevealedRegions ?? []), roomRegion],
      }));
      setNewRoomLabel('');
    } else if (tool === 'add-token') {
      const token: MapTokenPin = {
        id: newId('tok'),
        label: newTokenLabel.trim() || 'Encounter Token',
        x: coords.x,
        y: coords.y,
        size: newTokenSize,
        color: newTokenColor,
        visibility: newTokenVisibility,
      };
      commitMapUpdate((m) => ({
        ...m,
        tokens: [...(m.tokens ?? []), token],
      }));
    } else if (tool === 'add-trap' && isGm) {
      const trap: MapTrapPin = {
        id: newId('trap'),
        label: newTokenLabel.trim() || 'Hidden Pit Trap',
        x: coords.x,
        y: coords.y,
        dc: 15,
        damage: '2d10 piercing',
        notes: 'GM-only trap marker',
        triggered: false,
      };
      commitMapUpdate((m) => ({
        ...m,
        traps: [...(m.traps ?? []), trap],
      }));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (longPressOriginRef.current) {
      const dx = e.clientX - longPressOriginRef.current.clientX;
      const dy = e.clientY - longPressOriginRef.current.clientY;
      if (Math.hypot(dx, dy) > 8) {
        clearLongPressTimer();
      }
    }
    if (!draggingTokenId || !activeMap) return;
    const coords = toNormalizedCoords(e.clientX, e.clientY);
    if (!coords) return;
    setLocalTokenOverrides((prev) => ({
      ...prev,
      [draggingTokenId]: coords,
    }));
  };

  const handlePointerUp = () => {
    clearLongPressTimer();
    if (!draggingTokenId || !activeMap) return;
    const moved = localTokenOverrides[draggingTokenId];
    const token = (activeMap.tokens ?? []).find((t) => t.id === draggingTokenId);
    setDraggingTokenId(null);

    if (!moved || !token) return;

    if (canAuthorMap && onChangeMaps) {
      commitMapUpdate((m) => ({
        ...m,
        tokens: (m.tokens ?? []).map((t) =>
          t.id === token.id ? { ...t, x: moved.x, y: moved.y } : t,
        ),
      }));
    } else if (
      role === 'shared-player' &&
      activePcId &&
      token.pcId === activePcId &&
      onPlayerMoveOwnToken
    ) {
      onPlayerMoveOwnToken({
        mapId: activeMap.id,
        x: moved.x,
        y: moved.y,
        updatedAt: Date.now(),
      });
    }
  };

  // Visible tokens & fog regions based on whether viewer is GM or Player (or GM previewing player redaction)
  const effectivePlayerView = role !== 'gm' || previewPlayerRedaction;

  const displayedTokens: MapTokenPin[] = useMemo(() => {
    if (!activeMap) return [];
    const base = effectivePlayerView
      ? projectMapTokens(activeMap.tokens)
      : activeMap.tokens ?? [];
    return base.map((t) => {
      const ov = localTokenOverrides[t.id];
      return ov ? { ...t, x: ov.x, y: ov.y } : t;
    });
  }, [activeMap, effectivePlayerView, localTokenOverrides]);

  const displayedFogRegions: MapFogRegion[] = useMemo(() => {
    if (!activeMap) return [];
    return effectivePlayerView
      ? projectFogRegions(activeMap.fogRevealedRegions)
      : activeMap.fogRevealedRegions ?? [];
  }, [activeMap, effectivePlayerView]);

  const activePings: MapPing[] = useMemo(() => {
    if (!activeMap) return [];
    const combined = projectMapPings(activeMap.pings, localPings);
    return combined.filter((p) => nowTick - p.timestamp < PING_LIFETIME_MS);
  }, [activeMap, localPings, nowTick]);

  const spawnPartyPcTokens = () => {
    if (!activeMap || !canAuthorMap) return;
    const existingPcIds = new Set((activeMap.tokens ?? []).map((t) => t.pcId).filter(Boolean));
    const additions: MapTokenPin[] = pcs
      .filter((pc) => !existingPcIds.has(pc.id))
      .map((pc, i) => ({
        id: `tok_pc_${pc.id}`,
        label: pc.name || `PC ${i + 1}`,
        x: 0.15 + ((i % 4) * 0.08),
        y: 0.25 + (Math.floor(i / 4) * 0.1),
        size: 1,
        color: '#38bdf8',
        pcId: pc.id,
        visibility: 'party',
      }));
    if (additions.length === 0) return;
    commitMapUpdate((m) => ({
      ...m,
      tokens: [...(m.tokens ?? []), ...additions],
    }));
  };

  const toggleFogRegionReveal = (regionId: string) => {
    if (!canAuthorMap) return;
    commitMapUpdate((m) => ({
      ...m,
      fogRevealedRegions: (m.fogRevealedRegions ?? []).map((r) =>
        r.id === regionId ? { ...r, revealed: !r.revealed } : r,
      ),
    }));
  };

  const toggleTokenVisibility = (tokenId: string) => {
    if (!isGm) return;
    commitMapUpdate((m) => ({
      ...m,
      tokens: (m.tokens ?? []).map((t) =>
        t.id === tokenId
          ? { ...t, visibility: t.visibility === 'party' ? 'private' : 'party' }
          : t,
      ),
    }));
  };

  const removeToken = (tokenId: string) => {
    if (!canAuthorMap) return;
    commitMapUpdate((m) => ({
      ...m,
      tokens: (m.tokens ?? []).filter((t) => t.id !== tokenId),
    }));
  };

  if (!activeMap) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-[var(--text-primary)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-amber-500">
              🗺️ Tactical Fog-of-War Map Stage
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {canAuthorMap
                ? 'Create a player-safe battlemap or dungeon stage with room-by-room Fog of War, token pins, and live 3-second Map Pings.'
                : 'No player-visible tactical map has been revealed by the GM yet.'}
            </p>
          </div>
          {canAuthorMap && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                placeholder="Map title (e.g. Sunless Citadel)"
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={handleCreateDefaultTacticalMap}
                className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
              >
                + Initialize Tactical Stage
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const fogActive = activeMap.fogEnabled !== false && (
    (activeMap.fogRevealedRegions?.length ?? 0) > 0 || activeMap.fogEnabled === true
  );

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[var(--text-primary)] shadow-lg space-y-3">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
            🗺️ Tactical Stage
          </span>
          {normalizedMaps.length > 1 && (
            <select
              value={activeMap.id}
              onChange={(e) => setSelectedMapId(e.target.value)}
              aria-label="Select tactical map"
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {normalizedMaps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {canAuthorMap && (
            <button
              type="button"
              onClick={handleCreateDefaultTacticalMap}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-amber-500/50"
            >
              + New Stage
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Tool buttons */}
          <button
            type="button"
            onClick={() => setTool('select')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tool === 'select'
                ? 'bg-sky-500/25 text-sky-600 dark:text-sky-200 border border-sky-500/50'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
            }`}
          >
            ✥ Move Token
          </button>
          <button
            type="button"
            onClick={() => setTool('ping')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tool === 'ping'
                ? 'bg-amber-500/25 text-amber-600 dark:text-amber-200 border border-amber-500/50'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
            }`}
            title="Click or long-press map to drop a 3-second animated Map Ping"
          >
            📍 Ping (3s)
          </button>

          {canAuthorMap && (
            <>
              <button
                type="button"
                onClick={() => setTool('fog-brush')}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  tool === 'fog-brush'
                    ? 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-200 border border-emerald-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
              >
                🖌️ Brush Fog Open
              </button>
              <button
                type="button"
                onClick={() => setTool('fog-room')}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  tool === 'fog-room'
                    ? 'bg-purple-500/25 text-purple-600 dark:text-purple-200 border border-purple-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
              >
                ⬛ Add Fog Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setPolygonDraftPoints([]);
                  setTool('fog-poly');
                }}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  tool === 'fog-poly'
                    ? 'bg-indigo-500/25 text-indigo-600 dark:text-indigo-200 border border-indigo-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
                title="Click 3+ vertices on the map to create a vector polygon fog region"
              >
                ⬠ Polygon Fog
              </button>
              <button
                type="button"
                onClick={() => setTool('add-token')}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  tool === 'add-token'
                    ? 'bg-rose-500/25 text-rose-600 dark:text-rose-200 border border-rose-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
              >
                ♟️ Drop Token
              </button>
            </>
          )}

          {isGm && (
            <>
              <button
                type="button"
                onClick={() => setTool('add-trap')}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  tool === 'add-trap'
                    ? 'bg-red-500/25 text-red-600 dark:text-red-200 border border-red-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
              >
                ⚠️ Trap Pin (GM)
              </button>
              <button
                type="button"
                onClick={() => setPreviewPlayerRedaction((v) => !v)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  previewPlayerRedaction
                    ? 'bg-teal-500/25 text-teal-600 dark:text-teal-200 border border-teal-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
              >
                {previewPlayerRedaction ? '👁️ Player Safe View' : '🔒 GM X-Ray View'}
              </button>
              {onFlashMapAsHandout && (
                <button
                  type="button"
                  onClick={() => onFlashMapAsHandout(activeMap)}
                  className="rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
                >
                  ⚡ Flash Map Handout
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Secondary Authoring Sub-bar for GM / Standalone Player */}
      {canAuthorMap && !compact && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-[var(--bg-surface)] p-2 rounded-lg border border-[var(--border-subtle)]">
          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span>Base Map:</span>
            <select
              value={
                PRESET_GRID_BACKGROUNDS.some((p) => p.value === (activeMap.imageUrl || ''))
                  ? activeMap.imageUrl || ''
                  : '__custom__'
              }
              onChange={(e) => {
                if (e.target.value !== '__custom__') {
                  commitMapUpdate((m) => ({ ...m, imageUrl: e.target.value || undefined }));
                }
              }}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {PRESET_GRID_BACKGROUNDS.map((p) => (
                <option key={p.label} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="__custom__">Custom Image / Upload</option>
            </select>
          </label>

          <label className="cursor-pointer rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-amber-500/50">
            📤 Upload Image
            <input
              type="file"
              accept="image/*"
              onChange={handleImageFileUpload}
              className="hidden"
            />
          </label>

          <label className="flex items-center gap-1 text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={activeMap.fogEnabled !== false}
              onChange={(e) =>
                commitMapUpdate((m) => ({ ...m, fogEnabled: e.target.checked }))
              }
            />
            <span>Fog of War Mask</span>
          </label>

          {pcs.length > 0 && (
            <button
              type="button"
              onClick={spawnPartyPcTokens}
              className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-1 text-xs text-sky-600 dark:text-sky-200 hover:bg-sky-500/25"
            >
              + Spawn Party PCs ({pcs.length})
            </button>
          )}

          {(tool === 'fog-room' || tool === 'fog-poly') && (
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <input
                type="text"
                value={newRoomLabel}
                onChange={(e) => setNewRoomLabel(e.target.value)}
                placeholder="Room label (e.g. Vault)"
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-primary)] w-36"
              />
              {tool === 'fog-poly' && (
                <>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Vertices: {polygonDraftPoints.length}
                  </span>
                  <button
                    type="button"
                    disabled={polygonDraftPoints.length < 3}
                    onClick={() => commitPolygonFogRoom(polygonDraftPoints)}
                    className="rounded border border-indigo-500/40 bg-indigo-500/20 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-200 disabled:opacity-40"
                  >
                    ✓ Finish Polygon
                  </button>
                  {polygonDraftPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPolygonDraftPoints([])}
                      className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-muted)]"
                    >
                      Clear
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {tool === 'add-token' && (
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <input
                type="text"
                value={newTokenLabel}
                onChange={(e) => setNewTokenLabel(e.target.value)}
                placeholder="Token label (e.g. Goblin Boss)"
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-primary)] w-36"
              />
              {(monsters.length > 0 || npcs.length > 0) && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setNewTokenLabel(e.target.value);
                  }}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs text-[var(--text-secondary)]"
                >
                  <option value="">Quick Pick NPC/Monster…</option>
                  {monsters.map((mo, i) => (
                    <option key={`m_${i}`} value={mo.name}>
                      👹 {mo.name}
                    </option>
                  ))}
                  {npcs.map((np, i) => (
                    <option key={`n_${i}`} value={np.name}>
                      🧑 {np.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="color"
                value={newTokenColor}
                onChange={(e) => setNewTokenColor(e.target.value)}
                className="h-6 w-7 cursor-pointer rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                title="Token Color"
              />
              <select
                value={newTokenSize}
                onChange={(e) => setNewTokenSize(Number(e.target.value))}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
              >
                <option value={1}>Medium (1x)</option>
                <option value={1.5}>Large (1.5x)</option>
                <option value={2.2}>Huge (2x)</option>
              </select>
              {isGm && (
                <select
                  value={newTokenVisibility}
                  onChange={(e) => setNewTokenVisibility(e.target.value as 'party' | 'private')}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
                >
                  <option value="party">📢 Party Visible</option>
                  <option value="private">🔒 GM Private</option>
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* Interactive SVG Map & Dungeon Stage */}
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-slate-950 select-none">
        <svg
          ref={stageRef}
          viewBox="0 0 1000 625"
          className={`w-full ${compact ? 'max-h-[340px]' : 'max-h-[520px]'} block ${
            tool === 'ping' || tool === 'fog-poly' ? 'cursor-crosshair' : 'cursor-pointer'
          }`}
          onPointerDown={handleStagePointerDown}
          onClick={handleStageClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <defs>
            {/* Tactical 5ft Square Grid Pattern */}
            <pattern id="tacticalGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="rgba(148, 163, 184, 0.16)"
                strokeWidth="1"
              />
            </pattern>

            {/* Fog of War SVG Mask: white = fog covers map, black = revealed cut-out */}
            <mask id={`fogMask_${activeMap.id}`}>
              <rect x="0" y="0" width="1000" height="625" fill="white" />
              {displayedFogRegions
                .filter((r) => r.revealed === true)
                .map((r) => {
                  if (r.shape === 'brush' || r.radius) {
                    const cx = (r.x + (r.width || 0.16) / 2) * 1000;
                    const cy = (r.y + (r.height || 0.16) / 2) * 625;
                    const rad = (r.radius || 0.1) * 800;
                    return <circle key={r.id} cx={cx} cy={cy} r={rad} fill="black" />;
                  }
                  if (r.shape === 'polygon' && Array.isArray(r.points) && r.points.length >= 3) {
                    const pts = r.points.map((pt) => `${pt.x * 1000},${pt.y * 625}`).join(' ');
                    return <polygon key={r.id} points={pts} fill="black" />;
                  }
                  return (
                    <rect
                      key={r.id}
                      x={r.x * 1000}
                      y={r.y * 625}
                      width={Math.max(20, r.width * 1000)}
                      height={Math.max(20, r.height * 625)}
                      rx="8"
                      fill="black"
                    />
                  );
                })}
            </mask>
          </defs>

          {/* Base Background & Image */}
          <rect x="0" y="0" width="1000" height="625" fill="#090d16" />
          {activeMap.imageUrl && (
            <image
              href={activeMap.imageUrl}
              x="0"
              y="0"
              width="1000"
              height="625"
              preserveAspectRatio="xMidYMid slice"
            />
          )}
          <rect x="0" y="0" width="1000" height="625" fill="url(#tacticalGrid)" />

          {/* Fog of War Overlay Layer */}
          {fogActive && (
            <rect
              x="0"
              y="0"
              width="1000"
              height="625"
              fill={effectivePlayerView ? '#020617' : 'rgba(2, 6, 23, 0.72)'}
              mask={`url(#fogMask_${activeMap.id})`}
            />
          )}

          {/* GM-Only Unrevealed Fog Room Outlines & Secret Trap Pins */}
          {!effectivePlayerView &&
            (activeMap.fogRevealedRegions ?? []).map((r) => (
              <g key={`gm_fog_${r.id}`}>
                {r.shape === 'polygon' && Array.isArray(r.points) && r.points.length >= 3 ? (
                  <polygon
                    points={r.points.map((pt) => `${pt.x * 1000},${pt.y * 625}`).join(' ')}
                    fill="none"
                    stroke={r.revealed ? '#10b981' : '#f59e0b'}
                    strokeWidth="2"
                    strokeDasharray={r.revealed ? 'none' : '6 4'}
                  />
                ) : (
                  <rect
                    x={r.x * 1000}
                    y={r.y * 625}
                    width={Math.max(24, r.width * 1000)}
                    height={Math.max(24, r.height * 625)}
                    fill="none"
                    stroke={r.revealed ? '#10b981' : '#f59e0b'}
                    strokeWidth="2"
                    strokeDasharray={r.revealed ? 'none' : '6 4'}
                    rx="6"
                  />
                )}
                {r.label && (
                  <text
                    x={r.x * 1000 + 8}
                    y={r.y * 625 + 18}
                    fill={r.revealed ? '#6ee7b7' : '#fcd34d'}
                    fontSize="12"
                    fontWeight="bold"
                  >
                    {r.revealed ? `🔓 ${r.label}` : `🔒 ${r.label} (Hidden)`}
                  </text>
                )}
              </g>
            ))}

          {/* Active Polygon Fog Authoring Preview */}
          {canAuthorMap && polygonDraftPoints.length > 0 && (
            <g>
              <polyline
                points={polygonDraftPoints.map((pt) => `${pt.x * 1000},${pt.y * 625}`).join(' ')}
                fill="rgba(99, 102, 241, 0.18)"
                stroke="#818cf8"
                strokeWidth="2.5"
                strokeDasharray="5 3"
              />
              {polygonDraftPoints.map((pt, idx) => (
                <circle
                  key={`poly_pt_${idx}`}
                  cx={pt.x * 1000}
                  cy={pt.y * 625}
                  r="5"
                  fill="#c7d2fe"
                  stroke="#4f46e5"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          )}

          {!effectivePlayerView &&
            (activeMap.traps ?? []).map((tr) => (
              <g
                key={tr.id}
                transform={`translate(${tr.x * 1000}, ${tr.y * 625})`}
              >
                <polygon
                  points="0,-16 15,12 -15,12"
                  fill="rgba(239, 68, 68, 0.85)"
                  stroke="#fca5a5"
                  strokeWidth="2"
                />
                <text y="8" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">
                  !
                </text>
                <text
                  y="26"
                  textAnchor="middle"
                  fill="#fca5a5"
                  fontSize="11"
                  fontWeight="600"
                >
                  ⚠️ {tr.label} {tr.dc ? `(DC ${tr.dc})` : ''}
                </text>
              </g>
            ))}

          {/* Interactive Token Pins */}
          {displayedTokens.map((token) => {
            const cx = token.x * 1000;
            const cy = token.y * 625;
            const radius = 18 * (token.size || 1);
            const draggable = canDragToken(token);
            const isOwnPc = Boolean(activePcId && token.pcId === activePcId);
            return (
              <g
                key={token.id}
                transform={`translate(${cx}, ${cy})`}
                className={draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                onPointerDown={(e) => {
                  if (!draggable) return;
                  e.stopPropagation();
                  clearLongPressTimer();
                  setDraggingTokenId(token.id);
                }}
              >
                {isOwnPc && (
                  <circle
                    r={radius + 6}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                )}
                <circle
                  r={radius}
                  fill={token.color || '#38bdf8'}
                  fillOpacity={token.visibility === 'private' ? 0.55 : 0.9}
                  stroke={token.visibility === 'private' ? '#f59e0b' : '#f8fafc'}
                  strokeWidth="2.5"
                  strokeDasharray={token.visibility === 'private' ? '4 2' : 'none'}
                />
                <text
                  y="4"
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize={Math.max(10, Math.min(14, 11 * (token.size || 1)))}
                  fontWeight="bold"
                >
                  {token.label.slice(0, 3).toUpperCase()}
                </text>
                <rect
                  x={-Math.max(32, token.label.length * 3.8)}
                  y={radius + 4}
                  width={Math.max(64, token.label.length * 7.6)}
                  height="16"
                  rx="4"
                  fill="rgba(15, 23, 42, 0.88)"
                />
                <text
                  y={radius + 15}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="11"
                  fontWeight="500"
                >
                  {token.label}
                  {token.visibility === 'private' ? ' (GM)' : ''}
                </text>
              </g>
            );
          })}

          {/* Animated 3-Second Live Map Pings */}
          {activePings.map((ping, idx) => {
            const cx = ping.x * 1000;
            const cy = ping.y * 625;
            const ageMs = Math.max(0, nowTick - ping.timestamp);
            const progress = Math.min(1, ageMs / PING_LIFETIME_MS);
            const ringRadius = 12 + progress * 48;
            const opacity = Math.max(0, 1 - progress);
            return (
              <g key={ping.id || `${ping.pcId}_${ping.timestamp}_${idx}`} transform={`translate(${cx}, ${cy})`}>
                <circle
                  r={ringRadius}
                  fill="none"
                  stroke={ping.color || '#f59e0b'}
                  strokeWidth="3"
                  strokeOpacity={opacity}
                />
                <circle
                  r={8}
                  fill={ping.color || '#f59e0b'}
                  fillOpacity={opacity}
                />
              </g>
            );
          })}
        </svg>

        {/* Bottom Status Overlay */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
          <span>
            {role === 'shared-player'
              ? activePcId
                ? '💡 Drag your own PC token to move, or click / long-press map to emit a 3s Map Ping.'
                : '💡 Claim your PC slot to drag your token, or click / long-press map to Ping.'
              : '💡 Double-click or long-press anywhere to drop a 3s Map Ping. Drag tokens to reposition.'}
          </span>
          <span>
            Tokens: {displayedTokens.length} • Revealed Zones:{' '}
            {displayedFogRegions.filter((r) => r.revealed).length}
          </span>
        </div>
      </div>

      {/* GM Room Reveal & Token Inspector Drawer */}
      {canAuthorMap && !compact && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Fog of War Rooms Control */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                🌫️ Fog-of-War Rooms ({(activeMap.fogRevealedRegions ?? []).length})
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    commitMapUpdate((m) => ({
                      ...m,
                      fogRevealedRegions: (m.fogRevealedRegions ?? []).map((r) => ({
                        ...r,
                        revealed: true,
                      })),
                    }))
                  }
                  className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-300 border border-emerald-500/30"
                >
                  Reveal All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    commitMapUpdate((m) => ({
                      ...m,
                      fogRevealedRegions: (m.fogRevealedRegions ?? []).map((r) => ({
                        ...r,
                        revealed: false,
                      })),
                    }))
                  }
                  className="rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                >
                  Hide All (Default)
                </button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {(activeMap.fogRevealedRegions ?? []).length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Map is hidden under fog by default. Use &ldquo;Add Fog Room&rdquo;, &ldquo;Polygon Fog&rdquo;, or &ldquo;Brush Fog Open&rdquo; to carve revealed areas.
                </p>
              ) : (
                (activeMap.fogRevealedRegions ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-1 text-xs"
                  >
                    <span className="truncate text-[var(--text-primary)]">
                      {r.label || r.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleFogRegionReveal(r.id)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        r.revealed
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {r.revealed ? 'Revealed to Party' : 'Hidden in Fog'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Token Roster & GM Secret Map Notes */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 space-y-2">
            <span className="text-xs font-semibold text-[var(--text-primary)] block">
              ♟️ Stage Tokens ({(activeMap.tokens ?? []).length})
            </span>
            <div className="max-h-24 overflow-y-auto space-y-1">
              {(activeMap.tokens ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-1 text-xs"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="truncate text-[var(--text-primary)]">{t.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isGm && (
                      <button
                        type="button"
                        onClick={() => toggleTokenVisibility(t.id)}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          t.visibility === 'party'
                            ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                        }`}
                      >
                        {t.visibility === 'party' ? 'Party' : 'Private'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeToken(t.id)}
                      className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-600 dark:text-rose-300"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {isGm && (
              <input
                type="text"
                value={activeMap.gmMapNotes ?? ''}
                onChange={(e) =>
                  commitMapUpdate((m) => ({ ...m, gmMapNotes: e.target.value }))
                }
                placeholder="🔒 Secret GM Map Notes / Trap DCs (never projected to /player)…"
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-primary)]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default TacticalMapStage;
