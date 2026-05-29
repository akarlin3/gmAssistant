'use client';

// The "Wiki" subview (Phases 3 + 4). Combines the campaign relationship graph,
// entity-type / relationship-kind filters, a spotlight depth control, a click-
// to-open side panel (reusing RelationshipsSection), and the Pending
// Suggestions list with Accept / Reject. Everything is driven by WikiContext.

import { useMemo, useState } from 'react';
import { Check, X, Wand2, Network } from 'lucide-react';
import { useWiki, WikiProvider } from './WikiContext';
import WikiGraph from './WikiGraph';
import RelationshipsSection from './RelationshipsSection';
import { ENTITY_COLORS, ENTITY_LABELS, edgeColor } from '@/lib/wiki/colors';
import { entityKey, type WikiEntity } from '@/lib/wiki/entities';
import { ruleFor } from '@/lib/wiki/catalog';
import { effectiveWeight } from '@/lib/wiki/edges';
import type { EntityType, Relationship, RelationshipKind } from '@/lib/wiki/types';

export default function WikiTab() {
  const wiki = useWiki();
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<RelationshipKind>>(new Set());
  const [selected, setSelected] = useState<WikiEntity | null>(null);
  const [edgePopover, setEdgePopover] = useState<{ rel: Relationship; x: number; y: number } | null>(
    null,
  );
  const [spotlight, setSpotlight] = useState(false);
  const [depth, setDepth] = useState(2);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const allRels = wiki?.relationships ?? [];
  const confirmed = allRels.filter((r) => !r.suggested);
  const pending = allRels.filter((r) => r.suggested);
  const allEntities = useMemo(() => wiki?.index.entities ?? [], [wiki?.index]);

  // Which entity types / kinds actually appear, for the filter chips.
  const presentTypes = useMemo(() => {
    const s = new Set<EntityType>();
    for (const e of allEntities) s.add(e.type);
    return [...s].sort();
  }, [allEntities]);

  const presentKinds = useMemo(() => {
    const s = new Set<RelationshipKind>();
    for (const r of confirmed) s.add(r.kind);
    return [...s].sort();
  }, [confirmed]);

  const visibleEntities = useMemo(
    () => allEntities.filter((e) => !hiddenTypes.has(e.type)),
    [allEntities, hiddenTypes],
  );

  const visibleRels = useMemo(
    () => confirmed.filter((r) => !hiddenKinds.has(r.kind)),
    [confirmed, hiddenKinds],
  );

  if (!wiki) return null;

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const selectedKey = selected ? entityKey(selected.type, selected.id) : null;

  const doRescan = () => {
    if (!wiki.rescan) return;
    const n = wiki.rescan();
    setScanMsg(
      n > 0 ? `Found ${n} new suggestion${n === 1 ? '' : 's'}.` : 'No new suggestions found.',
    );
    setTimeout(() => setScanMsg(null), 4000);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg uppercase tracking-wide text-ink">
            <Network size={18} className="text-brass-deep" /> Campaign Wiki
          </h2>
          <p className="font-serif text-xs italic text-ink-mute">
            Every entity and how it connects. Click a node to inspect and edit its relationships.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scanMsg && <span className="font-serif text-xs italic text-brass-deep">{scanMsg}</span>}
          {wiki.rescan && (
            <button
              onClick={doRescan}
              className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
              title="Scan session recaps, the scratchpad, and scene transcripts for @-mentioned entity pairs"
            >
              <Wand2 size={12} /> Scan For Suggestions
            </button>
          )}
        </div>
      </header>

      {pending.length > 0 && (
        <section className="rounded-lg border border-brass/50 bg-brass/5 p-3">
          <h3 className="mb-2 font-display text-sm uppercase tracking-wide text-brass-deep">
            Pending Suggestions ({pending.length})
          </h3>
          <ul className="space-y-1.5">
            {pending.map((r) => {
              const from = wiki.resolve(r.fromType, r.fromId);
              const to = wiki.resolve(r.toType, r.toId);
              const rule = ruleFor(r.kind);
              return (
                <li
                  key={r.id}
                  data-pending-suggestion
                  className="flex items-center justify-between gap-2 rounded border border-rule bg-parchment px-2 py-1.5"
                >
                  <span className="min-w-0 font-serif text-sm text-ink">
                    <span className="font-display">{from?.name ?? '(removed)'}</span>
                    <span className="mx-1.5 text-ink-mute">
                      {rule?.label.toLowerCase() ?? r.kind}
                    </span>
                    <span className="font-display">{to?.name ?? '(removed)'}</span>
                  </span>
                  <span className="flex flex-shrink-0 gap-1">
                    <button
                      onClick={() => wiki.acceptSuggestion(r.id)}
                      className="flex items-center gap-1 rounded border border-moss/50 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-moss hover:bg-moss/10"
                    >
                      <Check size={12} /> Accept
                    </button>
                    <button
                      onClick={() => wiki.rejectSuggestion(r.id)}
                      className="flex items-center gap-1 rounded border border-crimson/50 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10"
                    >
                      <X size={12} /> Reject
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Filters */}
      <div className="space-y-2 rounded-lg border border-rule bg-parchment-soft p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
            Entities:
          </span>
          {presentTypes.map((t) => {
            const on = !hiddenTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => setHiddenTypes((s) => toggle(s, t))}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-opacity ${
                  on ? 'border-rule text-ink' : 'border-rule text-ink-faint opacity-50'
                }`}
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: ENTITY_COLORS[t] }}
                />
                {ENTITY_LABELS[t]}
              </button>
            );
          })}
        </div>
        {presentKinds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
              Links:
            </span>
            {presentKinds.map((k) => {
              const on = !hiddenKinds.has(k);
              return (
                <button
                  key={k}
                  onClick={() => setHiddenKinds((s) => toggle(s, k))}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-opacity ${
                    on ? 'border-rule text-ink' : 'border-rule text-ink-faint opacity-50'
                  }`}
                >
                  <span className="inline-block h-1 w-3" style={{ background: edgeColor(k) }} />
                  {ruleFor(k)?.label ?? k}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
            <input
              type="checkbox"
              checked={spotlight}
              onChange={(e) => setSpotlight(e.target.checked)}
              className="accent-crimson"
            />
            Spotlight
          </label>
          {spotlight && (
            <label className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
              Depth
              <input
                type="range"
                min={1}
                max={4}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="accent-crimson"
              />
              <span className="text-ink">{depth}</span>
            </label>
          )}
          <span className="ml-auto font-serif text-xs italic text-ink-mute">
            {visibleEntities.length} entities · {visibleRels.length} links
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <WikiGraph
          entities={visibleEntities}
          relationships={visibleRels}
          selectedKey={spotlight ? selectedKey : null}
          spotlightDepth={depth}
          onNodeClick={(e) => {
            setEdgePopover(null);
            setSelected(e);
          }}
          onEdgeClick={(rel, pos) => setEdgePopover({ rel, x: pos.x, y: pos.y })}
        />
        <aside className="rounded-lg border border-rule bg-parchment p-3 shadow-card">
          {selected ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: ENTITY_COLORS[selected.type] }}
                    />
                    <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                      {ENTITY_LABELS[selected.type]}
                    </span>
                  </div>
                  <h3 className="font-display text-base text-ink">{selected.name}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close panel"
                  className="text-ink-mute hover:text-crimson"
                >
                  <X size={16} />
                </button>
              </div>
              {selected.body && (
                <p className="font-serif text-xs italic leading-relaxed text-ink-soft">
                  {selected.body}
                </p>
              )}
              <WikiProvider
                value={{
                  ...wiki,
                  navigateToEntity: (type, id) => {
                    const e = wiki.resolve(type, id);
                    if (e) setSelected(e);
                  },
                }}
              >
                <RelationshipsSection
                  entityType={selected.type}
                  entityId={selected.id}
                  entityName={selected.name}
                />
              </WikiProvider>
            </div>
          ) : (
            <p className="font-serif text-sm italic text-ink-mute">
              Click a node in the graph to inspect that entity and add or remove its relationships.
            </p>
          )}
        </aside>
      </div>

      {edgePopover && <EdgePopover entry={edgePopover} onClose={() => setEdgePopover(null)} />}
    </div>
  );
}

// Read-only edge inspector. Clicking an edge in the graph surfaces its type,
// effective weight, and player-mode visibility. No editing from the graph this
// PR (CP2 is read-only); relationship edits stay in the sidebar editor.
function EdgePopover({
  entry,
  onClose,
}: {
  entry: { rel: Relationship; x: number; y: number };
  onClose: () => void;
}) {
  const { rel, x, y } = entry;
  const rule = ruleFor(rel.kind);
  const weight = effectiveWeight(rel);
  const visibility = rel.visibility ?? 'private';
  const visibilityLabel =
    visibility === 'party' ? 'Party (all players)' : visibility === 'custom' ? 'Custom slots' : 'Private (GM only)';
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-56 rounded-lg border border-rule bg-parchment p-3 shadow-card"
        style={{ left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 240), top: y + 8 }}
        role="dialog"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Relationship
          </span>
          <button onClick={onClose} aria-label="Close" className="text-ink-mute hover:text-crimson">
            <X size={14} />
          </button>
        </div>
        <dl className="space-y-1 font-serif text-xs text-ink">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-mute">Type</dt>
            <dd className="flex items-center gap-1.5 font-display">
              <span className="inline-block h-1 w-3 rounded" style={{ background: edgeColor(rel.kind) }} />
              {rule?.label ?? rel.kind}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-mute">Weight</dt>
            <dd className="font-display">{weight.toFixed(2)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-mute">Visibility</dt>
            <dd className="font-display">{visibilityLabel}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
