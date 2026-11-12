'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  makeDefaultLayer,
  makeMap,
  newId,
  readMaps,
  type CampaignMap,
  type MapAoeTemplate,
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
import {
  applyAutomatedDamageToCombatant,
  applyAutomatedDamageToPc,
  autoRollMonsterSavePrompt,
  buildAoeSvgGeometry,
  computeTokensInAoe,
  createCombatSavePrompt,
  measureMapDistance,
  type AoeShape,
  type CombatSavePrompt,
  type DamageOutcomeMode,
  type DiagonalDistanceRule,
  type ProjectedSavePrompt,
} from '@/lib/combatAutomation';
import {
  SRD_CORE_MONSTERS,
  getSrdMonsterBySlugOrName,
  instantiateMonsterCombatants,
  rollHitPointsFormula,
  type SrdMonster,
} from '@/lib/srdCompendium';
import { SRD_MONSTER_DRAG_MIME } from '@/components/CompendiumDrawer';
import { rollConcentrationCheck } from '@/lib/diceRoller';
import type { Combatant } from '@/lib/initiative';
import type { AbilityName, PlayerCharacter, RollEvent } from '@/lib/pc/types';

export interface TacticalMapStageProps {
  /** Role of the viewer: 'gm' (full authoring + fog/trap controls), 'standalone-player', or 'shared-player'. */
  role: 'gm' | 'standalone-player' | 'shared-player';
  /** Raw campaign maps (for GM / standalone-player) or projected PlayerMap[] (for shared-player). */
  maps?: CampaignMap[] | PlayerMap[];
  /** Party PCs for 1-click PC token spawning, resistance lookup & automated damage application. */
  pcs?: PlayerCharacter[];
  /** Active encounter combatants for monster save auto-rolls, HP deduction & SRD drop spawning. */
  combatants?: Combatant[];
  /** Monsters / NPCs for 1-click monster/NPC token spawning (GM only). */
  monsters?: Array<{ id?: string; name: string }>;
  npcs?: Array<{ id?: string; name: string }>;
  /** Claimed PC ID when role === 'shared-player' or 'standalone-player'. */
  activePcId?: string | null;
  activePcColor?: string;
  /** Callback for GM / standalone-player to persist updated CampaignMap[] into campaign data. */
  onChangeMaps?: (nextMaps: CampaignMap[]) => void;
  /** Optional callback to persist updated Combatant[] when spawning SRD monsters or applying save/damage. */
  onChangeCombatants?: (nextCombatants: Combatant[]) => void;
  /** Optional callback to persist updated PlayerCharacter[] when applying damage directly. */
  onUpdatePcs?: (nextPcs: PlayerCharacter[]) => void;
  /** Optional callback to broadcast a targeted CombatSavePrompt to `/player` slots. */
  onDispatchSavePrompt?: (prompt: CombatSavePrompt) => void;
  /** Optional custom handler when an SRD monster card is dragged and dropped onto the map stage. */
  onDropSrdMonster?: (
    monster: SrdMonster,
    opts: { x: number; y: number; count: number; rollHp: boolean; hidden: boolean },
  ) => void;
  /** Callback for claimed player in /player to move their own PC token via pcWritebacks. */
  onPlayerMoveOwnToken?: (pos: { mapId: string; x: number; y: number; updatedAt: number }) => void;
  /** Callback for claimed player in /player to emit a 3-second live map ping via pcWritebacks. */
  onPlayerEmitPing?: (ping: {
    id: string;
    mapId: string;
    pcId: string;
    x: number;
    y: number;
    color: string;
    timestamp: number;
  }) => void;
  /** Optional callback to flash the map image as a party handout (GM only). */
  onFlashMapAsHandout?: (map: CampaignMap) => void;
  compact?: boolean;
}

type GmMapTool =
  | 'select'
  | 'ping'
  | 'ruler'
  | 'aoe'
  | 'fog-room'
  | 'fog-poly'
  | 'fog-brush'
  | 'add-token'
  | 'add-trap';

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

const SAVE_AUTOMATION_PRESETS: Array<{
  label: string;
  sourceName: string;
  ability: AbilityName;
  dc: number;
  formula: string;
  avgDamage: number;
  damageType: string;
  halfOnSuccess: boolean;
  aoeShape?: AoeShape;
  aoeSizeFt?: number;
}> = [
  {
    label: '🔥 Fireball (DEX 15 · 8d6)',
    sourceName: 'Fireball',
    ability: 'DEX',
    dc: 15,
    formula: '8d6',
    avgDamage: 28,
    damageType: 'fire',
    halfOnSuccess: true,
    aoeShape: 'sphere',
    aoeSizeFt: 20,
  },
  {
    label: '🔥 Burning Hands (DEX 13 · 3d6)',
    sourceName: 'Burning Hands',
    ability: 'DEX',
    dc: 13,
    formula: '3d6',
    avgDamage: 10,
    damageType: 'fire',
    halfOnSuccess: true,
    aoeShape: 'cone',
    aoeSizeFt: 15,
  },
  {
    label: '⚡ Lightning Bolt (DEX 15 · 8d6)',
    sourceName: 'Lightning Bolt',
    ability: 'DEX',
    dc: 15,
    formula: '8d6',
    avgDamage: 28,
    damageType: 'lightning',
    halfOnSuccess: true,
    aoeShape: 'line',
    aoeSizeFt: 100,
  },
  {
    label: '✨ Sacred Flame (DEX 13 · 1d8)',
    sourceName: 'Sacred Flame',
    ability: 'DEX',
    dc: 13,
    formula: '1d8',
    avgDamage: 5,
    damageType: 'radiant',
    halfOnSuccess: false,
  },
  {
    label: '❄️ Cone of Cold (CON 16 · 8d8)',
    sourceName: 'Cone of Cold',
    ability: 'CON',
    dc: 16,
    formula: '8d8',
    avgDamage: 36,
    damageType: 'cold',
    halfOnSuccess: true,
    aoeShape: 'cone',
    aoeSizeFt: 60,
  },
];

const DAMAGE_TYPE_OPTIONS = [
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'force',
  'psychic',
  'slashing',
  'piercing',
  'bludgeoning',
];

const ABILITY_OPTIONS: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

const SRD_MONSTERS_BY_ID: Map<string, SrdMonster> = new Map(
  SRD_CORE_MONSTERS.map((m) => [m.id, m]),
);

const PING_LIFETIME_MS = 3000;
const LONG_PRESS_MS = 420;

export function TacticalMapStage({
  role,
  maps: rawMapsProp,
  pcs = [],
  combatants = [],
  monsters = [],
  npcs = [],
  activePcId,
  activePcColor,
  onChangeMaps,
  onChangeCombatants,
  onUpdatePcs,
  onDispatchSavePrompt,
  onDropSrdMonster,
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
        gridFeetPerSquare: pm.gridFeetPerSquare ?? 5,
        aoeTemplates: (pm.aoeTemplates ?? []).map((a) => ({
          ...a,
          visibility: 'party' as const,
        })),
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

  // Distance Ruler state
  const [localGridFeet, setLocalGridFeet] = useState<number>(5);
  const [diagonalRule, setDiagonalRule] = useState<DiagonalDistanceRule>('5e-chebyshev');
  const [rulerDragActive, setRulerDragActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  // AoE Template authoring & dragging state
  const [aoeShape, setAoeShape] = useState<AoeShape>('sphere');
  const [aoeSizeFt, setAoeSizeFt] = useState<number>(20);
  const [aoeColor, setAoeColor] = useState<string>('#f97316');
  const [aoeLabel, setAoeLabel] = useState<string>('Fireball');
  const [aoeVisibility, setAoeVisibility] = useState<'party' | 'private'>('party');
  const [localAoeTemplates, setLocalAoeTemplates] = useState<MapAoeTemplate[]>([]);
  const [draggingAoeHandle, setDraggingAoeHandle] = useState<{
    id: string;
    part: 'origin' | 'target';
    isLocal: boolean;
  } | null>(null);

  // SRD drag-drop feedback
  const [dragOverStage, setDragOverStage] = useState(false);
  const [combatLogBanner, setCombatLogBanner] = useState<string | null>(null);

  // Targeted Attack / Save / Automated Damage loop state
  const [selectedTargetTokenIds, setSelectedTargetTokenIds] = useState<string[]>([]);
  const [showCombatBar, setShowCombatBar] = useState(false);
  const [saveSourceName, setSaveSourceName] = useState('Fireball');
  const [saveAbility, setSaveAbility] = useState<AbilityName>('DEX');
  const [saveDc, setSaveDc] = useState<number>(15);
  const [damageFormula, setDamageFormula] = useState('8d6');
  const [rawDamageInput, setRawDamageInput] = useState<number>(28);
  const [damageType, setDamageType] = useState<string>('fire');
  const [halfOnSuccess, setHalfOnSuccess] = useState<boolean>(true);
  const [concentrationAlerts, setConcentrationAlerts] = useState<
    Array<{ pcId: string; pcName: string; spell: string; dc: number }>
  >([]);

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

  const effectiveGridFeetPerSquare = useMemo(() => {
    const fromMap = activeMap?.gridFeetPerSquare;
    if (canAuthorMap && typeof fromMap === 'number' && fromMap > 0) return fromMap;
    return localGridFeet > 0 ? localGridFeet : 5;
  }, [activeMap?.gridFeetPerSquare, canAuthorMap, localGridFeet]);

  const commitMapUpdate = useCallback(
    (updater: (m: CampaignMap) => CampaignMap) => {
      if (!activeMap || !onChangeMaps) return;
      const next = normalizedMaps.map((m) => (m.id === activeMap.id ? updater(m) : m));
      onChangeMaps(next);
    },
    [activeMap, normalizedMaps, onChangeMaps],
  );

  const handleSetGridFeetPerSquare = (feet: number) => {
    setLocalGridFeet(feet);
    if (canAuthorMap && onChangeMaps) {
      commitMapUpdate((m) => ({ ...m, gridFeetPerSquare: feet }));
    }
  };

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
    created.gridFeetPerSquare = 5;
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

  const placeAoeTemplateAt = (x: number, y: number) => {
    if (!activeMap) return;
    const targetX = Math.min(0.96, x + 0.14);
    const targetY = y;
    const created: MapAoeTemplate = {
      id: newId('aoe'),
      shape: aoeShape,
      label: aoeLabel.trim() || `${aoeSizeFt}ft ${aoeShape}`,
      originX: x,
      originY: y,
      targetX,
      targetY,
      sizeFt: aoeSizeFt,
      lineWidthFt: 5,
      color: aoeColor,
      visibility: isGm ? aoeVisibility : 'party',
    };
    if (canAuthorMap && onChangeMaps) {
      commitMapUpdate((m) => ({
        ...m,
        aoeTemplates: [...(m.aoeTemplates ?? []), created],
      }));
    } else {
      setLocalAoeTemplates((prev) => [...prev, created]);
    }
  };

  const removeAoeTemplate = (aoeId: string, isLocal: boolean) => {
    if (isLocal || !canAuthorMap || !onChangeMaps) {
      setLocalAoeTemplates((prev) => prev.filter((a) => a.id !== aoeId));
      return;
    }
    commitMapUpdate((m) => ({
      ...m,
      aoeTemplates: (m.aoeTemplates ?? []).filter((a) => a.id !== aoeId),
    }));
  };

  const handleStagePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeMap || draggingTokenId || draggingAoeHandle) return;
    clearLongPressTimer();

    if (tool === 'ruler') {
      const coords = toNormalizedCoords(e.clientX, e.clientY);
      if (coords) {
        setRulerDragActive(true);
        setRulerPoints({
          startX: coords.x,
          startY: coords.y,
          endX: coords.x,
          endY: coords.y,
        });
      }
      return;
    }

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
    if (!activeMap || draggingTokenId || draggingAoeHandle) return;
    if (tool === 'ruler') return;
    if (longPressOriginRef.current?.triggered) {
      longPressOriginRef.current.triggered = false;
      return;
    }
    const coords = toNormalizedCoords(e.clientX, e.clientY);
    if (!coords) return;

    if (tool === 'aoe') {
      placeAoeTemplateAt(coords.x, coords.y);
      return;
    }

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

    if (rulerDragActive && activeMap) {
      const coords = toNormalizedCoords(e.clientX, e.clientY);
      if (coords) {
        setRulerPoints((prev) =>
          prev ? { ...prev, endX: coords.x, endY: coords.y } : null,
        );
      }
      return;
    }

    if (draggingAoeHandle && activeMap) {
      const coords = toNormalizedCoords(e.clientX, e.clientY);
      if (!coords) return;
      const updateTemplate = (tpl: MapAoeTemplate): MapAoeTemplate => {
        if (tpl.id !== draggingAoeHandle.id) return tpl;
        if (draggingAoeHandle.part === 'origin') {
          const dx = coords.x - tpl.originX;
          const dy = coords.y - tpl.originY;
          return {
            ...tpl,
            originX: coords.x,
            originY: coords.y,
            targetX: Math.max(0.01, Math.min(0.99, tpl.targetX + dx)),
            targetY: Math.max(0.01, Math.min(0.99, tpl.targetY + dy)),
          };
        }
        return {
          ...tpl,
          targetX: coords.x,
          targetY: coords.y,
        };
      };

      if (draggingAoeHandle.isLocal || !canAuthorMap || !onChangeMaps) {
        setLocalAoeTemplates((prev) => prev.map(updateTemplate));
      } else {
        commitMapUpdate((m) => ({
          ...m,
          aoeTemplates: (m.aoeTemplates ?? []).map(updateTemplate),
        }));
      }
      return;
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
    if (rulerDragActive) {
      setRulerDragActive(false);
      return;
    }
    if (draggingAoeHandle) {
      setDraggingAoeHandle(null);
      return;
    }
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

  // Drag-and-drop SRD Monster directly onto TacticalMapStage
  const handleStageDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canAuthorMap) return;
    if (Array.from(e.dataTransfer.types).includes(SRD_MONSTER_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!dragOverStage) setDragOverStage(true);
    }
  };

  const handleStageDragLeave = () => {
    if (dragOverStage) setDragOverStage(false);
  };

  const handleStageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setDragOverStage(false);
    if (!canAuthorMap || !activeMap) return;
    const rawPayload = e.dataTransfer.getData(SRD_MONSTER_DRAG_MIME);
    if (!rawPayload) return;
    e.preventDefault();

    let monster: SrdMonster | undefined;
    let count = 1;
    let rollHp = true;
    let hidden = isGm ? true : false;
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && typeof parsed === 'object') {
        monster =
          getSrdMonsterBySlugOrName(parsed.slug || parsed.id || parsed.name || '') ||
          (parsed.monster && typeof parsed.monster.name === 'string' ? parsed.monster : undefined);
        if (typeof parsed.count === 'number') count = Math.max(1, Math.min(12, parsed.count));
        if (typeof parsed.rollHp === 'boolean') rollHp = parsed.rollHp;
        if (typeof parsed.hidden === 'boolean') hidden = parsed.hidden;
      }
    } catch {
      monster = getSrdMonsterBySlugOrName(rawPayload);
    }

    if (!monster) return;
    const coords = toNormalizedCoords(e.clientX, e.clientY) ?? { x: 0.5, y: 0.5 };

    if (onDropSrdMonster) {
      onDropSrdMonster(monster, { x: coords.x, y: coords.y, count, rollHp, hidden });
      setCombatLogBanner(
        `Spawned ${count}x ${monster.name} at map drop (${hidden ? '🔒 Private' : '📢 Party'})`,
      );
      return;
    }

    const spawned = instantiateMonsterCombatants(monster, {
      count,
      rollHp,
      hidden,
      existingCombatants: combatants,
      existingTokens: activeMap.tokens ?? [],
      baseX: coords.x,
      baseY: coords.y,
    });

    if (onChangeMaps) {
      commitMapUpdate((m) => ({
        ...m,
        tokens: [...(m.tokens ?? []), ...spawned.tokens],
      }));
    }
    if (onChangeCombatants) {
      onChangeCombatants([...combatants, ...spawned.combatants]);
    }
    setCombatLogBanner(
      `Spawned ${spawned.tokens.map((t) => t.label).join(', ')} (${hidden ? '🔒 Private' : '📢 Party'})`,
    );
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

  const displayedAoeTemplates: Array<MapAoeTemplate & { isLocal?: boolean }> = useMemo(() => {
    if (!activeMap) return [];
    const mapAoes = (activeMap.aoeTemplates ?? [])
      .filter((a) => !effectivePlayerView || a.visibility !== 'private')
      .map((a) => ({ ...a, isLocal: false }));
    const locals = localAoeTemplates.map((a) => ({ ...a, isLocal: true }));
    return [...mapAoes, ...locals];
  }, [activeMap, effectivePlayerView, localAoeTemplates]);

  // Real-time AoE hit-testing across displayed tokens
  const aoeAffectedTokenIds: Set<string> = useMemo(() => {
    const hit = new Set<string>();
    for (const tpl of displayedAoeTemplates) {
      const ids = computeTokensInAoe(
        {
          ...tpl,
          gridFeetPerSquare: effectiveGridFeetPerSquare,
        },
        displayedTokens,
      );
      for (const id of ids) hit.add(id);
    }
    return hit;
  }, [displayedAoeTemplates, displayedTokens, effectiveGridFeetPerSquare]);

  const activeRulerMeasurement = useMemo(() => {
    if (!rulerPoints) return null;
    return measureMapDistance({
      ...rulerPoints,
      gridFeetPerSquare: effectiveGridFeetPerSquare,
      diagonalRule,
    });
  }, [diagonalRule, effectiveGridFeetPerSquare, rulerPoints]);

  const activePings: MapPing[] = useMemo(() => {
    if (!activeMap) return [];
    const combined = projectMapPings(activeMap.pings, localPings);
    return combined.filter((p) => nowTick - p.timestamp < PING_LIFETIME_MS);
  }, [activeMap, localPings, nowTick]);

  // Resolve selected target tokens to PCs and Combatants
  const resolvedTargets = useMemo(() => {
    const selectedSet = new Set(selectedTargetTokenIds);
    const selectedTokens = displayedTokens.filter((t) => selectedSet.has(t.id));
    const targetPcs: PlayerCharacter[] = [];
    const targetCombatants: Combatant[] = [];
    const seenPcIds = new Set<string>();
    const seenCombIds = new Set<string>();

    for (const tok of selectedTokens) {
      if (tok.pcId) {
        const pc = pcs.find((p) => p.id === tok.pcId);
        if (pc && !seenPcIds.has(pc.id)) {
          seenPcIds.add(pc.id);
          targetPcs.push(pc);
        }
        continue;
      }
      const labelNorm = tok.label.trim().toLowerCase();
      const comb = combatants.find(
        (c) => c.id === tok.id || c.name.trim().toLowerCase() === labelNorm,
      );
      if (comb && !seenCombIds.has(comb.id)) {
        seenCombIds.add(comb.id);
        targetCombatants.push(comb);
      }
    }

    return { selectedTokens, targetPcs, targetCombatants };
  }, [combatants, displayedTokens, pcs, selectedTargetTokenIds]);

  const toggleSelectTargetToken = (tokenId: string) => {
    setSelectedTargetTokenIds((prev) =>
      prev.includes(tokenId) ? prev.filter((id) => id !== tokenId) : [...prev, tokenId],
    );
    if (!showCombatBar && canAuthorMap) {
      setShowCombatBar(true);
    }
  };

  const selectAllAoeTokens = () => {
    const ids = Array.from(aoeAffectedTokenIds);
    setSelectedTargetTokenIds(ids);
    if (ids.length > 0 && canAuthorMap) {
      setShowCombatBar(true);
    }
  };

  const handleRollFormulaDamage = () => {
    const rolled = rollHitPointsFormula(damageFormula, rawDamageInput || 10);
    setRawDamageInput(rolled);
    setCombatLogBanner(`🎲 Rolled ${damageFormula} = ${rolled} ${damageType} damage`);
  };

  const handleDispatchSaveOrAutoRoll = () => {
    const { targetPcs, targetCombatants } = resolvedTargets;
    if (targetPcs.length === 0 && targetCombatants.length === 0) {
      setCombatLogBanner('Select at least one PC or combatant token on the stage first.');
      return;
    }

    let prompt = createCombatSavePrompt({
      sourceName: saveSourceName,
      ability: saveAbility,
      dc: saveDc,
      baseDamage: rawDamageInput,
      damageFormula,
      damageType,
      halfOnSuccess,
      targetPcIds: targetPcs.map((p) => p.id),
      targetCombatantIds: targetCombatants.map((c) => c.id),
    });

    const summaryParts: string[] = [];

    if (targetCombatants.length > 0 && onChangeCombatants) {
      const { updatedCombatants, updatedPrompt, logLines } = autoRollMonsterSavePrompt({
        prompt,
        combatants,
        monstersById: SRD_MONSTERS_BY_ID,
      });
      prompt = updatedPrompt;
      onChangeCombatants(updatedCombatants);
      summaryParts.push(...logLines);
    }

    if (targetPcs.length > 0 && onDispatchSavePrompt) {
      onDispatchSavePrompt(prompt);
      summaryParts.push(
        `⚡ Projected ${saveAbility} Save (DC ${saveDc} vs. ${saveSourceName}) to ${targetPcs.map((p) => p.name).join(', ')}`,
      );
    } else if (targetPcs.length > 0 && !onDispatchSavePrompt && onUpdatePcs) {
      summaryParts.push(
        `Ready to apply damage to ${targetPcs.map((p) => p.name).join(', ')} — use Full / Half / Zero below.`,
      );
    }

    setCombatLogBanner(summaryParts.join(' · ') || 'Save prompt processed.');
  };

  const handleDirectDamageApplication = (outcome: DamageOutcomeMode) => {
    const { targetPcs, targetCombatants } = resolvedTargets;
    if (targetPcs.length === 0 && targetCombatants.length === 0) {
      setCombatLogBanner('Select at least one target token first.');
      return;
    }

    const logParts: string[] = [];
    const newConcAlerts: Array<{ pcId: string; pcName: string; spell: string; dc: number }> = [];

    if (targetPcs.length > 0 && onUpdatePcs) {
      const targetPcMap = new Map<string, PlayerCharacter>();
      for (const pc of targetPcs) {
        const { updatedPc, result } = applyAutomatedDamageToPc(pc, {
          rawDamage: rawDamageInput,
          outcome,
          damageType,
        });
        targetPcMap.set(pc.id, updatedPc);
        const defNote =
          result.defenseApplied !== 'none' ? ` [${result.defenseApplied}]` : '';
        logParts.push(
          `${pc.name}: -${result.finalDamage} HP${defNote} (HP ${result.hpAfter}/${updatedPc.hp.max})`,
        );
        if (result.concentrationCheckRequired && result.concentrationDc !== null) {
          newConcAlerts.push({
            pcId: pc.id,
            pcName: pc.name,
            spell: result.concentrationSpell || 'Concentration',
            dc: result.concentrationDc,
          });
        }
      }
      onUpdatePcs(pcs.map((p) => targetPcMap.get(p.id) ?? p));
    }

    if (targetCombatants.length > 0 && onChangeCombatants) {
      const targetCombMap = new Map<string, Combatant>();
      for (const comb of targetCombatants) {
        const mon = comb.sourceMonsterId
          ? SRD_MONSTERS_BY_ID.get(comb.sourceMonsterId)
          : undefined;
        const { updatedCombatant, result } = applyAutomatedDamageToCombatant(comb, {
          rawDamage: rawDamageInput,
          outcome,
          damageType,
          monsterStatblock: mon,
        });
        targetCombMap.set(comb.id, updatedCombatant);
        const defNote =
          result.defenseApplied !== 'none' ? ` [${result.defenseApplied}]` : '';
        logParts.push(
          `${comb.name}: -${result.finalDamage} HP${defNote} (HP ${result.hpAfter}/${updatedCombatant.hp.max})`,
        );
      }
      onChangeCombatants(combatants.map((c) => targetCombMap.get(c.id) ?? c));
    }

    if (newConcAlerts.length > 0) {
      setConcentrationAlerts(newConcAlerts);
    }
    setCombatLogBanner(
      logParts.join(' · ') || `Applied ${outcome.toUpperCase()} damage.`,
    );
  };

  const spawnPartyPcTokens = () => {
    if (!activeMap || !canAuthorMap) return;
    const existingPcIds = new Set((activeMap.tokens ?? []).map((t) => t.pcId).filter(Boolean));
    const additions: MapTokenPin[] = pcs
      .filter((pc) => !existingPcIds.has(pc.id))
      .map((pc, i) => ({
        id: `tok_pc_${pc.id}`,
        label: pc.name || `PC ${i + 1}`,
        x: 0.15 + (i % 4) * 0.08,
        y: 0.25 + Math.floor(i / 4) * 0.1,
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
    setSelectedTargetTokenIds((prev) => prev.filter((id) => id !== tokenId));
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
                ? 'Create a player-safe battlemap or dungeon stage with room-by-room Fog of War, AoE templates, distance ruler, and live 3-second Map Pings.'
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

  const fogActive =
    activeMap.fogEnabled !== false &&
    ((activeMap.fogRevealedRegions?.length ?? 0) > 0 || activeMap.fogEnabled === true);

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
            title="Drag tokens to move; Shift+Click tokens to target"
          >
            ✥ Move / Target
          </button>
          <button
            type="button"
            onClick={() => setTool('ruler')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tool === 'ruler'
                ? 'bg-cyan-500/25 text-cyan-600 dark:text-cyan-200 border border-cyan-500/50'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
            }`}
            title="Drag across grid squares to measure distance"
          >
            📏 Ruler ({effectiveGridFeetPerSquare}ft)
          </button>
          <button
            type="button"
            onClick={() => setTool('aoe')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tool === 'aoe'
                ? 'bg-orange-500/25 text-orange-600 dark:text-orange-200 border border-orange-500/50'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
            }`}
            title="Drop & aim Sphere, Cone, Cube, or Line spell AoE overlays"
          >
            💥 AoE
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
                onClick={() => setShowCombatBar((v) => !v)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  showCombatBar || selectedTargetTokenIds.length > 0
                    ? 'bg-rose-500/25 text-rose-600 dark:text-rose-200 border border-rose-500/50'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
                title="Open Targeted Save Prompt & Automated Damage panel"
              >
                ⚡ Save / Damage
                {selectedTargetTokenIds.length > 0 ? ` (${selectedTargetTokenIds.length})` : ''}
              </button>
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

      {/* Ruler Controls Sub-bar (Available to ALL roles when tool === 'ruler') */}
      {tool === 'ruler' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-cyan-600 dark:text-cyan-200">
              📏 Grid Distance Ruler:
            </span>
            <label className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span>Scale:</span>
              <select
                value={effectiveGridFeetPerSquare}
                onChange={(e) => handleSetGridFeetPerSquare(Number(e.target.value))}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]"
              >
                <option value={5}>5 ft / square</option>
                <option value={10}>10 ft / square</option>
                <option value={15}>15 ft / square</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span>Diagonals:</span>
              <select
                value={diagonalRule}
                onChange={(e) => setDiagonalRule(e.target.value as DiagonalDistanceRule)}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]"
              >
                <option value="5e-chebyshev">5e Standard (1 sq)</option>
                <option value="5-10-5">DMG Variant (5-10-5)</option>
                <option value="euclidean">True Euclidean</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            {activeRulerMeasurement ? (
              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-200">
                {activeRulerMeasurement.label}
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">
                Drag across map squares to measure range
              </span>
            )}
            {rulerPoints && (
              <button
                type="button"
                onClick={() => setRulerPoints(null)}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* AoE Template Sub-bar */}
      {tool === 'aoe' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-orange-600 dark:text-orange-200">
              💥 Spell AoE Overlay:
            </span>
            <select
              value={aoeShape}
              onChange={(e) => setAoeShape(e.target.value as AoeShape)}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]"
            >
              <option value="sphere">◯ Sphere / Radius</option>
              <option value="cone">◁ Cone</option>
              <option value="cube">▢ Cube</option>
              <option value="line">═ Line (5ft wide)</option>
            </select>
            <select
              value={aoeSizeFt}
              onChange={(e) => setAoeSizeFt(Number(e.target.value))}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]"
            >
              <option value={10}>10 ft</option>
              <option value={15}>15 ft</option>
              <option value={20}>20 ft</option>
              <option value={30}>30 ft</option>
              <option value={40}>40 ft</option>
              <option value={60}>60 ft</option>
              <option value={100}>100 ft</option>
            </select>
            <input
              type="text"
              value={aoeLabel}
              onChange={(e) => setAoeLabel(e.target.value)}
              placeholder="Spell label (e.g. Fireball)"
              className="w-32 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-primary)]"
            />
            <input
              type="color"
              value={aoeColor}
              onChange={(e) => setAoeColor(e.target.value)}
              className="h-6 w-7 cursor-pointer rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
              title="AoE Overlay Color"
            />
            {isGm && (
              <select
                value={aoeVisibility}
                onChange={(e) => setAoeVisibility(e.target.value as 'party' | 'private')}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]"
              >
                <option value="party">📢 Party Visible</option>
                <option value="private">🔒 GM Preview Only</option>
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-secondary)]">
              Hit Tokens: <strong>{aoeAffectedTokenIds.size}</strong>
            </span>
            {canAuthorMap && aoeAffectedTokenIds.size > 0 && (
              <button
                type="button"
                onClick={selectAllAoeTokens}
                className="rounded border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-200 hover:bg-rose-500/30"
              >
                🎯 Target {aoeAffectedTokenIds.size} in AoE
              </button>
            )}
            {displayedAoeTemplates.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLocalAoeTemplates([]);
                  if (canAuthorMap && onChangeMaps) {
                    commitMapUpdate((m) => ({ ...m, aoeTemplates: [] }));
                  }
                }}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
              >
                Clear AoEs ({displayedAoeTemplates.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Targeted Attack / Save / Automated Damage Bar */}
      {canAuthorMap && (showCombatBar || selectedTargetTokenIds.length > 0) && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/5 p-2.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-rose-500">
                ⚡ Prompt Save / Automated Damage
              </span>
              <select
                value=""
                onChange={(e) => {
                  const preset = SAVE_AUTOMATION_PRESETS.find((p) => p.label === e.target.value);
                  if (!preset) return;
                  setSaveSourceName(preset.sourceName);
                  setSaveAbility(preset.ability);
                  setSaveDc(preset.dc);
                  setDamageFormula(preset.formula);
                  setRawDamageInput(preset.avgDamage);
                  setDamageType(preset.damageType);
                  setHalfOnSuccess(preset.halfOnSuccess);
                  if (preset.aoeShape) setAoeShape(preset.aoeShape);
                  if (preset.aoeSizeFt) setAoeSizeFt(preset.aoeSizeFt);
                  setAoeLabel(preset.sourceName);
                }}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
              >
                <option value="">Quick Spell / Breath Preset…</option>
                {SAVE_AUTOMATION_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
              {aoeAffectedTokenIds.size > 0 && (
                <button
                  type="button"
                  onClick={selectAllAoeTokens}
                  className="rounded border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-600 dark:text-orange-200"
                >
                  Select {aoeAffectedTokenIds.size} in AoE
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {selectedTargetTokenIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTargetTokenIds([])}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                >
                  Clear Targets ({selectedTargetTokenIds.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCombatBar(false)}
                className="rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Target Token Pills */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-[var(--text-muted)] mr-1">Targets:</span>
            {displayedTokens.length === 0 ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                Drop or spawn tokens on stage to target
              </span>
            ) : (
              displayedTokens.map((t) => {
                const selected = selectedTargetTokenIds.includes(t.id);
                const inAoe = aoeAffectedTokenIds.has(t.id);
                return (
                  <button
                    key={`tgt_${t.id}`}
                    type="button"
                    onClick={() => toggleSelectTargetToken(t.id)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium border transition ${
                      selected
                        ? 'bg-rose-500/25 text-rose-600 dark:text-rose-200 border-rose-500/60'
                        : inAoe
                        ? 'bg-orange-500/15 text-orange-600 dark:text-orange-200 border-orange-500/40'
                        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {selected ? '🎯 ' : inAoe ? '💥 ' : ''}
                    {t.label}
                  </button>
                );
              })
            )}
          </div>

          {/* Save & Damage Inputs + 1-Tap Execution */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <input
              type="text"
              value={saveSourceName}
              onChange={(e) => setSaveSourceName(e.target.value)}
              placeholder="Effect (e.g. Fireball)"
              className="w-28 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-primary)]"
            />
            <select
              value={saveAbility}
              onChange={(e) => setSaveAbility(e.target.value as AbilityName)}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
            >
              {ABILITY_OPTIONS.map((ab) => (
                <option key={ab} value={ab}>
                  {ab} Save
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span>DC</span>
              <input
                type="number"
                min={1}
                max={40}
                value={saveDc}
                onChange={(e) => setSaveDc(Number(e.target.value) || 10)}
                className="w-14 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
              />
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={damageFormula}
                onChange={(e) => setDamageFormula(e.target.value)}
                placeholder="8d6"
                className="w-16 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs font-mono text-[var(--text-primary)]"
                title="Dice formula for quick damage roll"
              />
              <button
                type="button"
                onClick={handleRollFormulaDamage}
                className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-200 hover:bg-amber-500/25"
              >
                🎲 Roll
              </button>
            </div>
            <label className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span>Dmg</span>
              <input
                type="number"
                min={0}
                max={999}
                value={rawDamageInput}
                onChange={(e) => setRawDamageInput(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs font-semibold text-[var(--text-primary)]"
              />
            </label>
            <select
              value={damageType}
              onChange={(e) => setDamageType(e.target.value)}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
            >
              {DAMAGE_TYPE_OPTIONS.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={halfOnSuccess}
                onChange={(e) => setHalfOnSuccess(e.target.checked)}
              />
              <span>Half on save</span>
            </label>

            <div className="flex flex-wrap items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={handleDispatchSaveOrAutoRoll}
                className="rounded bg-amber-500/25 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200 border border-amber-500/50 hover:bg-amber-500/35"
                title="Projects interactive Save Banner to targeted `/player` slots and auto-rolls saves for targeted GM monsters"
              >
                ⚡ Prompt Save / Auto-Roll
              </button>
              <button
                type="button"
                onClick={() => handleDirectDamageApplication('full')}
                className="rounded bg-rose-500/25 px-2 py-1 text-xs font-semibold text-rose-700 dark:text-rose-200 border border-rose-500/50 hover:bg-rose-500/35"
                title="Apply Full damage (respecting evaluateCharacterSheet resistances/immunities & tempHp first)"
              >
                Full
              </button>
              <button
                type="button"
                onClick={() => handleDirectDamageApplication('half')}
                className="rounded bg-orange-500/20 px-2 py-1 text-xs font-semibold text-orange-700 dark:text-orange-200 border border-orange-500/40 hover:bg-orange-500/30"
                title="Apply Half damage"
              >
                Half
              </button>
              <button
                type="button"
                onClick={() => handleDirectDamageApplication('zero')}
                className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30"
                title="Apply Zero damage (evaded / saved)"
              >
                Zero
              </button>
            </div>
          </div>

          {concentrationAlerts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-purple-500/40 bg-purple-500/15 px-2.5 py-1.5 text-[11px] text-purple-700 dark:text-purple-200">
              <div className="flex flex-wrap items-center gap-2">
                {concentrationAlerts.map((alert) => (
                  <span key={`${alert.pcId}_${alert.dc}`}>
                    🧠 <strong>{alert.pcName}</strong> is concentrating on{' '}
                    <em>{alert.spell}</em> — must roll <strong>CON Save DC {alert.dc}</strong>!
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setConcentrationAlerts([])}
                className="text-[10px] underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {combatLogBanner && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-200">
          <span className="truncate">{combatLogBanner}</span>
          <button
            type="button"
            onClick={() => setCombatLogBanner(null)}
            className="text-[11px] opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

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
      <div
        onDragOver={handleStageDragOver}
        onDragLeave={handleStageDragLeave}
        onDrop={handleStageDrop}
        className={`relative overflow-hidden rounded-xl border ${
          dragOverStage
            ? 'border-amber-400 ring-2 ring-amber-400/50'
            : 'border-[var(--border-subtle)]'
        } bg-slate-950 select-none`}
      >
        {dragOverStage && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
            <span className="rounded-full bg-amber-500/90 px-3 py-1 text-xs font-bold text-slate-950 shadow-lg">
              👹 Drop SRD Monster to Spawn Combatant + Token Here
            </span>
          </div>
        )}
        <svg
          ref={stageRef}
          viewBox="0 0 1000 625"
          className={`w-full ${compact ? 'max-h-[340px]' : 'max-h-[520px]'} block ${
            tool === 'ping' || tool === 'fog-poly' || tool === 'ruler' || tool === 'aoe'
              ? 'cursor-crosshair'
              : 'cursor-pointer'
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

          {/* Draggable Spell AoE Overlays */}
          {displayedAoeTemplates.map((tpl) => {
            const geom = buildAoeSvgGeometry({
              ...tpl,
              gridFeetPerSquare: effectiveGridFeetPerSquare,
            });
            const strokeColor = tpl.color || '#f97316';
            const canDragThisAoe = Boolean(tpl.isLocal || canAuthorMap);
            return (
              <g key={tpl.id}>
                {geom.kind === 'circle' && (
                  <circle
                    cx={geom.cx}
                    cy={geom.cy}
                    r={geom.r}
                    fill={strokeColor}
                    fillOpacity={0.22}
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    strokeDasharray={tpl.visibility === 'private' ? '6 4' : 'none'}
                  />
                )}
                {geom.kind === 'rect' && (
                  <rect
                    x={geom.x}
                    y={geom.y}
                    width={geom.width}
                    height={geom.height}
                    fill={strokeColor}
                    fillOpacity={0.22}
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    strokeDasharray={tpl.visibility === 'private' ? '6 4' : 'none'}
                  />
                )}
                {geom.kind === 'polygon' && (
                  <polygon
                    points={geom.points}
                    fill={strokeColor}
                    fillOpacity={0.24}
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    strokeDasharray={tpl.visibility === 'private' ? '6 4' : 'none'}
                  />
                )}
                {/* AoE Label */}
                <text
                  x={geom.originPx.x}
                  y={Math.max(18, geom.originPx.y - 12)}
                  textAnchor="middle"
                  fill="#fff7ed"
                  fontSize="11"
                  fontWeight="bold"
                >
                  💥 {tpl.label || `${tpl.sizeFt}ft ${tpl.shape}`}
                  {tpl.visibility === 'private' ? ' (GM)' : ''}
                </text>

                {canDragThisAoe && (
                  <>
                    {/* Draggable Origin Handle */}
                    <circle
                      cx={geom.originPx.x}
                      cy={geom.originPx.y}
                      r="7"
                      fill="#fff"
                      stroke={strokeColor}
                      strokeWidth="2.5"
                      className="cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        clearLongPressTimer();
                        setDraggingAoeHandle({
                          id: tpl.id,
                          part: 'origin',
                          isLocal: Boolean(tpl.isLocal),
                        });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        removeAoeTemplate(tpl.id, Boolean(tpl.isLocal));
                      }}
                    />
                    {/* Draggable Aim / Direction Handle for Cones & Lines */}
                    {(tpl.shape === 'cone' || tpl.shape === 'line') && (
                      <circle
                        cx={geom.handlePx.x}
                        cy={geom.handlePx.y}
                        r="6"
                        fill={strokeColor}
                        stroke="#fff"
                        strokeWidth="2"
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          clearLongPressTimer();
                          setDraggingAoeHandle({
                            id: tpl.id,
                            part: 'target',
                            isLocal: Boolean(tpl.isLocal),
                          });
                        }}
                      />
                    )}
                  </>
                )}
              </g>
            );
          })}

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
            const isInAoe = aoeAffectedTokenIds.has(token.id);
            const isTargeted = selectedTargetTokenIds.includes(token.id);

            return (
              <g
                key={token.id}
                transform={`translate(${cx}, ${cy})`}
                className={draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                onPointerDown={(e) => {
                  if (e.shiftKey && canAuthorMap) {
                    e.stopPropagation();
                    toggleSelectTargetToken(token.id);
                    return;
                  }
                  if (!draggable || tool === 'ruler') return;
                  e.stopPropagation();
                  clearLongPressTimer();
                  setDraggingTokenId(token.id);
                }}
              >
                {isInAoe && (
                  <circle
                    r={radius + 10}
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth="2.5"
                    strokeDasharray="5 3"
                  />
                )}
                {isTargeted && (
                  <circle
                    r={radius + 6}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="3"
                  />
                )}
                {isOwnPc && !isTargeted && (
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

          {/* Distance Ruler Line & Measurement Pill */}
          {rulerPoints && activeRulerMeasurement && (
            <g pointerEvents="none">
              <line
                x1={rulerPoints.startX * 1000}
                y1={rulerPoints.startY * 625}
                x2={rulerPoints.endX * 1000}
                y2={rulerPoints.endY * 625}
                stroke="#22d3ee"
                strokeWidth="3"
                strokeDasharray="8 5"
              />
              <circle
                cx={rulerPoints.startX * 1000}
                cy={rulerPoints.startY * 625}
                r="6"
                fill="#06b6d4"
                stroke="#fff"
                strokeWidth="2"
              />
              <circle
                cx={rulerPoints.endX * 1000}
                cy={rulerPoints.endY * 625}
                r="6"
                fill="#22d3ee"
                stroke="#fff"
                strokeWidth="2"
              />
              <g
                transform={`translate(${
                  ((rulerPoints.startX + rulerPoints.endX) / 2) * 1000
                }, ${Math.max(26, ((rulerPoints.startY + rulerPoints.endY) / 2) * 625 - 14)})`}
              >
                <rect
                  x="-64"
                  y="-14"
                  width="128"
                  height="22"
                  rx="6"
                  fill="rgba(8, 51, 68, 0.94)"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                />
                <text
                  y="1"
                  textAnchor="middle"
                  fill="#ecfeff"
                  fontSize="12"
                  fontWeight="bold"
                >
                  📏 {activeRulerMeasurement.label}
                </text>
              </g>
            </g>
          )}

          {/* Animated 3-Second Live Map Pings */}
          {activePings.map((ping, idx) => {
            const cx = ping.x * 1000;
            const cy = ping.y * 625;
            const ageMs = Math.max(0, nowTick - ping.timestamp);
            const progress = Math.min(1, ageMs / PING_LIFETIME_MS);
            const ringRadius = 12 + progress * 48;
            const opacity = Math.max(0, 1 - progress);
            return (
              <g
                key={ping.id || `${ping.pcId}_${ping.timestamp}_${idx}`}
                transform={`translate(${cx}, ${cy})`}
              >
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
                ? '💡 Drag your PC token to move, use 📏 Ruler to measure range, or click map to Ping.'
                : '💡 Claim your PC slot to drag your token, use 📏 Ruler, or click map to Ping.'
              : '💡 Shift+Click tokens to target · Drag SRD Monsters onto map · Double-click AoE handle to remove.'}
          </span>
          <span>
            Tokens: {displayedTokens.length} • AoEs: {displayedAoeTemplates.length} • Revealed Zones:{' '}
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
                    <button
                      type="button"
                      onClick={() => toggleSelectTargetToken(t.id)}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        selectedTargetTokenIds.includes(t.id)
                          ? 'bg-rose-500/25 text-rose-600 dark:text-rose-200'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                      }`}
                      title="Target token for Save / Damage"
                    >
                      🎯
                    </button>
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

// ---- Interactive Targeted Save Prompt Banner for `/player` & Standalone `Play` ----

export interface TargetedSavePromptBannerProps {
  prompts: ProjectedSavePrompt[];
  activePc?: PlayerCharacter | null;
  secretRoll?: boolean;
  onResolvePrompt: (
    prompt: ProjectedSavePrompt,
    overrideOutcome?: DamageOutcomeMode,
    autoRollConcentration?: boolean,
  ) => {
    summary: string;
    concentrationDc?: number | null;
    concentrationSpell?: string;
    concentrationRoll?: RollEvent | null;
  } | void;
  onRollFollowUpConcentration?: (dc: number, spellName: string) => void;
}

export function TargetedSavePromptBanner({
  prompts,
  activePc,
  onResolvePrompt,
  onRollFollowUpConcentration,
}: TargetedSavePromptBannerProps) {
  const [localFeedback, setLocalFeedback] = useState<
    Record<
      string,
      {
        summary: string;
        concentrationDc?: number | null;
        concentrationSpell?: string;
      }
    >
  >({});

  const visiblePrompts = useMemo(() => {
    return prompts.filter((p) => !p.resolved || Boolean(localFeedback[p.id]));
  }, [localFeedback, prompts]);

  if (visiblePrompts.length === 0) return null;

  return (
    <div className="space-y-2">
      {visiblePrompts.map((prompt) => {
        const fb = localFeedback[prompt.id];
        const isResolved = prompt.resolved || Boolean(fb);
        return (
          <div
            key={`${prompt.id}_${prompt.targetPcId}`}
            className="rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 px-3.5 py-2.5 shadow-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-amber-600 dark:text-amber-200">
                  {prompt.bannerText}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Target: <strong>{prompt.targetPcName}</strong> · Incoming:{' '}
                  <strong>
                    {prompt.baseDamage} {prompt.damageType}
                  </strong>{' '}
                  damage ({prompt.halfOnSuccess ? 'Half on save' : 'Zero on save'})
                </div>
              </div>

              {!isResolved ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const res = onResolvePrompt(prompt, undefined, false);
                      if (res) {
                        setLocalFeedback((prev) => ({ ...prev, [prompt.id]: res }));
                      }
                    }}
                    className="rounded-lg bg-amber-500/25 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-100 border border-amber-500/60 hover:bg-amber-500/35"
                  >
                    🎲 Roll {prompt.ability} Save &amp; Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = onResolvePrompt(prompt, 'full', false);
                      if (res) setLocalFeedback((prev) => ({ ...prev, [prompt.id]: res }));
                    }}
                    className="rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-200 border border-rose-500/40"
                    title="Apply Full Damage ( deducts Temp HP & resistances automatically )"
                  >
                    Full
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = onResolvePrompt(prompt, 'half', false);
                      if (res) setLocalFeedback((prev) => ({ ...prev, [prompt.id]: res }));
                    }}
                    className="rounded-lg bg-orange-500/20 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-200 border border-orange-500/40"
                    title="Apply Half Damage"
                  >
                    Half
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = onResolvePrompt(prompt, 'zero', false);
                      if (res) setLocalFeedback((prev) => ({ ...prev, [prompt.id]: res }));
                    }}
                    className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200 border border-emerald-500/40"
                    title="Apply Zero Damage"
                  >
                    Zero
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200 border border-emerald-500/30">
                    ✓ {fb?.summary || prompt.resolutionSummary || 'Save Resolved'}
                  </span>
                  {fb?.concentrationDc && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onRollFollowUpConcentration && fb.concentrationDc) {
                          onRollFollowUpConcentration(
                            fb.concentrationDc,
                            fb.concentrationSpell || activePc?.concentrationSpell || 'Spell',
                          );
                        } else if (activePc && fb.concentrationDc) {
                          rollConcentrationCheck(activePc, fb.concentrationDc * 2);
                        }
                        setLocalFeedback((prev) => ({
                          ...prev,
                          [prompt.id]: { ...fb, concentrationDc: null },
                        }));
                      }}
                      className="rounded-lg bg-purple-500/25 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-200 border border-purple-500/50 hover:bg-purple-500/35"
                    >
                      🧠 Roll CON Save (DC {fb.concentrationDc} · {fb.concentrationSpell})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setLocalFeedback((prev) => {
                        const copy = { ...prev };
                        delete copy[prompt.id];
                        return copy;
                      })
                    }
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default TacticalMapStage;
