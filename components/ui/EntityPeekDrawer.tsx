'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { X, ExternalLink, FileText, Shield, Sparkles } from 'lucide-react';
import type { EntityType } from '@/lib/wiki/types';
import { ENTITY_COLORS, ENTITY_LABELS } from '@/lib/wiki/colors';
import { buildEntityIndex } from '@/lib/wiki/entities';
import { LoreNodeInspector } from '@/components/wiki/LoreNodeInspector';
import { GmVisibilityPill, PlayerPrivacyPill, type EntityVisibility, type PlayerSlot } from '@/components/ui/VisibilityBadge';

export interface PeekTarget {
  type: EntityType;
  id: string;
  name?: string;
}

interface EntityPeekContextValue {
  peekTarget: PeekTarget | null;
  openPeek: (type: EntityType, id: string, name?: string) => void;
  closePeek: () => void;
}

const EntityPeekContext = createContext<EntityPeekContextValue | null>(null);

export function useEntityPeek(): EntityPeekContextValue | null {
  return useContext(EntityPeekContext);
}

export interface EntityPeekProviderProps {
  children: React.ReactNode;
  campaignData?: Record<string, any> | null;
  playerSafe?: boolean;
  playerSlots?: PlayerSlot[];
  onUpdateCampaign?: (mutator: (draft: any) => void) => void;
  onJumpToEntity?: (type: EntityType, id: string) => void;
  playerNotes?: Record<string, { note?: string; attitude?: string; sharedWithGm?: boolean }>;
  onUpdatePlayerNote?: (
    entityKey: string,
    patch: { note?: string; attitude?: string; sharedWithGm?: boolean },
  ) => void;
}

export function EntityPeekProvider({
  children,
  campaignData,
  playerSafe = false,
  playerSlots = [],
  onUpdateCampaign,
  onJumpToEntity,
  playerNotes,
  onUpdatePlayerNote,
}: EntityPeekProviderProps) {
  const [peekTarget, setPeekTarget] = useState<PeekTarget | null>(null);

  const openPeek = useCallback((type: EntityType, id: string, name?: string) => {
    setPeekTarget({ type, id, name });
  }, []);

  const closePeek = useCallback(() => {
    setPeekTarget(null);
  }, []);

  useEffect(() => {
    if (!peekTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPeekTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peekTarget]);

  const value = useMemo(
    () => ({ peekTarget, openPeek, closePeek }),
    [peekTarget, openPeek, closePeek],
  );

  return (
    <EntityPeekContext.Provider value={value}>
      {children}
      {peekTarget && (
        <EntityPeekDrawer
          target={peekTarget}
          onClose={closePeek}
          onSelectNode={(type, id) => setPeekTarget({ type, id })}
          campaignData={campaignData}
          playerSafe={playerSafe}
          playerSlots={playerSlots}
          onUpdateCampaign={onUpdateCampaign}
          onJumpToEntity={onJumpToEntity}
          playerNotes={playerNotes}
          onUpdatePlayerNote={onUpdatePlayerNote}
        />
      )}
    </EntityPeekContext.Provider>
  );
}

export interface EntityPeekDrawerProps {
  target: PeekTarget;
  onClose: () => void;
  onSelectNode: (type: EntityType, id: string) => void;
  campaignData?: Record<string, any> | null;
  playerSafe?: boolean;
  playerSlots?: PlayerSlot[];
  onUpdateCampaign?: (mutator: (draft: any) => void) => void;
  onJumpToEntity?: (type: EntityType, id: string) => void;
  playerNotes?: Record<string, { note?: string; attitude?: string; sharedWithGm?: boolean }>;
  onUpdatePlayerNote?: (
    entityKey: string,
    patch: { note?: string; attitude?: string; sharedWithGm?: boolean },
  ) => void;
}

export function EntityPeekDrawer({
  target,
  onClose,
  onSelectNode,
  campaignData,
  playerSafe = false,
  playerSlots = [],
  onUpdateCampaign,
  onJumpToEntity,
  playerNotes,
  onUpdatePlayerNote,
}: EntityPeekDrawerProps) {
  const { type, id } = target;
  const entityKey = `${type}:${id}`;

  // Resolve raw entity from campaignData for editing/stats
  const rawRecord = useMemo(() => {
    if (!campaignData) return null;
    if (type === 'npc') {
      return (campaignData.npcs || []).find(
        (n: any, i: number) => (n?.id || `npc-${i}`) === id,
      );
    }
    if (type === 'location') {
      return (campaignData.locations || []).find(
        (l: any, i: number) => (l?.id || `loc-${i}`) === id,
      );
    }
    if (type === 'faction') {
      return (campaignData.factions || []).find(
        (f: any, i: number) => (f?.id || `fac-${i}`) === id,
      );
    }
    if (type === 'factionClock') {
      return (campaignData.clocks || []).find(
        (c: any, i: number) => (c?.id || `clock-${i}`) === id,
      );
    }
    if (type === 'pc') {
      return (campaignData.characters || []).find(
        (c: any, i: number) => (c?.id || `pc-${i}`) === id,
      );
    }
    return null;
  }, [campaignData, type, id]);

  const entityIndexNode = useMemo(() => {
    if (!campaignData) return null;
    const idx = buildEntityIndex(campaignData);
    return idx.byKey.get(entityKey) ?? null;
  }, [campaignData, entityKey]);

  const displayName =
    rawRecord?.name || entityIndexNode?.name || target.name || id;

  // Local fallback storage for player private notes if no external handler is supplied
  const [localAnnotation, setLocalAnnotation] = useState<string>('');
  const [localAttitude, setLocalAttitude] = useState<string>('neutral');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(`gma_peek_note_${entityKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setLocalAnnotation(parsed.note || '');
        setLocalAttitude(parsed.attitude || 'neutral');
      } else {
        setLocalAnnotation('');
        setLocalAttitude('neutral');
      }
    } catch {
      setLocalAnnotation('');
    }
  }, [entityKey]);

  const activePlayerNote = playerNotes?.[entityKey]?.note ?? localAnnotation;
  const activePlayerAttitude =
    playerNotes?.[entityKey]?.attitude ?? localAttitude;

  const handlePlayerNoteChange = (nextNote: string) => {
    setLocalAnnotation(nextNote);
    if (onUpdatePlayerNote) {
      onUpdatePlayerNote(entityKey, { note: nextNote });
    } else if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          `gma_peek_note_${entityKey}`,
          JSON.stringify({ note: nextNote, attitude: activePlayerAttitude }),
        );
      } catch {
        // Ignore storage write errors
      }
    }
  };

  const handlePlayerAttitudeChange = (nextAttitude: string) => {
    setLocalAttitude(nextAttitude);
    if (onUpdatePlayerNote) {
      onUpdatePlayerNote(entityKey, { attitude: nextAttitude });
    } else if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          `gma_peek_note_${entityKey}`,
          JSON.stringify({ note: activePlayerNote, attitude: nextAttitude }),
        );
      } catch {
        // Ignore
      }
    }
  };

  const handleGmVisibilityChange = (
    nextVis: EntityVisibility,
    legacyRevealed: boolean,
  ) => {
    if (!onUpdateCampaign) return;
    onUpdateCampaign((draft: any) => {
      const listKey =
        type === 'npc'
          ? 'npcs'
          : type === 'location'
            ? 'locations'
            : type === 'faction'
              ? 'factions'
              : type === 'factionClock'
                ? 'clocks'
                : null;
      if (!listKey || !Array.isArray(draft[listKey])) return;
      const prefix =
        type === 'npc'
          ? 'npc-'
          : type === 'location'
            ? 'loc-'
            : type === 'faction'
              ? 'fac-'
              : 'clock-';
      const item = draft[listKey].find(
        (entry: any, idx: number) => (entry?.id || `${prefix}${idx}`) === id,
      );
      if (item) {
        item.visibility = nextVis;
        item.revealedToPlayers = legacyRevealed;
        item.player_visible = legacyRevealed;
      }
    });
  };

  const handleGmNotesChange = (nextNotes: string) => {
    if (!onUpdateCampaign) return;
    onUpdateCampaign((draft: any) => {
      if (type === 'npc' && Array.isArray(draft.npcs)) {
        const item = draft.npcs.find(
          (n: any, idx: number) => (n?.id || `npc-${idx}`) === id,
        );
        if (item) item.notes = nextNotes;
      } else if (type === 'location' && Array.isArray(draft.locations)) {
        const item = draft.locations.find(
          (l: any, idx: number) => (l?.id || `loc-${idx}`) === id,
        );
        if (item) item.sensory = nextNotes;
      } else if (type === 'faction' && Array.isArray(draft.factions)) {
        const item = draft.factions.find(
          (f: any, idx: number) => (f?.id || `fac-${idx}`) === id,
        );
        if (item) item.goal = nextNotes;
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        aria-label={`Inspect ${displayName}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl"
      >
        {/* Top Drawer Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: ENTITY_COLORS[type] || '#6366f1' }}
              />
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {ENTITY_LABELS[type] || type} · Peek Inspector
              </span>
              {!playerSafe ? (
                <GmVisibilityPill
                  visibility={rawRecord?.visibility}
                  legacyRevealed={
                    rawRecord?.player_visible ?? rawRecord?.revealedToPlayers
                  }
                  playerSlots={playerSlots}
                  onChange={onUpdateCampaign ? handleGmVisibilityChange : undefined}
                />
              ) : (
                <PlayerPrivacyPill sharedWithGm={false} compact />
              )}
            </div>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold text-[var(--text-primary)]">
              {displayName}
            </h2>
            {(rawRecord?.role || rawRecord?.type || rawRecord?.class) && (
              <p className="mt-0.5 font-sans text-xs text-[var(--text-muted)]">
                {rawRecord.role || rawRecord.type || rawRecord.class}
                {rawRecord?.faction ? ` · ${rawRecord.faction}` : ''}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {!playerSafe && onJumpToEntity && (
              <button
                type="button"
                onClick={() => {
                  onJumpToEntity(type, id);
                  onClose();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 font-sans text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                title="Jump to full card in workspace"
              >
                <ExternalLink size={12} />
                <span>Open Card</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close entity peek drawer"
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Inspector Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Quick Stat Strip for NPCs / PCs */}
          {rawRecord && (type === 'npc' || type === 'pc') && (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <div>
                <div className="font-sans text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  HP / Vitality
                </div>
                <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-[var(--text-primary)]">
                  {rawRecord.hpCurrent !== undefined && rawRecord.hpMax !== undefined
                    ? `${rawRecord.hpCurrent}/${rawRecord.hpMax}`
                    : rawRecord.hp || '—'}
                </div>
              </div>
              <div>
                <div className="font-sans text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  Armor Class
                </div>
                <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-[var(--text-primary)]">
                  {rawRecord.ac || '—'}
                </div>
              </div>
              <div>
                <div className="font-sans text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  {type === 'pc' ? 'Passive Perc.' : 'Attitude / Role'}
                </div>
                <div className="mt-0.5 truncate font-mono text-xs font-medium tabular-nums text-[var(--text-primary)]">
                  {type === 'pc'
                    ? rawRecord.passivePerception || 10
                    : rawRecord.role || 'Neutral'}
                </div>
              </div>
            </div>
          )}

          {/* GM Editable Notes or Quick Summary */}
          {!playerSafe && onUpdateCampaign && (type === 'npc' || type === 'location' || type === 'faction') && (
            <div className="space-y-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 font-sans text-xs font-semibold text-[var(--text-primary)]">
                  <FileText size={13} className="text-[var(--accent-primary)]" />
                  <span>
                    {type === 'npc'
                      ? 'GM Notes & Secrets'
                      : type === 'location'
                        ? 'Sensory & Location Details'
                        : 'Faction Goal & Notes'}
                  </span>
                </label>
                <span className="font-sans text-[10px] text-[var(--text-muted)]">
                  Auto-saved
                </span>
              </div>
              <textarea
                rows={4}
                value={
                  type === 'npc'
                    ? rawRecord?.notes || ''
                    : type === 'location'
                      ? rawRecord?.sensory || ''
                      : rawRecord?.goal || ''
                }
                onChange={(e) => handleGmNotesChange(e.target.value)}
                placeholder="Jot GM notes, @Entity mentions, or ||spoiler|| blocks…"
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-sans text-xs leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          )}

          {/* Player Private Annotations (when in Player Mode or /player) */}
          <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-sans text-xs font-semibold text-[var(--text-primary)]">
                <Shield size={13} className="text-violet-400" />
                <span>Private Player Annotation</span>
              </span>
              <PlayerPrivacyPill sharedWithGm={false} compact />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {(['friendly', 'ally', 'neutral', 'suspicious', 'hostile'] as const).map(
                (att) => (
                  <button
                    key={att}
                    type="button"
                    onClick={() => handlePlayerAttitudeChange(att)}
                    className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium capitalize transition-colors ${
                      activePlayerAttitude === att
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {att}
                  </button>
                ),
              )}
            </div>
            <textarea
              rows={3}
              value={activePlayerNote}
              onChange={(e) => handlePlayerNoteChange(e.target.value)}
              placeholder="Write your personal notes about this entity (stored locally on your device)…"
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-sans text-xs leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Connected Lore Node Graph Inspector */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 font-sans text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Sparkles size={12} className="text-[var(--accent-primary)]" />
              <span>Lore Graph & Connections</span>
            </div>
            <LoreNodeInspector
              entityType={type}
              entityId={id}
              campaignData={campaignData}
              playerSafe={playerSafe}
              onSelectNode={(nextType, nextId) => onSelectNode(nextType, nextId)}
              onJumpToEditor={
                !playerSafe && onJumpToEntity
                  ? (t, targetId) => {
                      onJumpToEntity(t, targetId);
                      onClose();
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
