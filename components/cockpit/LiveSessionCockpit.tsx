'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Swords,
  Sparkles,
  MapPin,
  Sun,
  Mountain,
  User,
  Users,
  Clock,
  Zap,
  Shield,
  Heart,
  Plus,
  Trash2,
  Dices,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  AlertTriangle,
  Eye,
  EyeOff,
  Network,
  ShieldCheck,
  ExternalLink,
  Gift,
  PlusCircle,
} from 'lucide-react';
import {
  CONDITIONS,
  emptyInitiative,
  makeCombatantId,
  sortCombatants,
  advanceTurn,
  retreatTurn,
  applyHpDelta,
  toggleCondition,
  resetTurnOrder,
  type Combatant,
  type InitiativeState,
} from '@/lib/initiative';
import type { Character } from '@/lib/campaign-types';
import {
  rollImprovNpc,
  rollImprovEncounter,
  rollImprovItem,
  calculateConcentrationDc,
  type ImprovPanicRoll,
  type SceneGroundingContext,
} from '@/lib/cockpit/improvRollers';
import {
  isEntityPlayerVisible,
  syncEntityPlayerVisibility,
} from '@/lib/playerMode/spoilers';
import { makeEntityId } from '@/lib/playerMode/share';
import { normalizeItem } from '@/lib/playerMode/types';
import type { EntityType } from '@/lib/wiki/types';
import { buildEntityIndex } from '@/lib/wiki/entities';
import { extractAllMentions } from '@/lib/wiki/mentions';
import {
  CLOCK_STATUS_LABELS,
  CLOCK_STATUS_STYLES,
  deriveClockStatus,
  type ClockStatus,
} from '@/lib/world/sessionDelta';
import MentionText from '@/components/wiki/MentionText';
import LoreNodeInspector from '@/components/wiki/LoreNodeInspector';
import PlayerSafeLoreView from '@/components/PlayerSafeLoreView';
import SessionDeltaLogPanel from '@/components/world/SessionDeltaLogPanel';
import LoreRagAssistant from '@/components/LoreRagAssistant';
import K1CPrintQueuePanel from '@/components/printQueue/K1CPrintQueuePanel';

interface LiveSessionCockpitProps {
  campaignId?: string;
  campaignName?: string;
  state: Record<string, any>;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  characters?: Character[];
}

export default function LiveSessionCockpit({
  campaignId,
  campaignName = 'Campaign',
  state,
  setState,
  characters = [],
}: LiveSessionCockpitProps) {
  const locations: any[] = useMemo(
    () => (Array.isArray(state.locations) ? state.locations : []),
    [state.locations]
  );
  const npcs: any[] = useMemo(
    () => (Array.isArray(state.npcs) ? state.npcs : []),
    [state.npcs]
  );
  const factions: any[] = useMemo(
    () => (Array.isArray(state.factions) ? state.factions : []),
    [state.factions]
  );
  const clocks: any[] = useMemo(
    () => (Array.isArray(state.clocks) ? state.clocks : []),
    [state.clocks]
  );
  const items: any[] = useMemo(
    () => (Array.isArray(state.items) ? state.items : []),
    [state.items]
  );
  const relationships: any[] = useMemo(
    () => (Array.isArray(state.wiki?.relationships) ? state.wiki.relationships : []),
    [state.wiki?.relationships]
  );

  // Active Pinned Location
  const pinnedLocId: string =
    state.cockpitActiveLocationId ||
    (locations[0] ? locations[0].id || 'loc-0' : '');

  const setPinnedLocId = (locId: string) => {
    setState((prev) => ({ ...prev, cockpitActiveLocationId: locId }));
  };

  const activeLocationIndex = useMemo(() => {
    if (locations.length === 0) return -1;
    const idx = locations.findIndex((l, i) => (l?.id || `loc-${i}`) === pinnedLocId);
    return idx >= 0 ? idx : 0;
  }, [locations, pinnedLocId]);

  const activeLocation = activeLocationIndex >= 0 ? locations[activeLocationIndex] : null;
  const activeLocationEntityId = activeLocation
    ? activeLocation.id || `loc-${activeLocationIndex}`
    : '';

  // Improv Panic Bar state
  const [panicRoll, setPanicRoll] = useState<ImprovPanicRoll | null>(null);
  const [panicSavedMsg, setPanicSavedMsg] = useState<string | null>(null);

  // Lore Node Inspector & /player-view preview state
  const [inspectedNode, setInspectedNode] = useState<{ type: EntityType; id: string } | null>(null);
  const [showPlayerSafeModal, setShowPlayerSafeModal] = useState(false);

  // Initiative & HP Delta state (persisted in both state.__initiative and state.initiative for compatibility)
  const initState: InitiativeState = useMemo(() => {
    const raw = state.__initiative ?? state.initiative;
    if (raw && typeof raw === 'object' && Array.isArray(raw.combatants)) {
      return {
        ...raw,
        combatants: raw.combatants.map((c: any) => ({
          ...c,
          side: c.side || (c.kind === 'pc' ? 'pc' : c.kind === 'npc' ? 'ally' : 'enemy'),
          hp:
            typeof c.hp === 'object' && c.hp !== null
              ? { current: Number(c.hp.current) || 0, max: Number(c.hp.max) || 1 }
              : { current: Number(c.hp) || 0, max: Number(c.maxHp) || Number(c.hp) || 1 },
        })),
      } as InitiativeState;
    }
    return emptyInitiative();
  }, [state.__initiative, state.initiative]);

  const updateInitiative = (updater: (prev: InitiativeState) => InitiativeState) => {
    setState((prev) => {
      const raw = prev.__initiative ?? prev.initiative;
      const cur: InitiativeState =
        raw && Array.isArray(raw.combatants)
          ? {
              ...raw,
              combatants: raw.combatants.map((c: any) => ({
                ...c,
                side: c.side || (c.kind === 'pc' ? 'pc' : c.kind === 'npc' ? 'ally' : 'enemy'),
                hp:
                  typeof c.hp === 'object' && c.hp !== null
                    ? { current: Number(c.hp.current) || 0, max: Number(c.hp.max) || 1 }
                    : { current: Number(c.hp) || 0, max: Number(c.maxHp) || Number(c.hp) || 1 },
              })),
            }
          : emptyInitiative();
      const nextInit = updater(cur);
      return { ...prev, __initiative: nextInit, initiative: nextInit };
    });
  };

  const [hpDeltas, setHpDeltas] = useState<Record<string, string>>({});
  const [concentrationAlert, setConcentrationAlert] = useState<{
    combatantName: string;
    spellName?: string;
    damage: number;
    dc: number;
  } | null>(null);
  const [openConditionsFor, setOpenConditionsFor] = useState<string | null>(null);

  // Grounding Context from Active Location
  const groundingCtx: SceneGroundingContext = useMemo(() => {
    if (!activeLocation) {
      return {
        locationName: campaignName,
        lighting: 'Dim / Torchlight',
        terrainTags: ['flagstones', 'pillars'],
      };
    }
    return {
      locationName: activeLocation.name,
      locationType: activeLocation.type,
      lighting: activeLocation.lighting || 'Dim / Torchlight',
      terrainTags: Array.isArray(activeLocation.terrainTags)
        ? activeLocation.terrainTags
        : [],
      aspects: Array.isArray(activeLocation.aspects)
        ? activeLocation.aspects.filter(Boolean)
        : [],
      factions: activeLocation.factions,
    };
  }, [activeLocation, campaignName]);

  // Connected NPCs for Pinned Scene Card (from Lore Graph + @mentions + Factions)
  const sceneConnectedNpcs = useMemo(() => {
    if (!activeLocation) return npcs.slice(0, 6).map((n, i) => ({ n, i, id: n.id || `npc-${i}` }));
    const entityIdx = buildEntityIndex(state);
    const locMentions = new Set(
      extractAllMentions(
        [
          activeLocation.description || '',
          ...(activeLocation.aspects || []),
          activeLocation.factions || '',
        ].join(' '),
        entityIdx
      ).map((m) => m.name.toLowerCase())
    );
    const locNameLower = String(activeLocation.name || '').toLowerCase();

    const matched = npcs
      .map((n, i) => ({ n, i, id: String(n?.id || `npc-${i}`) }))
      .filter(({ n, id }) => {
        if (!n || !String(n.name || '').trim()) return false;
        const nNameLower = String(n.name).toLowerCase();
        const relMatch = relationships.some(
          (r) =>
            (r.from?.type === 'location' && r.from?.id === activeLocationEntityId && r.to?.type === 'npc' && r.to?.id === id) ||
            (r.to?.type === 'location' && r.to?.id === activeLocationEntityId && r.from?.type === 'npc' && r.from?.id === id) ||
            (r.fromType === 'location' && r.fromId === activeLocationEntityId && r.toType === 'npc' && r.toId === id) ||
            (r.toType === 'location' && r.toId === activeLocationEntityId && r.fromType === 'npc' && r.fromId === id)
        );
        const mentionMatch =
          locMentions.has(nNameLower) ||
          (locNameLower &&
            [n.archetype, n.goal, n.faction, n.bond].some(
              (f) => typeof f === 'string' && f.toLowerCase().includes(locNameLower)
            ));
        const factionMatch =
          Boolean(n.faction && activeLocation.factions) &&
          String(activeLocation.factions)
            .toLowerCase()
            .includes(String(n.faction).replace(/^@/, '').toLowerCase());
        return relMatch || mentionMatch || factionMatch;
      });

    return matched.length > 0
      ? matched
      : npcs
          .map((n, i) => ({ n, i, id: String(n?.id || `npc-${i}`) }))
          .filter(({ n }) => n && String(n.name || '').trim())
          .slice(0, 5);
  }, [activeLocation, activeLocationEntityId, npcs, relationships, state]);

  // Connected Artifacts / Items for Pinned Scene Card
  const sceneConnectedItems = useMemo(() => {
    const normalized = items.map((it, i) => normalizeItem(it, i));
    if (!activeLocation) return normalized.slice(0, 4);
    const locNameLower = String(activeLocation.name || '').toLowerCase();
    const matched = normalized.filter((item) => {
      const relMatch = relationships.some(
        (r) =>
          (r.from?.type === 'location' && r.from?.id === activeLocationEntityId && r.to?.type === 'magicItem' && r.to?.id === item.id) ||
          (r.to?.type === 'location' && r.to?.id === activeLocationEntityId && r.from?.type === 'magicItem' && r.from?.id === item.id) ||
          (r.fromType === 'location' && r.fromId === activeLocationEntityId && r.toType === 'magicItem' && r.toId === item.id) ||
          (r.toType === 'location' && r.toId === activeLocationEntityId && r.fromType === 'magicItem' && r.fromId === item.id)
      );
      const textMatch =
        locNameLower &&
        (item.name.toLowerCase().includes(locNameLower) ||
          (item.description || '').toLowerCase().includes(locNameLower));
      return relMatch || textMatch;
    });
    return matched.length > 0 ? matched : normalized.slice(0, 3);
  }, [items, activeLocation, activeLocationEntityId, relationships]);

  // Improv Panic Bar handlers
  const handleRollPanicNpc = () => {
    setPanicSavedMsg(null);
    setPanicRoll(rollImprovNpc(groundingCtx));
  };

  const handleRollPanicEncounter = () => {
    setPanicSavedMsg(null);
    setPanicRoll(rollImprovEncounter(groundingCtx));
  };

  const handleRollPanicItem = () => {
    setPanicSavedMsg(null);
    setPanicRoll(rollImprovItem(groundingCtx));
  };

  const handleSavePanicRoll = () => {
    if (!panicRoll) return;
    if (panicRoll.kind === 'npc') {
      const newNpc = {
        id: makeEntityId(),
        name: panicRoll.name,
        type: 'Neutral / Colour',
        faction: activeLocation?.factions || '',
        archetype: panicRoll.role,
        mannerism: panicRoll.voiceAndMannerism,
        goal: panicRoll.motive,
        flaw: panicRoll.secret,
        player_visible: false,
        isPublic: false,
      };
      setState((prev) => ({
        ...prev,
        npcs: [...(Array.isArray(prev.npcs) ? prev.npcs : []), newNpc],
      }));
      setPanicSavedMsg(`Saved @${panicRoll.name} to Campaign NPCs!`);
    } else if (panicRoll.kind === 'encounter') {
      const sceneLine = `${panicRoll.title}: ${panicRoll.sensoryBeat} (${panicRoll.mechanic}) ${panicRoll.twist}`;
      setState((prev) => ({
        ...prev,
        scenes: [...(Array.isArray(prev.scenes) ? prev.scenes : []), sceneLine],
      }));
      setPanicSavedMsg(`Saved "${panicRoll.title}" to Campaign Scenes!`);
    } else if (panicRoll.kind === 'item') {
      const newItem = {
        id: makeEntityId(),
        name: panicRoll.name,
        rarity: panicRoll.rarity,
        description: `${panicRoll.appearance} ${panicRoll.mechanic} ${panicRoll.curseOrSecret}`,
        mechanic: panicRoll.mechanic,
        gmSpoiler: panicRoll.curseOrSecret,
        player_visible: false,
        isPublic: false,
      };
      setState((prev) => ({
        ...prev,
        items: [...(Array.isArray(prev.items) ? prev.items : []), newItem],
      }));
      setPanicSavedMsg(`Saved "${panicRoll.name}" to Campaign Magic Items!`);
    }
  };

  // Combat / HP Delta handler with Concentration Check alert
  const handleCombatantHpDelta = (combatant: Combatant, delta: number) => {
    if (!delta) return;
    const isConcentrating =
      combatant.conditions.includes('Concentrating') ||
      Boolean(combatant.concentrationSpell?.trim());
    if (delta < 0 && isConcentrating) {
      const dmg = Math.abs(delta);
      const dc = calculateConcentrationDc(dmg);
      setConcentrationAlert({
        combatantName: combatant.name || 'Combatant',
        spellName: combatant.concentrationSpell,
        damage: dmg,
        dc,
      });
    }
    updateInitiative((prev) => ({
      ...prev,
      combatants: prev.combatants.map((c) =>
        c.id === combatant.id ? applyHpDelta(c, delta) : c
      ),
    }));
  };

  const handleApplyCustomDelta = (combatant: Combatant, sign: 1 | -1) => {
    const raw = hpDeltas[combatant.id] || '';
    const amount = Math.abs(parseInt(raw, 10));
    if (!Number.isFinite(amount) || amount <= 0) return;
    handleCombatantHpDelta(combatant, sign * amount);
    setHpDeltas((prev) => ({ ...prev, [combatant.id]: '' }));
  };

  const handleAddCombatant = (kind: 'monster' | 'pc' | 'npc' = 'monster') => {
    const newComb: Combatant = {
      id: makeCombatantId(),
      name: kind === 'pc' ? 'New Hero' : kind === 'npc' ? 'Scene Ally' : 'Hostile Creature',
      initiative: 10,
      hp: { current: 22, max: 22 },
      ac: 14,
      conditions: [],
      notes: '',
      side: kind === 'pc' ? 'pc' : kind === 'npc' ? 'ally' : 'enemy',
    };
    updateInitiative((prev) => ({
      ...prev,
      combatants: [...prev.combatants, newComb],
    }));
  };

  const handleImportPartyPcs = () => {
    const pcs = characters.filter((c) => !c.isSidekick);
    if (pcs.length === 0) {
      handleAddCombatant('pc');
      return;
    }
    updateInitiative((prev) => {
      const existingNames = new Set(prev.combatants.map((c) => c.name.toLowerCase()));
      const added: Combatant[] = pcs
        .filter((pc) => !existingNames.has((pc.name || '').toLowerCase()))
        .map((pc) => {
          const parsedHp = Number(pc.hpMax ?? pc.maxHp) || 20;
          const parsedAc = Number(pc.ac) || 15;
          return {
            id: makeCombatantId(),
            name: pc.name || 'PC',
            initiative: 12,
            hp: { current: parsedHp, max: parsedHp },
            ac: parsedAc,
            conditions: [],
            notes: '',
            side: 'pc' as const,
            refPcId: pc.id,
          };
        });
      return {
        ...prev,
        combatants: [...prev.combatants, ...added],
      };
    });
  };

  const handleRollAllInitiative = () => {
    updateInitiative((prev) => {
      const rolled = prev.combatants.map((c) => ({
        ...c,
        initiative: Math.floor(Math.random() * 20) + 1,
      }));
      return {
        ...prev,
        round: prev.round || 1,
        activeIndex: 0,
        combatants: sortCombatants(rolled),
      };
    });
  };

  // Toggle player_visible on any entity from the Cockpit
  const handleToggleEntityVisibility = (
    entityType: EntityType,
    entityId: string,
    nextVisible: boolean
  ) => {
    setState((prev) => {
      const next = { ...prev };
      if (entityType === 'npc') {
        next.npcs = (prev.npcs || []).map((n: any, idx: number) =>
          (n.id || `npc-${idx}`) === entityId
            ? { ...n, player_visible: nextVisible, isPublic: nextVisible }
            : n
        );
        next.player = syncEntityPlayerVisibility(prev.player, 'npcs', entityId, nextVisible);
      } else if (entityType === 'location') {
        next.locations = (prev.locations || []).map((l: any, idx: number) =>
          (l.id || `loc-${idx}`) === entityId
            ? { ...l, player_visible: nextVisible, isPublic: nextVisible }
            : l
        );
        next.player = syncEntityPlayerVisibility(prev.player, 'locations', entityId, nextVisible);
      } else if (entityType === 'faction') {
        next.factions = (prev.factions || []).map((f: any, idx: number) =>
          (f.id || `fac-${idx}`) === entityId
            ? { ...f, player_visible: nextVisible, isPublic: nextVisible }
            : f
        );
        next.player = syncEntityPlayerVisibility(prev.player, 'factions', entityId, nextVisible);
      } else if (entityType === 'factionClock') {
        next.clocks = (prev.clocks || []).map((c: any, idx: number) =>
          (c.id || `clock-${idx}`) === entityId
            ? { ...c, player_visible: nextVisible, isPublic: nextVisible }
            : c
        );
        next.player = syncEntityPlayerVisibility(prev.player, 'clocks', entityId, nextVisible);
      } else if (entityType === 'magicItem') {
        next.items = (prev.items || []).map((it: any, idx: number) => {
          const norm = normalizeItem(it, idx);
          if (norm.id !== entityId) return it;
          if (typeof it === 'string') {
            return { ...norm, player_visible: nextVisible, isPublic: nextVisible };
          }
          return { ...it, player_visible: nextVisible, isPublic: nextVisible };
        });
      }
      return next;
    });
  };

  // Update active location fields inline from the Pinned Scene Card
  const handleUpdateActiveLocation = (patch: Record<string, any>) => {
    setState((prev) => {
      const locs = Array.isArray(prev.locations) ? [...prev.locations] : [];
      if (locs.length === 0) {
        const created = {
          id: makeEntityId(),
          name: 'Active Scene Location',
          type: 'Dungeon Room / Area',
          lighting: 'Dim / Torchlight',
          terrainTags: ['Cover', 'Difficult Terrain'],
          aspects: ['', '', ''],
          description: '',
          ...patch,
        };
        return {
          ...prev,
          locations: [created],
          cockpitActiveLocationId: created.id,
        };
      }
      const idx = activeLocationIndex >= 0 ? activeLocationIndex : 0;
      locs[idx] = { ...locs[idx], ...patch };
      return { ...prev, locations: locs };
    });
  };

  // Tick/untick a Faction Clock segment directly in the Cockpit
  const handleClockSegmentClick = (clockIndex: number, segmentIndex: number) => {
    setState((prev) => {
      const list = Array.isArray(prev.clocks) ? [...prev.clocks] : [];
      const cur = list[clockIndex];
      if (!cur) return prev;
      const max = Number(cur.max) || 6;
      const filled = Number(cur.filled) || 0;
      const nextFilled = segmentIndex + 1 === filled ? segmentIndex : segmentIndex + 1;
      const nextStatus: ClockStatus =
        nextFilled >= max
          ? 'triggered'
          : cur.status === 'triggered'
            ? 'active'
            : deriveClockStatus(cur);
      list[clockIndex] = { ...cur, filled: nextFilled, status: nextStatus };
      return { ...prev, clocks: list };
    });
  };

  const handleClockStatusChange = (clockIndex: number, status: ClockStatus) => {
    setState((prev) => {
      const list = Array.isArray(prev.clocks) ? [...prev.clocks] : [];
      if (!list[clockIndex]) return prev;
      list[clockIndex] = { ...list[clockIndex], status };
      return { ...prev, clocks: list };
    });
  };

  const handleAddQuickClock = () => {
    setState((prev) => ({
      ...prev,
      clocks: [
        ...(Array.isArray(prev.clocks) ? prev.clocks : []),
        {
          id: makeEntityId(),
          text: `Escalation at ${activeLocation?.name || 'Scene'}`,
          faction: activeLocation?.factions || factions[0]?.name || 'Local Threat',
          max: 6,
          filled: 1,
          status: 'active' as ClockStatus,
          triggerNote: 'Reinforcements arrive or hazard triggers',
        },
      ],
    }));
  };

  if (showPlayerSafeModal) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-moss/40 bg-moss/10 px-3.5 py-2.5">
          <div className="flex items-center gap-2 font-display text-xs uppercase tracking-wider text-moss">
            <ShieldCheck size={16} />
            Read-Only /player-view Mode (GM Secrets &amp; ||Spoilers|| Redacted)
          </div>
          <div className="flex items-center gap-2">
            {campaignId && (
              <Link
                href={`/campaign/${campaignId}/player-view`}
                className="inline-flex items-center gap-1 rounded border border-moss/60 bg-parchment px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment"
              >
                Open Standalone /player-view <ExternalLink size={11} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setShowPlayerSafeModal(false)}
              className="rounded border border-crimson bg-crimson px-3 py-1 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-wine"
            >
              Return to GM Cockpit
            </button>
          </div>
        </div>
        <PlayerSafeLoreView
          campaignName={campaignName}
          campaignData={state}
          campaignId={campaignId}
          embedded
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ===================================================================
          MODULE 1C: 1-CLICK "IMPROV PANIC BAR" (TOP COMMAND BAR)
         =================================================================== */}
      <section className="rounded border-2 border-brass-deep/60 bg-parchment p-3 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-crimson px-2 py-1 font-display text-[11px] uppercase tracking-wider text-parchment">
              <Zap size={13} /> Improv Panic Bar
            </span>
            <span className="font-serif text-xs italic text-ink-soft">
              Grounded in{' '}
              <strong className="font-display not-italic text-ink">
                {groundingCtx.locationName || 'Current Scene'}
              </strong>{' '}
              ({groundingCtx.lighting}
              {groundingCtx.terrainTags && groundingCtx.terrainTags.length > 0
                ? ` · ${groundingCtx.terrainTags.join(', ')}`
                : ''})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleRollPanicNpc}
              className="inline-flex items-center gap-1.5 rounded border border-brass-deep bg-brass/15 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors hover:bg-brass hover:text-parchment"
            >
              <User size={12} /> Roll Instant NPC
            </button>
            <button
              type="button"
              onClick={handleRollPanicEncounter}
              className="inline-flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-crimson transition-colors hover:bg-crimson hover:text-parchment"
            >
              <Swords size={12} /> Roll Weird Encounter
            </button>
            <button
              type="button"
              onClick={handleRollPanicItem}
              className="inline-flex items-center gap-1.5 rounded border border-wine/60 bg-wine/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-wine transition-colors hover:bg-wine hover:text-parchment"
            >
              <Gift size={12} /> Roll Custom Item Mechanic
            </button>

            <button
              type="button"
              onClick={() => setShowPlayerSafeModal(true)}
              className="inline-flex items-center gap-1 rounded border border-moss/60 bg-moss/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment"
              title="Preview read-only /player-view mode"
            >
              <ShieldCheck size={12} /> /player-view
            </button>
          </div>
        </div>

        {/* Rolled Panic Output Banner */}
        {panicRoll && (
          <div className="mt-2.5 rounded border border-brass-deep/50 bg-parchment-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-1.5">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-crimson" />
                <span className="font-display text-xs uppercase tracking-wider text-ink">
                  {panicRoll.kind === 'npc' && `Instant NPC: ${panicRoll.name} (${panicRoll.role})`}
                  {panicRoll.kind === 'encounter' && `Weird Encounter: ${panicRoll.title}`}
                  {panicRoll.kind === 'item' && `Custom Item: ${panicRoll.name} (${panicRoll.rarity})`}
                </span>
                <span className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-[10px] italic text-ink-mute">
                  {panicRoll.groundedIn}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSavePanicRoll}
                  className="inline-flex items-center gap-1 rounded border border-moss bg-moss px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-moss/90"
                >
                  <PlusCircle size={11} /> Save to Campaign
                </button>
                <button
                  type="button"
                  onClick={() => setPanicRoll(null)}
                  className="rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute hover:text-ink"
                >
                  Dismiss
                </button>
              </div>
            </div>

            {panicSavedMsg && (
              <div className="mt-1.5 rounded border border-moss/40 bg-moss/10 px-2 py-1 font-serif text-xs text-moss">
                {panicSavedMsg}
              </div>
            )}

            {panicRoll.kind === 'npc' && (
              <div className="mt-2 grid grid-cols-1 gap-2 font-serif text-xs sm:grid-cols-3">
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Voice &amp; Mannerism Hook:
                  </span>
                  <p className="text-ink">{panicRoll.voiceAndMannerism}</p>
                </div>
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Motive:
                  </span>
                  <p className="text-ink">
                    <MentionText text={panicRoll.motive} campaignData={state} />
                  </p>
                </div>
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-crimson">
                    GM Secret:
                  </span>
                  <p className="text-ink">
                    <MentionText text={panicRoll.secret} campaignData={state} />
                  </p>
                </div>
              </div>
            )}

            {panicRoll.kind === 'encounter' && (
              <div className="mt-2 grid grid-cols-1 gap-2 font-serif text-xs sm:grid-cols-3">
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Sensory Beat:
                  </span>
                  <p className="text-ink">{panicRoll.sensoryBeat}</p>
                </div>
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Tabletop Mechanic:
                  </span>
                  <p className="text-ink">{panicRoll.mechanic}</p>
                </div>
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-crimson">
                    Twist / Secret:
                  </span>
                  <p className="text-ink">
                    <MentionText text={panicRoll.twist} campaignData={state} />
                  </p>
                </div>
              </div>
            )}

            {panicRoll.kind === 'item' && (
              <div className="mt-2 grid grid-cols-1 gap-2 font-serif text-xs sm:grid-cols-3">
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Discovery &amp; Form:
                  </span>
                  <p className="text-ink">
                    <MentionText text={panicRoll.appearance} campaignData={state} />
                  </p>
                </div>
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Actionable Mechanic:
                  </span>
                  <p className="text-ink">{panicRoll.mechanic}</p>
                </div>
                <div>
                  <span className="font-display text-[10px] uppercase tracking-wider text-crimson">
                    GM Secret / Curse:
                  </span>
                  <p className="text-ink">
                    <MentionText text={panicRoll.curseOrSecret} campaignData={state} />
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===================================================================
          MAIN COMMAND GRID (NO TAB SWITCHING: INITIATIVE LEFT + SCENE RIGHT)
         =================================================================== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* -----------------------------------------------------------------
            MODULE 1A: INITIATIVE, HP DELTA & CONDITION/CONCENTRATION TRACKER
           ----------------------------------------------------------------- */}
        <div className="space-y-3 lg:col-span-6">
          <section className="space-y-3 rounded border border-rule bg-parchment p-3.5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2.5">
              <div className="flex items-center gap-2">
                <Swords size={16} className="text-crimson" />
                <div>
                  <h2 className="font-display text-sm uppercase tracking-wider text-ink">
                    Initiative, HP Delta &amp; Concentration
                  </h2>
                  <p className="font-serif text-xs italic text-ink-mute">
                    Round {initState.round} · {initState.combatants.length} Combatants
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateInitiative(retreatTurn)}
                  disabled={initState.combatants.length === 0}
                  className="inline-flex items-center gap-0.5 rounded border border-rule bg-parchment-soft px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink hover:bg-parchment-deep disabled:opacity-40"
                  title="Previous Turn"
                >
                  <ChevronLeft size={12} /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => updateInitiative(advanceTurn)}
                  disabled={initState.combatants.length === 0}
                  className="inline-flex items-center gap-0.5 rounded border border-crimson bg-crimson px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-40"
                  title="Next Turn"
                >
                  Next Turn <ChevronRight size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleRollAllInitiative}
                  disabled={initState.combatants.length === 0}
                  className="inline-flex items-center gap-1 rounded border border-brass-deep/60 bg-brass/10 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment disabled:opacity-40"
                  title="Roll d20 Initiative for all combatants and sort"
                >
                  <Dices size={12} /> Roll d20
                </button>
                <button
                  type="button"
                  onClick={() => updateInitiative(resetTurnOrder)}
                  className="rounded border border-rule bg-parchment-soft p-1 text-ink-mute hover:text-crimson"
                  title="Reset Round to 1"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>

            {/* Automatic Concentration Save DC Alert */}
            {concentrationAlert && (
              <div className="flex items-center justify-between gap-2 rounded border-2 border-crimson bg-crimson/10 px-3 py-2 text-xs text-crimson">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="flex-shrink-0" />
                  <div className="font-serif">
                    <strong className="font-display uppercase tracking-wider">
                      Concentration Check!
                    </strong>{' '}
                    {concentrationAlert.combatantName} took {concentrationAlert.damage} damage
                    {concentrationAlert.spellName
                      ? ` while concentrating on "${concentrationAlert.spellName}"`
                      : ''}
                    — roll{' '}
                    <strong className="underline">
                      DC {concentrationAlert.dc} Constitution Save
                    </strong>
                    !
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConcentrationAlert(null)}
                  className="rounded border border-crimson/50 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider hover:bg-crimson hover:text-parchment"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Combatant List */}
            {initState.combatants.length === 0 ? (
              <div className="rounded border border-dashed border-rule bg-parchment-soft p-5 text-center font-serif text-xs italic text-ink-mute">
                No combatants in initiative yet. Add monsters, NPCs, or import your party below.
              </div>
            ) : (
              <div className="space-y-2">
                {initState.combatants.map((c, idx) => {
                  const isActive = idx === initState.activeIndex;
                  const isConcentrating =
                    c.conditions.includes('Concentrating') ||
                    Boolean(c.concentrationSpell?.trim());
                  const isDead = c.hp.current <= 0 && c.hp.max > 0;
                  const condExpanded = openConditionsFor === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`space-y-2 rounded border p-2.5 transition-all ${
                        isActive
                          ? 'border-2 border-crimson bg-crimson/5 shadow-sm'
                          : isDead
                            ? 'border-rule/60 bg-parchment-deep/40 opacity-75'
                            : 'border-rule bg-parchment-soft'
                      }`}
                    >
                      {/* Top Row: Init, Name, AC, HP */}
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          value={c.initiative}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            updateInitiative((prev) => ({
                              ...prev,
                              combatants: prev.combatants.map((item) =>
                                item.id === c.id ? { ...item, initiative: val } : item
                              ),
                            }));
                          }}
                          className="w-12 rounded border border-rule bg-parchment px-1.5 py-1 text-center font-display text-xs font-bold text-ink"
                          title="Initiative Roll"
                        />

                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateInitiative((prev) => ({
                              ...prev,
                              combatants: prev.combatants.map((item) =>
                                item.id === c.id ? { ...item, name: val } : item
                              ),
                            }));
                          }}
                          placeholder="Combatant Name"
                          className="min-w-28 flex-1 border-b border-transparent bg-transparent font-display text-sm text-ink focus:border-crimson focus:outline-none"
                        />

                        {/* AC Input */}
                        <label className="flex items-center gap-1 rounded border border-rule bg-parchment px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
                          <Shield size={10} className="text-brass-deep" /> AC
                          <input
                            type="number"
                            value={c.ac ?? 10}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 10;
                              updateInitiative((prev) => ({
                                ...prev,
                                combatants: prev.combatants.map((item) =>
                                  item.id === c.id ? { ...item, ac: val } : item
                                ),
                              }));
                            }}
                            className="w-9 bg-transparent text-center font-serif text-xs text-ink focus:outline-none"
                          />
                        </label>

                        {/* HP / Max HP */}
                        <div className="flex items-center gap-1 rounded border border-rule bg-parchment px-2 py-0.5 font-display text-xs">
                          <Heart
                            size={11}
                            className={c.hp.current <= c.hp.max / 2 ? 'text-crimson' : 'text-moss'}
                          />
                          <input
                            type="number"
                            value={c.hp.current}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              updateInitiative((prev) => ({
                                ...prev,
                                combatants: prev.combatants.map((item) =>
                                  item.id === c.id
                                    ? { ...item, hp: { ...item.hp, current: val } }
                                    : item
                                ),
                              }));
                            }}
                            className="w-10 bg-transparent text-right font-serif text-xs font-semibold text-ink focus:outline-none"
                            title="Current HP"
                          />
                          <span className="text-ink-mute">/</span>
                          <input
                            type="number"
                            value={c.hp.max}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              updateInitiative((prev) => ({
                                ...prev,
                                combatants: prev.combatants.map((item) =>
                                  item.id === c.id
                                    ? { ...item, hp: { ...item.hp, max: val } }
                                    : item
                                ),
                              }));
                            }}
                            className="w-10 bg-transparent font-serif text-xs text-ink-soft focus:outline-none"
                            title="Max HP"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateInitiative((prev) => ({
                              ...prev,
                              combatants: prev.combatants.filter((item) => item.id !== c.id),
                            }))
                          }
                          className="text-ink-mute hover:text-crimson"
                          title="Remove combatant"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Second Row: HP Delta Calculator + Concentration & Condition Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule/60 pt-1.5">
                        {/* HP Delta Bar */}
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCombatantHpDelta(c, -5)}
                            className="rounded border border-crimson/40 bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] text-crimson hover:bg-crimson hover:text-parchment"
                          >
                            −5
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCombatantHpDelta(c, -1)}
                            className="rounded border border-crimson/40 bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] text-crimson hover:bg-crimson hover:text-parchment"
                          >
                            −1
                          </button>
                          <div className="flex items-center rounded border border-rule bg-parchment">
                            <input
                              type="number"
                              min={1}
                              value={hpDeltas[c.id] || ''}
                              onChange={(e) =>
                                setHpDeltas((prev) => ({ ...prev, [c.id]: e.target.value }))
                              }
                              placeholder="Δ HP"
                              className="w-12 bg-transparent px-1.5 py-0.5 text-center font-serif text-xs text-ink placeholder:text-ink-faint focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyCustomDelta(c, -1)}
                              className="border-l border-rule bg-crimson/10 px-1.5 py-0.5 font-display text-[9px] uppercase text-crimson hover:bg-crimson hover:text-parchment"
                              title="Apply Damage"
                            >
                              Dmg
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyCustomDelta(c, 1)}
                              className="border-l border-rule bg-moss/10 px-1.5 py-0.5 font-display text-[9px] uppercase text-moss hover:bg-moss hover:text-parchment"
                              title="Apply Healing"
                            >
                              Heal
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCombatantHpDelta(c, 1)}
                            className="rounded border border-moss/40 bg-moss/10 px-1.5 py-0.5 font-display text-[10px] text-moss hover:bg-moss hover:text-parchment"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCombatantHpDelta(c, 5)}
                            className="rounded border border-moss/40 bg-moss/10 px-1.5 py-0.5 font-display text-[10px] text-moss hover:bg-moss hover:text-parchment"
                          >
                            +5
                          </button>
                        </div>

                        {/* Concentration Toggle + Condition Drawer Button */}
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateInitiative((prev) => ({
                                ...prev,
                                combatants: prev.combatants.map((item) =>
                                  item.id === c.id
                                    ? toggleCondition(item, 'Concentrating')
                                    : item
                                ),
                              }))
                            }
                            className={`rounded border px-2 py-0.5 font-display text-[9px] uppercase tracking-wider transition-colors ${
                              isConcentrating
                                ? 'border-wine bg-wine text-parchment'
                                : 'border-rule bg-parchment text-ink-mute hover:text-ink'
                            }`}
                          >
                            ◎ Concentrating
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenConditionsFor(condExpanded ? null : c.id)
                            }
                            className="rounded border border-rule bg-parchment px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep hover:border-brass-deep"
                          >
                            + Conditions ({c.conditions.length})
                          </button>
                        </div>
                      </div>

                      {/* Active Concentration Spell Input */}
                      {isConcentrating && (
                        <div className="flex items-center gap-1.5 rounded border border-wine/40 bg-wine/5 px-2 py-1">
                          <span className="font-display text-[9px] uppercase tracking-wider text-wine">
                            Spell:
                          </span>
                          <input
                            type="text"
                            value={(c as any).concentrationSpell || ''}
                            onChange={(e) => {
                              const spell = e.target.value;
                              updateInitiative((prev) => ({
                                ...prev,
                                combatants: prev.combatants.map((item) =>
                                  item.id === c.id
                                    ? ({ ...item, concentrationSpell: spell } as Combatant)
                                    : item
                                ),
                              }));
                            }}
                            placeholder="e.g. Hold Person, Bless, Spirit Guardians…"
                            className="flex-1 bg-transparent font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Active Condition Badges */}
                      {c.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.conditions.map((cond) => (
                            <button
                              key={cond}
                              type="button"
                              onClick={() =>
                                updateInitiative((prev) => ({
                                  ...prev,
                                  combatants: prev.combatants.map((item) =>
                                    item.id === c.id ? toggleCondition(item, cond) : item
                                  ),
                                }))
                              }
                              className="rounded-sm border border-crimson/50 bg-crimson/10 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
                              title="Click to remove condition"
                            >
                              {cond} ×
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Condition Picker Drawer */}
                      {condExpanded && (
                        <div className="flex flex-wrap gap-1 rounded border border-rule bg-parchment p-2">
                          {CONDITIONS.map((cond) => {
                            const active = c.conditions.includes(cond);
                            return (
                              <button
                                key={cond}
                                type="button"
                                onClick={() =>
                                  updateInitiative((prev) => ({
                                    ...prev,
                                    combatants: prev.combatants.map((item) =>
                                      item.id === c.id ? toggleCondition(item, cond) : item
                                    ),
                                  }))
                                }
                                className={`rounded-sm border px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider ${
                                  active
                                    ? 'border-crimson bg-crimson text-parchment'
                                    : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
                                }`}
                              >
                                {cond}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Combatant Footer */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-rule pt-2.5">
              <button
                type="button"
                onClick={() => handleAddCombatant('monster')}
                className="inline-flex items-center gap-1 rounded border border-crimson bg-crimson/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
              >
                <Plus size={11} /> Add Monster
              </button>
              <button
                type="button"
                onClick={() => handleAddCombatant('npc')}
                className="inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
              >
                <Plus size={11} /> Add NPC
              </button>
              <button
                type="button"
                onClick={handleImportPartyPcs}
                className="inline-flex items-center gap-1 rounded border border-moss/60 bg-moss/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment"
              >
                <Users size={11} /> Import Party PCs
              </button>
              <button
                type="button"
                onClick={() =>
                  updateInitiative((prev) => ({
                    ...prev,
                    combatants: sortCombatants(prev.combatants),
                  }))
                }
                className="ml-auto rounded border border-rule bg-parchment-soft px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:border-brass-deep"
              >
                Sort by Init
              </button>
            </div>
          </section>
        </div>

        {/* -----------------------------------------------------------------
            MODULE 1B: PINNED ACTIVE SCENE CARD (MODULES 2 & 3 WIRED)
           ----------------------------------------------------------------- */}
        <div className="space-y-3 lg:col-span-6">
          <section className="space-y-3 rounded border border-rule bg-parchment p-3.5 shadow-card">
            {/* Pinned Location Selector Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2.5">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-crimson" />
                <div>
                  <h2 className="font-display text-sm uppercase tracking-wider text-ink">
                    Pinned Active Scene Card
                  </h2>
                  <p className="font-serif text-xs italic text-ink-mute">
                    Live Module 2 Lore Graph &amp; Module 3 Faction Clocks
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={activeLocationEntityId}
                  onChange={(e) => setPinnedLocId(e.target.value)}
                  className="rounded border border-brass-deep/60 bg-parchment-soft px-2.5 py-1 font-display text-xs text-ink"
                >
                  {locations.length === 0 ? (
                    <option value="">No Location Prepped</option>
                  ) : (
                    locations.map((l, idx) => {
                      const lid = l.id || `loc-${idx}`;
                      return (
                        <option key={lid} value={lid}>
                          📌 {l.name || `Location ${idx + 1}`}
                        </option>
                      );
                    })
                  )}
                </select>
                {activeLocation && (
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleEntityVisibility(
                        'location',
                        activeLocationEntityId,
                        !isEntityPlayerVisible(activeLocation, state.player, 'locations')
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-display text-[10px] uppercase tracking-wider ${
                      isEntityPlayerVisible(activeLocation, state.player, 'locations')
                        ? 'border-moss bg-moss text-parchment'
                        : 'border-rule bg-parchment-soft text-ink-mute'
                    }`}
                    title="Toggle player_visible for this Location"
                  >
                    {isEntityPlayerVisible(activeLocation, state.player, 'locations') ? (
                      <Eye size={11} />
                    ) : (
                      <EyeOff size={11} />
                    )}
                    {isEntityPlayerVisible(activeLocation, state.player, 'locations')
                      ? 'Shared'
                      : 'Private'}
                  </button>
                )}
              </div>
            </div>

            {/* Scene Description, Lighting & Terrain Tags */}
            <div className="space-y-2 rounded border border-rule bg-parchment-soft p-2.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  <Sun size={13} className="flex-shrink-0 text-brass-deep" />
                  <select
                    value={activeLocation?.lighting || 'Dim / Torchlight'}
                    onChange={(e) =>
                      handleUpdateActiveLocation({ lighting: e.target.value })
                    }
                    className="w-full rounded border border-rule bg-parchment px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
                  >
                    <option value="Bright Light">Lighting: Bright Light</option>
                    <option value="Dim / Torchlight">Lighting: Dim / Torchlight</option>
                    <option value="Darkness">Lighting: Darkness</option>
                    <option value="Magical Darkness / Gloom">Lighting: Magical Darkness / Gloom</option>
                    <option value="Flickering Bioluminescence">Lighting: Flickering Bioluminescence</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <Mountain size={13} className="flex-shrink-0 text-brass-deep" />
                  <input
                    type="text"
                    value={
                      Array.isArray(activeLocation?.terrainTags)
                        ? activeLocation.terrainTags.join(', ')
                        : ''
                    }
                    onChange={(e) =>
                      handleUpdateActiveLocation({
                        terrainTags: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Terrain tags: Cover, Chasm, Difficult Terrain…"
                    className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint"
                  />
                </div>
              </div>

              {/* Active Terrain & Aspect Pills */}
              <div className="flex flex-wrap gap-1">
                <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-amber-900">
                  💡 {activeLocation?.lighting || 'Dim / Torchlight'}
                </span>
                {(activeLocation?.terrainTags || []).map((tag: string, i: number) => (
                  <span
                    key={i}
                    className="rounded border border-brass-deep/50 bg-brass/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep"
                  >
                    ⛰ {tag}
                  </span>
                ))}
                {(activeLocation?.aspects || [])
                  .filter(Boolean)
                  .map((aspect: string, i: number) => (
                    <span
                      key={`asp-${i}`}
                      className="rounded border border-rule bg-parchment px-2 py-0.5 font-serif text-[11px] italic text-ink-soft"
                    >
                      ✦ <MentionText text={aspect} campaignData={state} onNavigate={(t, id) => setInspectedNode({ type: t, id })} />
                    </span>
                  ))}
              </div>

              {/* Scene Description with @Entity links and ||GM Spoiler|| support */}
              <div>
                <textarea
                  value={activeLocation?.description || ''}
                  onChange={(e) =>
                    handleUpdateActiveLocation({ description: e.target.value })
                  }
                  placeholder="Scene description (use @EntityName to link lore nodes and ||secret|| for GM spoilers)…"
                  rows={2}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
                />
                {activeLocation?.description && (
                  <div className="mt-1 rounded border border-rule/60 bg-parchment px-2.5 py-1.5 font-serif text-xs leading-relaxed text-ink">
                    <MentionText
                      text={activeLocation.description}
                      campaignData={state}
                      onNavigate={(type, id) => setInspectedNode({ type, id })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Inline Lore Node Inspector when any entity is clicked */}
            {inspectedNode && (
              <LoreNodeInspector
                entityType={inspectedNode.type}
                entityId={inspectedNode.id}
                campaignData={state}
                onSelectNode={(type, id) => setInspectedNode({ type, id })}
                onTogglePlayerVisible={handleToggleEntityVisibility}
                onClose={() => setInspectedNode(null)}
              />
            )}

            {/* Connected NPCs & Artifacts (Module 2) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                  <Network size={12} /> Connected Scene NPCs &amp; Artifacts (Click to Inspect Lore Graph)
                </span>
                {activeLocation && (
                  <button
                    type="button"
                    onClick={() =>
                      setInspectedNode({
                        type: 'location',
                        id: activeLocationEntityId,
                      })
                    }
                    className="font-display text-[9px] uppercase tracking-wider text-crimson hover:underline"
                  >
                    Inspect Location Graph →
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {sceneConnectedNpcs.map(({ n, id }) => {
                  const visible = isEntityPlayerVisible(n, state.player, 'npcs');
                  return (
                    <div
                      key={id}
                      className="inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-2 py-1 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setInspectedNode({ type: 'npc', id })}
                        className="font-display text-[11px] text-ink hover:text-crimson"
                        title="Click to inspect all connected lore nodes"
                      >
                        @{n.name}
                      </button>
                      {n.type && (
                        <span className="font-serif text-[10px] italic text-ink-mute">
                          ({n.type})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEntityVisibility('npc', id, !visible)
                        }
                        className={`ml-1 rounded p-0.5 ${
                          visible ? 'text-moss' : 'text-ink-mute hover:text-ink'
                        }`}
                        title={
                          visible
                            ? 'player_visible: true (Click to hide)'
                            : 'player_visible: false (Click to reveal)'
                        }
                      >
                        {visible ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                    </div>
                  );
                })}

                {sceneConnectedItems.map((item) => {
                  const visible = Boolean(item.player_visible ?? item.isPublic);
                  return (
                    <div
                      key={item.id}
                      className="inline-flex items-center gap-1 rounded border border-brass/40 bg-brass/5 px-2 py-1 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setInspectedNode({ type: 'magicItem', id: item.id })
                        }
                        className="font-display text-[11px] text-brass-deep hover:text-crimson"
                        title="Click to inspect connected lore nodes"
                      >
                        ✦ {item.name}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEntityVisibility('magicItem', item.id, !visible)
                        }
                        className={`ml-1 rounded p-0.5 ${
                          visible ? 'text-moss' : 'text-ink-mute hover:text-ink'
                        }`}
                        title={
                          visible
                            ? 'player_visible: true'
                            : 'player_visible: false'
                        }
                      >
                        {visible ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Faction Clocks (Module 3 Wired into Scene Card) */}
            <div className="space-y-2 border-t border-rule pt-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                  <Clock size={12} /> Active Faction Progress Clocks (Click Segments to Tick/Untick)
                </span>
                <button
                  type="button"
                  onClick={handleAddQuickClock}
                  className="inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep hover:border-crimson hover:text-crimson"
                >
                  <Plus size={10} /> Add Clock
                </button>
              </div>

              {clocks.length === 0 ? (
                <div className="rounded border border-dashed border-rule bg-parchment-soft p-3 text-center font-serif text-xs italic text-ink-mute">
                  No active Faction Clocks yet. Click &ldquo;Add Clock&rdquo; to track faction progress.
                </div>
              ) : (
                <div className="space-y-2">
                  {clocks.map((c, idx) => {
                    const max = Number(c.max) || 6;
                    const filled = Math.max(0, Math.min(max, Number(c.filled) || 0));
                    const status: ClockStatus = deriveClockStatus(c);
                    const cid = c.id || `clock-${idx}`;
                    return (
                      <div
                        key={cid}
                        className={`space-y-1.5 rounded border p-2.5 ${
                          filled >= max
                            ? 'border-crimson bg-crimson/5'
                            : 'border-rule bg-parchment-soft'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectedNode({ type: 'factionClock', id: cid })
                            }
                            className="text-left font-display text-xs text-ink hover:text-crimson"
                          >
                            {c.faction ? `${c.faction}: ` : ''}
                            {c.text || `Clock ${idx + 1}`}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <select
                              value={status}
                              onChange={(e) =>
                                handleClockStatusChange(idx, e.target.value as ClockStatus)
                              }
                              className={`rounded border px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider ${CLOCK_STATUS_STYLES[status]}`}
                            >
                              {(Object.keys(CLOCK_STATUS_LABELS) as ClockStatus[]).map(
                                (st) => (
                                  <option key={st} value={st}>
                                    {CLOCK_STATUS_LABELS[st]}
                                  </option>
                                )
                              )}
                            </select>
                            <span className="font-display text-xs text-brass-deep">
                              {filled}/{max}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Segmented Bar */}
                        <div className="flex gap-0.5 rounded-sm border border-brass-deep bg-parchment-deep p-0.5">
                          {Array.from({ length: max }).map((_, segIdx) => (
                            <button
                              key={segIdx}
                              type="button"
                              onClick={() => handleClockSegmentClick(idx, segIdx)}
                              className={`h-4 flex-1 rounded-sm transition-colors ${
                                segIdx < filled
                                  ? 'bg-crimson hover:bg-crimson/80'
                                  : 'bg-parchment hover:bg-parchment-deep'
                              }`}
                              title={`Segment ${segIdx + 1}/${max}`}
                            />
                          ))}
                        </div>

                        {c.triggerNote && (
                          <div className="font-serif text-[11px] italic text-ink-soft">
                            <span className="font-display text-[9px] not-italic uppercase tracking-wider text-crimson">
                              Trigger:{' '}
                            </span>
                            <MentionText
                              text={c.triggerNote}
                              campaignData={state}
                              onNavigate={(t, id) => setInspectedNode({ type: t, id })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ===================================================================
          LOWER COCKPIT DECK: MODULE 4 (RAG PREP) + MODULE 3 (DELTA LOG) + MODULE 5 (K1C PRINT QUEUE)
         =================================================================== */}
      <LoreRagAssistant
        state={state}
        setState={setState}
        selectedLocationId={activeLocationEntityId}
        onSelectLocationId={setPinnedLocId}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SessionDeltaLogPanel state={state} setState={setState} compact />
        <K1CPrintQueuePanel state={state} setState={setState} compact />
      </div>
    </div>
  );
}
