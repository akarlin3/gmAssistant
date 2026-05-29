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
import { ruleFor, validKinds, validTargets } from '@/lib/wiki/catalog';
import { effectiveWeight, defaultWeightForKind } from '@/lib/wiki/edges';
import type { EdgeVisibility, EntityType, Relationship, RelationshipKind } from '@/lib/wiki/types';

export default function WikiTab() {
  const wiki = useWiki();
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<RelationshipKind>>(new Set());
  const [selected, setSelected] = useState<WikiEntity | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<{ rel: Relationship; x: number; y: number } | null>(
    null,
  );
  // Drag-to-connect draft: two endpoints awaiting a kind/weight/visibility pick.
  const [connectDraft, setConnectDraft] = useState<{ from: WikiEntity; to: WikiEntity } | null>(
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
          editable
          onNodeClick={(e) => {
            setEdgeEditor(null);
            setSelected(e);
          }}
          onEdgeClick={(rel, pos) => setEdgeEditor({ rel, x: pos.x, y: pos.y })}
          onConnect={(source, target) => {
            const from = wiki.index.byKey.get(source);
            const to = wiki.index.byKey.get(target);
            if (from && to) {
              setEdgeEditor(null);
              setConnectDraft({ from, to });
            }
          }}
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
                <NodeStateEditor entity={selected} />
              </WikiProvider>
            </div>
          ) : (
            <p className="font-serif text-sm italic text-ink-mute">
              Click a node to inspect it; drag from a node’s connect dot to link two entities.
            </p>
          )}
        </aside>
      </div>

      {edgeEditor && (
        <EdgeEditor relId={edgeEditor.rel.id} x={edgeEditor.x} y={edgeEditor.y} onClose={() => setEdgeEditor(null)} />
      )}
      {connectDraft && (
        <EdgeCreateModal
          from={connectDraft.from}
          to={connectDraft.to}
          onClose={() => setConnectDraft(null)}
        />
      )}
    </div>
  );
}

const VISIBILITY_OPTIONS: { value: EdgeVisibility; label: string }[] = [
  { value: 'private', label: 'Private (GM only)' },
  { value: 'party', label: 'Party (all players)' },
  { value: 'custom', label: 'Custom slots' },
];

// Editable edge inspector (CP5). Clicking an edge opens this popover to adjust
// its relationship kind, weight, and player-mode visibility, or delete it — all
// through WikiContext (the CRDT/auto-save path). Reads the live edge from the
// context by id, so it always reflects the merged state, not a stale snapshot.
function EdgeEditor({
  relId,
  x,
  y,
  onClose,
}: {
  relId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const wiki = useWiki();
  const rel = wiki?.relationships.find((r) => r.id === relId);
  // Edge vanished (e.g. deleted on another device) — close.
  if (!wiki || !rel) return null;

  const kindOptions = validKinds(rel.fromType).filter((k) =>
    validTargets(rel.fromType, k).includes(rel.toType),
  );
  const visibility = rel.visibility ?? 'private';
  const weight = effectiveWeight(rel);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 space-y-2 rounded-lg border border-rule bg-parchment p-3 shadow-card"
        style={{ left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 272), top: y + 8 }}
        role="dialog"
        aria-label="Edit relationship"
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Edit Relationship
          </span>
          <button onClick={onClose} aria-label="Close" className="text-ink-mute hover:text-crimson">
            <X size={14} />
          </button>
        </div>

        <label className="block space-y-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Type</span>
          <select
            aria-label="Relationship type"
            value={rel.kind}
            onChange={(e) => wiki.updateRelationship(rel.id, { kind: e.target.value as RelationshipKind })}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          >
            {(kindOptions.length ? kindOptions : [rel.kind]).map((k) => (
              <option key={k} value={k}>
                {ruleFor(k)?.label ?? k}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-0.5">
          <span className="flex items-center justify-between font-display text-[10px] uppercase tracking-wider text-ink-mute">
            Weight <span className="text-ink">{weight.toFixed(2)}</span>
          </span>
          <input
            type="range"
            aria-label="Weight"
            min={0}
            max={1}
            step={0.05}
            value={weight}
            onChange={(e) => wiki.updateRelationship(rel.id, { weight: Number(e.target.value) })}
            className="w-full accent-crimson"
          />
        </label>

        <label className="block space-y-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
            Visibility
          </span>
          <select
            aria-label="Visibility"
            value={visibility}
            onChange={(e) => wiki.updateRelationship(rel.id, { visibility: e.target.value as EdgeVisibility })}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          >
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {visibility === 'private' && (
            <span className="font-serif text-[10px] italic text-ink-mute">
              Hidden from every player projection.
            </span>
          )}
          {visibility === 'custom' && (
            <span className="font-serif text-[10px] italic text-ink-mute">
              Visible to {rel.customVisibleTo?.length ?? 0} slot(s); manage slots in player roster.
            </span>
          )}
        </label>

        <div className="flex justify-end pt-0.5">
          <button
            onClick={() => {
              if (window.confirm('Delete this relationship?')) {
                wiki.removeRelationship(rel.id);
                onClose();
              }
            }}
            className="flex items-center gap-1 rounded border border-crimson/50 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10"
          >
            <X size={12} /> Delete
          </button>
        </div>
      </div>
    </>
  );
}

// Drag-to-connect picker (CP5). Opened when the GM drags an edge between two
// nodes; collects kind/weight/visibility, then creates the edge via the CRDT
// path. Kind options are intersected against the relationship catalog so the
// new edge is always type-valid for the dragged endpoints.
function EdgeCreateModal({
  from,
  to,
  onClose,
}: {
  from: WikiEntity;
  to: WikiEntity;
  onClose: () => void;
}) {
  const wiki = useWiki()!;
  const kinds = useMemo(
    () => validKinds(from.type).filter((k) => validTargets(from.type, k).includes(to.type)),
    [from.type, to.type],
  );
  const [kind, setKind] = useState<RelationshipKind | ''>(kinds[0] ?? '');
  const [weight, setWeight] = useState<number>(
    () => (kinds[0] ? defaultWeightForKind(kinds[0]) ?? 0.5 : 0.5),
  );
  const [visibility, setVisibility] = useState<EdgeVisibility>('private');

  const save = () => {
    if (!kind) return;
    wiki.createEdge(
      { type: from.type, id: from.id },
      { type: to.type, id: to.id },
      kind,
      { weight, visibility },
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect entities"
    >
      <div
        className="w-full max-w-md space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-wide text-ink">Connect</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-mute hover:text-crimson">
            <X size={16} />
          </button>
        </div>

        <p className="font-serif text-xs italic text-ink-mute">
          <span className="font-display not-italic text-ink">{from.name}</span>
          <span className="mx-1.5">→</span>
          <span className="font-display not-italic text-ink">{to.name}</span>
        </p>

        {kinds.length === 0 ? (
          <p className="font-serif text-sm italic text-crimson">
            No valid relationship kind links a {ENTITY_LABELS[from.type]} to a {ENTITY_LABELS[to.type]}.
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Kind</span>
              <select
                aria-label="Kind"
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as RelationshipKind;
                  setKind(k);
                  setWeight(defaultWeightForKind(k) ?? 0.5);
                }}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {ruleFor(k)?.label ?? k}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="flex items-center justify-between font-display text-[10px] uppercase tracking-wider text-brass-deep">
                Weight <span className="text-ink">{weight.toFixed(2)}</span>
              </span>
              <input
                type="range"
                aria-label="Weight"
                min={0}
                max={1}
                step={0.05}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="w-full accent-crimson"
              />
            </label>

            <label className="block space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                Visibility
              </span>
              <select
                aria-label="Visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as EdgeVisibility)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
              >
                {VISIBILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded border border-rule px-3 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!kind}
            className="rounded bg-crimson px-3 py-1 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:cursor-not-allowed disabled:opacity-40"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

// Node-state editor (CP5). Lets the GM change an NPC's living/dead state from
// the graph sidebar. It writes the canonical npc record through the SAME
// WikiContext.updateEntityState → setState/auto-save path the rest of the editor
// uses (not a fork). Because that write lands a real death transition, the
// reactive world-event observer (lib/world/useReactiveWorldEvents) detects it
// and enqueues a propagation PROPOSAL into data.pendingWorldEvents — it does NOT
// silently rewrite neighbouring edge weights. Consistent with CP3's invariant:
// the anchor change is canonical, its ripple is proposed for GM review.
function NodeStateEditor({ entity }: { entity: WikiEntity }) {
  const wiki = useWiki();
  // Only NPCs feed the reactive death→propagation rule today, so this is the
  // one type with a state toggle. Other types render nothing.
  if (!wiki || entity.type !== 'npc' || !entity.id) return null;

  const raw = wiki.getEntityState('npc', entity.id) ?? {};
  const isDead = raw.dead === true;

  return (
    <div className="mt-2 border-t border-rule pt-2">
      <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">State</div>
      <label className="flex items-center gap-2 font-serif text-xs text-ink">
        <input
          type="checkbox"
          checked={isDead}
          onChange={(e) => wiki.updateEntityState('npc', entity.id, { dead: e.target.checked })}
          className="accent-crimson"
          aria-label="Mark dead"
        />
        Dead
      </label>
      <p className="mt-1 font-serif text-[10px] italic text-ink-mute">
        Marking an NPC dead queues a world-event proposal you can review and apply — it never
        rewrites the graph on its own.
      </p>
    </div>
  );
}
