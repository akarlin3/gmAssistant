'use client';

import React, { useMemo, useState } from 'react';
import {
  Eye,
  X,
  Copy,
  Check,
  Users,
  ShieldCheck,
  Sparkles,
  ScrollText,
  Settings2,
} from 'lucide-react';
import { buildSlotProjection } from '@/lib/playerMode/projection';
import { playUrl } from '@/lib/playerMode/publish';
import { isEntityPlayerVisible } from '@/lib/playerMode/spoilers';
import EntityCard from '@/components/playerCampaign/EntityCard';
import PlayerModePanel from '@/components/PlayerModePanel';
import { GuidedEmptyState } from '@/components/ui/GuidedEmptyState';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import type { PlayerCharacter } from '@/lib/pc/types';

export interface PreviewAsPartyDrawerProps {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  data: Record<string, any>;
  config: PlayerConfig;
  onConfigChange: (next: PlayerConfig) => void;
  confirm: (o: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }) => Promise<boolean>;
  playerLog: PlayerLogEntry[];
  onPlayerLogChange: (entries: PlayerLogEntry[]) => void;
  onPcsChange?: (next: PlayerCharacter[]) => void;
}

export function PreviewAsPartyDrawer({
  open,
  onClose,
  campaignId,
  campaignName,
  data,
  config,
  onConfigChange,
  confirm,
  playerLog,
  onPlayerLogChange,
  onPcsChange,
}: PreviewAsPartyDrawerProps) {
  const roster = config?.roster ?? [];
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [activeSubView, setActiveSubView] = useState<'preview' | 'settings'>('preview');
  const [copied, setCopied] = useState(false);

  const effectiveSlotId = selectedSlotId || roster[0]?.slotId || 'party-preview-slot';

  // Sync entity-level visibility flags into a synthetic PlayerConfig so both
  // entity.visibility / entity.revealedToPlayers AND config.entityVisibility are reflected live
  const mergedConfig = useMemo<PlayerConfig>(() => {
    const baseVis = { ...(config?.entityVisibility ?? {}) };
    const collections = ['npcs', 'locations', 'factions', 'clocks', 'characters', 'pcs'] as const;

    for (const col of collections) {
      const arr = Array.isArray(data?.[col]) ? data[col] : [];
      const colMap: Record<string, any> = { ...(baseVis[col] ?? {}) };
      arr.forEach((item: any, idx: number) => {
        if (!item || typeof item !== 'object') return;
        const id =
          item.id ||
          (col === 'npcs'
            ? `npc-${idx}`
            : col === 'locations'
              ? `loc-${idx}`
              : col === 'factions'
                ? `fac-${idx}`
                : col === 'clocks'
                  ? `clock-${idx}`
                  : `${col}-${idx}`);
        if (colMap[id]) return;
        if (item.visibility?.scope === 'party') {
          colMap[id] = { mode: 'party' };
        } else if (
          item.visibility?.scope === 'slots' &&
          Array.isArray(item.visibility.slotIds)
        ) {
          colMap[id] = {
            mode: 'custom',
            allowedSlotIds: item.visibility.slotIds,
          };
        } else if (isEntityPlayerVisible(item, col as any, config)) {
          colMap[id] = { mode: 'party' };
        }
      });
      baseVis[col] = colMap;
    }

    return {
      ...config,
      tokenVersion: config?.tokenVersion ?? 1,
      roster: config?.roster ?? [],
      entityVisibility: baseVis,
    };
  }, [config, data]);

  const projection = useMemo(() => {
    const normalizedData: Record<string, any> = {
      ...data,
      npcs: (data?.npcs || []).map((n: any, i: number) => ({
        ...n,
        id: n?.id || `npc-${i}`,
      })),
      locations: (data?.locations || []).map((l: any, i: number) => ({
        ...l,
        id: l?.id || `loc-${i}`,
      })),
      factions: (data?.factions || []).map((f: any, i: number) => ({
        ...f,
        id: f?.id || `fac-${i}`,
      })),
      clocks: (data?.clocks || []).map((c: any, i: number) => ({
        ...c,
        id: c?.id || `clock-${i}`,
      })),
      player: mergedConfig,
    };
    return buildSlotProjection(
      normalizedData as any,
      campaignName,
      effectiveSlotId,
    );
  }, [data, mergedConfig, campaignName, effectiveSlotId]);

  if (!open) return null;

  const shareLink = config?.shareToken ? playUrl(config.shareToken) : null;

  const handleCopyShareLink = async () => {
    if (!shareLink || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const npcs = (projection.entities.npcs ?? []) as Record<string, any>[];
  const locations = (projection.entities.locations ?? []) as Record<string, any>[];
  const factions = (projection.entities.factions ?? []) as Record<string, any>[];
  const clocks = (projection.entities.clocks ?? []) as Record<string, any>[];
  const totalVisibleEntities =
    npcs.length + locations.length + factions.length + clocks.length;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        aria-label="Preview as Party"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
              <Eye size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                  Preview as Party
                </h2>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  Live Redacted /player View
                </span>
              </div>
              <p className="font-sans text-xs text-[var(--text-muted)]">
                Exact projection via <code className="font-mono">buildSlotProjection</code> — GM secrets &amp; private fields stripped
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5">
              <button
                type="button"
                onClick={() => setActiveSubView('preview')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
                  activeSubView === 'preview'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Eye size={12} />
                <span>Live Projection</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView('settings')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
                  activeSubView === 'settings'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Settings2 size={12} />
                <span>Share &amp; Roster</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Preview as Party drawer"
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sub-Toolbar: Slot Switcher & Share Link */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <Users size={13} className="text-[var(--text-muted)]" />
            <label
              htmlFor="preview-slot-select"
              className="font-sans text-xs font-medium text-[var(--text-muted)]"
            >
              Viewing as:
            </label>
            <select
              id="preview-slot-select"
              value={selectedSlotId}
              onChange={(e) => setSelectedSlotId(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-sans text-xs text-[var(--text-primary)]"
            >
              <option value="">All Party (👁️ Party Scope)</option>
              {roster.map((slot) => (
                <option key={slot.slotId} value={slot.slotId}>
                  🎯 {slot.displayName} ({slot.slotId})
                </option>
              ))}
            </select>
          </div>

          {shareLink ? (
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-sans text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied /player Link' : 'Copy /player Share Link'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveSubView('settings')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-sans text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <span>Enable Live Share Link →</span>
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeSubView === 'settings' ? (
            <PlayerModePanel
              campaignId={campaignId}
              campaignName={campaignName}
              data={data}
              config={config}
              onConfigChange={onConfigChange}
              confirm={confirm}
              playerLog={playerLog}
              onPlayerLogChange={onPlayerLogChange}
              onPcsChange={onPcsChange}
            />
          ) : (
            <div className="space-y-6">
              {/* Summary Strip */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-center">
                  <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
                    {npcs.length}
                  </div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">
                    Revealed NPCs
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-center">
                  <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
                    {locations.length}
                  </div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">
                    Locations
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-center">
                  <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
                    {factions.length + clocks.length}
                  </div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">
                    Factions &amp; Clocks
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-center">
                  <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
                    {projection.sessionLog.length}
                  </div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">
                    Narration Posts
                  </div>
                </div>
              </div>

              {totalVisibleEntities === 0 &&
              projection.sessionLog.length === 0 &&
              !projection.handouts &&
              (!projection.items || projection.items.length === 0) ? (
                <GuidedEmptyState
                  icon={<ShieldCheck size={20} />}
                  title="Zero GM Secrets Leaked — Nothing Revealed Yet"
                  description="All NPCs, locations, factions, and clocks are currently 🔒 Private. Toggle any entity pill to 👁️ Party or 🎯 Custom to project it live to your players."
                  actions={[
                    {
                      label: 'Configure Share & Roster',
                      onClick: () => setActiveSubView('settings'),
                    },
                  ]}
                />
              ) : (
                <>
                  {/* Session Narration Feed */}
                  {projection.sessionLog.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-1.5 font-display text-base font-semibold text-[var(--text-primary)]">
                        <ScrollText size={14} className="text-emerald-400" />
                        <span>Live Table Narration Feed</span>
                      </h3>
                      <div className="space-y-2">
                        {projection.sessionLog.map((entry: any, idx: number) => (
                          <div
                            key={entry.id || idx}
                            className="rounded-lg border border-l-2 border-[var(--border-subtle)] border-l-emerald-500 bg-[var(--bg-surface)] p-3 font-sans text-xs leading-relaxed text-[var(--text-primary)]"
                          >
                            {entry.text}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Revealed NPCs */}
                  {npcs.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-1.5 font-display text-base font-semibold text-[var(--text-primary)]">
                        <Sparkles size={14} className="text-emerald-400" />
                        <span>Revealed NPCs ({npcs.length})</span>
                      </h3>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {npcs.map((npc) => (
                          <EntityCard key={npc.id} type="npcs" entity={npc} />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Revealed Locations */}
                  {locations.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                        Revealed Locations ({locations.length})
                      </h3>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {locations.map((loc) => (
                          <EntityCard key={loc.id} type="locations" entity={loc} />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Revealed Factions & Clocks */}
                  {(factions.length > 0 || clocks.length > 0) && (
                    <section className="space-y-2">
                      <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                        Revealed Factions &amp; Clocks ({factions.length + clocks.length})
                      </h3>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {factions.map((fac) => (
                          <EntityCard key={fac.id} type="factions" entity={fac} />
                        ))}
                        {clocks.map((clk) => (
                          <EntityCard key={clk.id} type="clocks" entity={clk} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
