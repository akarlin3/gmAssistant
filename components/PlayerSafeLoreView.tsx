'use client';

import React, { useMemo, useState } from 'react';
import {
  Eye,
  Search,
  Network,
  User,
  Users,
  Map as MapIcon,
  Gift,
  Clock,
  ScrollText,
  ShieldCheck,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import {
  buildPlayerSafeLoreSnapshot,
  type PlayerSafeNode,
} from '@/lib/playerMode/spoilers';
import { ENTITY_COLORS, ENTITY_LABELS } from '@/lib/wiki/colors';
import type { EntityType } from '@/lib/wiki/types';

export type PlayerSafeLoreViewProps = {
  data?: Record<string, any> | null;
  campaignData?: Record<string, any> | null;
  campaignId?: string;
  campaignName?: string;
  onExitPlayerView?: () => void;
  embedded?: boolean;
};

const TYPE_ICONS: Partial<Record<EntityType, any>> = {
  npc: User,
  location: MapIcon,
  faction: Users,
  magicItem: Gift,
  factionClock: Clock,
};

export default function PlayerSafeLoreView({
  data,
  campaignData,
  campaignName = 'Campaign',
  onExitPlayerView,
  embedded = false,
}: PlayerSafeLoreViewProps) {
  const effectiveData = data ?? campaignData;
  const snapshot = useMemo(
    () => buildPlayerSafeLoreSnapshot(effectiveData, campaignName),
    [effectiveData, campaignName],
  );

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | EntityType>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const filteredNodes = useMemo(() => {
    return snapshot.nodes.filter((n) => {
      if (filterType !== 'all' && n.type !== filterType) return false;
      if (!q) return true;
      if (n.name.toLowerCase().includes(q)) return true;
      if (n.summary.toLowerCase().includes(q)) return true;
      return n.fields.some(
        (f) => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q),
      );
    });
  }, [snapshot.nodes, filterType, q]);

  const selectedNode = useMemo<PlayerSafeNode | null>(() => {
    if (!selectedKey) return filteredNodes[0] ?? null;
    return (
      snapshot.nodes.find((n) => `${n.type}:${n.id}` === selectedKey) ??
      filteredNodes[0] ??
      null
    );
  }, [selectedKey, snapshot.nodes, filteredNodes]);

  const connectedToSelected = useMemo(() => {
    if (!selectedNode) return [];
    const results: Array<{ node: PlayerSafeNode; relationLabel: string }> = [];
    for (const edge of snapshot.edges) {
      if (edge.fromType === selectedNode.type && edge.fromId === selectedNode.id) {
        const other = snapshot.nodes.find(
          (n) => n.type === edge.toType && n.id === edge.toId,
        );
        if (other) results.push({ node: other, relationLabel: edge.label });
      } else if (edge.toType === selectedNode.type && edge.toId === selectedNode.id) {
        const other = snapshot.nodes.find(
          (n) => n.type === edge.fromType && n.id === edge.fromId,
        );
        if (other) results.push({ node: other, relationLabel: edge.inverseLabel });
      }
    }
    return results;
  }, [selectedNode, snapshot.edges, snapshot.nodes]);

  const countsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of snapshot.nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts;
  }, [snapshot.nodes]);

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-6xl space-y-4 p-4 sm:p-6'}>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-moss/40 bg-moss/5 p-3.5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-moss/50 bg-moss/15 text-moss">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-[10px] uppercase tracking-[0.25em] text-moss">
                Read-Only /player-view · Player-Safe Lore Filter
              </span>
              <span className="inline-flex items-center gap-1 rounded-sm border border-brass-deep/40 bg-parchment px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                <Calendar size={10} /> In-World Day {snapshot.inWorldDay}
              </span>
            </div>
            <h2 className="font-display text-lg tracking-wide text-ink sm:text-xl">
              {snapshot.campaignName} — Discovered Lore &amp; Connections
            </h2>
            <p className="font-serif text-xs italic text-ink-soft">
              Showing only entities &amp; custom items marked <code className="font-mono">player_visible: true</code>. All GM secrets and <code className="font-mono">||spoiler||</code> blocks are stripped.
            </p>
          </div>
        </div>
        {onExitPlayerView && (
          <button
            type="button"
            onClick={onExitPlayerView}
            className="flex items-center gap-1.5 rounded border border-brass-deep/60 bg-parchment px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
          >
            <ArrowLeft size={12} /> Exit Player View
          </button>
        )}
      </header>

      {/* Filter & Search Bar */}
      <div className="space-y-2.5 rounded-lg border border-rule bg-parchment-soft p-3 shadow-card">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-brass-deep" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search discovered NPCs, locations, factions, artifacts, clocks…"
            className="flex-1 rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-sm text-ink placeholder:text-ink-faint focus:border-moss focus:outline-none"
          />
          <span className="font-display text-xs text-brass-deep">
            {filteredNodes.length} discovered
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['all', `All (${snapshot.nodes.length})`],
              ['location', `Locations (${countsByType.location ?? 0})`],
              ['npc', `NPCs (${countsByType.npc ?? 0})`],
              ['faction', `Factions (${countsByType.faction ?? 0})`],
              ['magicItem', `Artifacts & Items (${countsByType.magicItem ?? 0})`],
              ['factionClock', `Public Clocks (${countsByType.factionClock ?? 0})`],
            ] as Array<['all' | EntityType, string]>
          ).map(([typeKey, label]) => (
            <button
              key={typeKey}
              type="button"
              onClick={() => setFilterType(typeKey)}
              className={`rounded-sm border px-2.5 py-1 font-display text-[10px] uppercase tracking-wider transition-colors ${
                filterType === typeKey
                  ? 'border-moss bg-moss text-parchment'
                  : 'border-rule bg-parchment text-ink-soft hover:bg-parchment-deep'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {snapshot.nodes.length === 0 && snapshot.revealedSecrets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule bg-parchment-soft p-8 text-center">
          <Eye size={24} className="mx-auto mb-2 text-ink-mute" />
          <p className="font-display text-sm uppercase tracking-wider text-ink">
            No Discovered Lore Yet
          </p>
          <p className="mt-1 font-serif text-xs italic text-ink-mute">
            Toggle <code className="font-mono">player_visible</code> on any Location, NPC, Faction, Clock, or Custom Item to reveal it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          {/* Left: Discovered Lore Cards Grid */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filteredNodes.map((node) => {
                const key = `${node.type}:${node.id}`;
                const isSelected =
                  selectedNode &&
                  selectedNode.type === node.type &&
                  selectedNode.id === node.id;
                const Icon = TYPE_ICONS[node.type] ?? Network;
                const connCount = snapshot.edges.filter(
                  (e) =>
                    (e.fromType === node.type && e.fromId === node.id) ||
                    (e.toType === node.type && e.toId === node.id),
                ).length;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-moss bg-moss/10 ring-1 ring-moss/40 shadow-card'
                        : 'border-rule bg-parchment hover:border-brass-deep hover:bg-parchment-soft'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ background: ENTITY_COLORS[node.type] }}
                        />
                        <Icon size={11} />
                        {ENTITY_LABELS[node.type]}
                      </span>
                      <span className="rounded-full border border-rule bg-parchment-soft px-1.5 py-px font-display text-[9px] uppercase tracking-wider text-ink-mute">
                        {connCount} link{connCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-base text-ink">{node.name}</h3>
                    {node.subtitle && (
                      <div className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                        {node.subtitle}
                      </div>
                    )}
                    <p className="mt-1 line-clamp-2 font-serif text-xs leading-relaxed text-ink-soft">
                      {node.summary}
                    </p>
                  </button>
                );
              })}
            </div>

            {snapshot.revealedSecrets.length > 0 && (
              <section className="rounded-lg border border-rule bg-parchment p-3.5 shadow-card">
                <div className="mb-2 flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
                  <ScrollText size={13} /> Discovered Clues &amp; Rumors ({snapshot.revealedSecrets.length})
                </div>
                <ul className="space-y-1.5">
                  {snapshot.revealedSecrets.map((sec, idx) => (
                    <li
                      key={idx}
                      className="rounded border border-moss/30 bg-moss/5 px-2.5 py-1.5 font-serif text-xs text-ink"
                    >
                      • {sec}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Right: Connected Lore Node Inspector */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            {selectedNode ? (
              <div className="space-y-3 rounded-lg border border-moss/50 bg-parchment p-4 shadow-card">
                <div className="border-b border-rule pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-moss">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: ENTITY_COLORS[selectedNode.type] }}
                      />
                      {ENTITY_LABELS[selectedNode.type]} · Discovered Node
                    </span>
                    <span className="rounded border border-moss/40 bg-moss/10 px-1.5 py-px font-display text-[9px] uppercase tracking-wider text-moss">
                      Player Safe
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-xl text-ink">{selectedNode.name}</h3>
                  {selectedNode.subtitle && (
                    <p className="font-display text-xs uppercase tracking-wider text-brass-deep">
                      {selectedNode.subtitle}
                    </p>
                  )}
                </div>

                {selectedNode.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="rounded-sm border border-rule bg-parchment-soft px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {selectedNode.fields.length > 0 ? (
                  <div className="space-y-2">
                    {selectedNode.fields.map((f, i) => (
                      <div
                        key={i}
                        className="rounded border border-rule/70 bg-parchment-soft p-2.5"
                      >
                        <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                          {f.label}
                        </div>
                        <div className="mt-0.5 whitespace-pre-wrap font-serif text-xs leading-relaxed text-ink">
                          {f.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-serif text-xs italic text-ink-soft">
                    {selectedNode.summary}
                  </p>
                )}

                {/* Connected Player-Visible Lore Nodes */}
                <div className="border-t border-rule pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
                      <Network size={13} /> Connected Lore Nodes ({connectedToSelected.length})
                    </span>
                  </div>
                  {connectedToSelected.length === 0 ? (
                    <p className="font-serif text-xs italic text-ink-mute">
                      No other discovered lore nodes are linked to {selectedNode.name} yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {connectedToSelected.map(({ node, relationLabel }) => (
                        <button
                          key={`${node.type}:${node.id}`}
                          type="button"
                          onClick={() => setSelectedKey(`${node.type}:${node.id}`)}
                          className="flex w-full items-center justify-between gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-2 text-left transition-colors hover:border-moss hover:bg-moss/10"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                              <span
                                className="inline-block size-2 rounded-full"
                                style={{ background: ENTITY_COLORS[node.type] }}
                              />
                              {relationLabel} · {ENTITY_LABELS[node.type]}
                            </div>
                            <div className="truncate font-display text-sm text-ink">
                              {node.name}
                            </div>
                          </div>
                          <span className="font-display text-[10px] uppercase tracking-wider text-moss">
                            Inspect →
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-rule bg-parchment p-4 text-center font-serif text-sm italic text-ink-mute">
                Click any discovered entity on the left to inspect its lore and connected nodes.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
