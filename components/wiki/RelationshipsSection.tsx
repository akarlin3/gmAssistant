'use client';

// Inline relationships UI embedded in every entity card (Phase 1 + 2). Shows
// the entity's outgoing and incoming relationships grouped by label (symmetric-
// aware via relationshipsFor), each related entity clickable, plus a
// "+ Add Relationship" affordance that opens a small modal: pick a kind, pick a
// valid target, optional notes. Reads/writes through WikiContext, so it renders
// nothing when no provider is present (e.g. the read-only player view).

import { useMemo, useState } from 'react';
import { Plus, X, Link2, Sparkles } from 'lucide-react';
import { useWiki } from './WikiContext';
import { ENTITY_COLORS, ENTITY_LABELS } from '@/lib/wiki/colors';
import { relationshipsFor } from '@/lib/wiki/lookup';
import { validKinds, validTargets, ruleFor } from '@/lib/wiki/catalog';
import type { EntityType, RelationshipKind } from '@/lib/wiki/types';

function Dot({ type }: { type: EntityType }) {
  return (
    <span
      className="inline-block size-2 flex-shrink-0 rounded-full"
      style={{ background: ENTITY_COLORS[type] }}
      title={ENTITY_LABELS[type]}
    />
  );
}

export default function RelationshipsSection({
  entityType,
  entityId,
  entityName,
}: {
  entityType: EntityType;
  entityId: string;
  entityName: string;
}) {
  const wiki = useWiki();
  const [adding, setAdding] = useState(false);

  // No provider (player view) or no stable id → nothing to anchor relationships
  // to, so render nothing.
  if (!wiki || !entityId) return null;

  const resolved = relationshipsFor(entityType, entityId, wiki.relationships).filter(
    (r) => !r.rel.suggested,
  );

  // Group by the label shown on this side.
  const groups = new Map<string, typeof resolved>();
  for (const r of resolved) {
    const arr = groups.get(r.label) ?? [];
    arr.push(r);
    groups.set(r.label, arr);
  }

  return (
    <div className="mt-1 border-t border-rule pt-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep">
          <Link2 size={12} /> Relationships
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
        >
          <Plus size={12} /> Add Relationship
        </button>
      </div>

      {resolved.length === 0 ? (
        <p className="font-serif text-xs italic text-ink-mute">No links yet.</p>
      ) : (
        <div className="space-y-1.5">
          {[...groups.entries()].map(([label, rels]) => (
            <div key={label} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                {label}:
              </span>
              {rels.map((r) => {
                const other = wiki.resolve(r.otherType, r.otherId);
                return (
                  <span
                    key={r.rel.id}
                    className="group inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-1.5 py-0.5"
                  >
                    <Dot type={r.otherType} />
                    <button
                      type="button"
                      onClick={() => wiki.navigateToEntity?.(r.otherType, r.otherId)}
                      className="font-serif text-xs text-ink hover:text-crimson hover:underline"
                      title={`Go to ${ENTITY_LABELS[r.otherType]}`}
                    >
                      {other?.name ?? '(removed)'}
                    </button>
                    {r.rel.notes && (
                      <span
                        className="font-serif text-[10px] italic text-ink-mute"
                        title={r.rel.notes}
                      >
                        — {r.rel.notes}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Delete this relationship?'))
                          wiki.removeRelationship(r.rel.id);
                      }}
                      aria-label="Delete relationship"
                      className="text-ink-faint hover:text-crimson"
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddRelationshipModal
          fromType={entityType}
          fromId={entityId}
          fromName={entityName}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function AddRelationshipModal({
  fromType,
  fromId,
  fromName,
  onClose,
}: {
  fromType: EntityType;
  fromId: string;
  fromName: string;
  onClose: () => void;
}) {
  const wiki = useWiki()!;
  const kinds = useMemo(() => validKinds(fromType), [fromType]);
  const [kind, setKind] = useState<RelationshipKind | ''>(kinds[0] ?? '');
  const [targetKey, setTargetKey] = useState('');
  const [notes, setNotes] = useState('');

  const targets = useMemo(() => {
    const types = kind ? validTargets(fromType, kind) : [];
    return wiki.index.entities
      .filter((e) => types.includes(e.type))
      .filter((e) => !(e.type === fromType && e.id === fromId))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  }, [wiki.index, kind, fromType, fromId]);

  const save = () => {
    if (!kind || !targetKey) return;
    const sep = targetKey.indexOf(':');
    const toType = targetKey.slice(0, sep) as EntityType;
    const toId = targetKey.slice(sep + 1);
    wiki.addRelationship({ type: fromType, id: fromId }, { type: toType, id: toId }, kind, notes);
    onClose();
  };

  const rule = kind ? ruleFor(kind) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add relationship"
    >
      <div
        className="w-full max-w-md space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-wide text-ink">
            Add Relationship
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-mute hover:text-crimson">
            <X size={16} />
          </button>
        </div>

        <p className="font-serif text-xs italic text-ink-mute">
          <span className="font-display not-italic text-ink">{fromName || 'This entity'}</span>{' '}
          {rule ? rule.label.toLowerCase() : '…'} …
        </p>

        <label className="block space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Kind
          </span>
          <select
            name="kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as RelationshipKind);
              setTargetKey('');
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
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Target
          </span>
          <select
            name="target"
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          >
            <option value="">— Choose —</option>
            {targets.map((e) => (
              <option key={`${e.type}:${e.id}`} value={`${e.type}:${e.id}`}>
                {ENTITY_LABELS[e.type]}: {e.name}
              </option>
            ))}
          </select>
          {targets.length === 0 && (
            <span className="font-serif text-[11px] italic text-ink-mute">
              No valid targets for this kind yet.
            </span>
          )}
        </label>

        <label className="block space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Notes (optional)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. since the siege"
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded border border-rule px-3 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!kind || !targetKey}
            className="flex items-center gap-1 rounded bg-crimson px-3 py-1 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles size={12} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
