'use client';

// Read-only card for a projected entity (character, npc, location, faction,
// clock) with Progressive Disclosure:
// Collapsed default state shows ONLY: Title (Cormorant Garamond), 1-line pitch/summary,
// primary Role/Attitude chip, and Visibility/Privacy badge (max 2 badges per row).
// Full fields and private player annotations are tucked inside a smooth expandable accordion.

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FIELD_ORDER } from './constants';
import { FieldValue, isEmptyValue, prettify } from './fieldRendering';
import type { EntityRecord } from './types';
import type { LoreAttitudeTag, PlayerLoreAnnotation } from '@/lib/pc/types';
import { PlayerPrivacyPill } from '@/components/ui/VisibilityBadge';

const ATTITUDE_OPTIONS: { value: LoreAttitudeTag; label: string; colorClass: string }[] = [
  { value: 'friendly', label: 'Friendly', colorClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500' },
  { value: 'neutral', label: 'Neutral', colorClass: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]' },
  { value: 'suspicious', label: 'Suspicious', colorClass: 'border-amber-500/40 bg-amber-500/15 text-amber-500' },
  { value: 'hostile', label: 'Hostile', colorClass: 'border-rose-500/40 bg-rose-500/15 text-rose-500' },
];

export default function EntityCard({
  entity,
  entityType,
  type,
  annotation,
  onSaveAnnotation,
  onToggleAnnotationShare,
  defaultExpanded = false,
}: {
  entity: EntityRecord;
  entityType?: string;
  type?: string;
  annotation?: PlayerLoreAnnotation;
  onSaveAnnotation?: (data: {
    entityId: string;
    entityName: string;
    entityCategory: string;
    attitudeTag?: LoreAttitudeTag;
    privateNotes: string;
    sharedWithGm: boolean;
  }) => void;
  onToggleAnnotationShare?: (entityId: string, sharedWithGm: boolean) => void;
  defaultExpanded?: boolean;
}) {
  const effectiveType = entityType || type;
  const entityId = (entity.id as string) || (entity.name as string) || 'unknown';
  const name = (entity.name as string) || (entity.text as string) || 'Unnamed';
  const fields = Object.entries(entity).filter(
    ([k, v]) => k !== 'id' && k !== 'name' && k !== 'text' && !isEmptyValue(v),
  );

  if (effectiveType && FIELD_ORDER[effectiveType]) {
    const order = FIELD_ORDER[effectiveType];
    fields.sort((a, b) => {
      const idxA = order.indexOf(a[0]);
      const idxB = order.indexOf(b[0]);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [noteDraft, setNoteDraft] = useState(annotation?.privateNotes ?? '');
  const [attitude, setAttitude] = useState<LoreAttitudeTag | undefined>(annotation?.attitudeTag);
  const sharedWithGm = annotation?.sharedWithGm === true;

  useEffect(() => {
    setNoteDraft(annotation?.privateNotes ?? '');
    setAttitude(annotation?.attitudeTag);
  }, [annotation?.privateNotes, annotation?.attitudeTag]);

  const commitAnnotation = (
    nextNotes: string,
    nextAttitude: LoreAttitudeTag | undefined,
    nextShared: boolean,
  ) => {
    if (!onSaveAnnotation) return;
    onSaveAnnotation({
      entityId,
      entityName: name,
      entityCategory: effectiveType || 'entity',
      attitudeTag: nextAttitude,
      privateNotes: nextNotes,
      sharedWithGm: nextShared,
    });
  };

  const handleToggleShare = (nextShared: boolean) => {
    if (onToggleAnnotationShare && annotation) {
      onToggleAnnotationShare(entityId, nextShared);
    } else {
      commitAnnotation(noteDraft, attitude, nextShared);
    }
  };

  const primaryRoleChip =
    attitude ||
    (typeof entity.type === 'string' && entity.type) ||
    (typeof entity.archetype === 'string' && entity.archetype.split(' ')[0]) ||
    (typeof entity.role === 'string' && entity.role) ||
    undefined;

  const summaryLine = (() => {
    for (const [k, v] of fields) {
      if (k === 'type' || k === 'role') continue;
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (Array.isArray(v) && v.filter(Boolean).length > 0) {
        return v.filter(Boolean).join(' · ');
      }
    }
    if (noteDraft.trim()) return noteDraft.trim();
    return 'Click to view details & private player notes';
  })();

  return (
    <div className="rounded-lg border border-l-2 border-[var(--border-subtle)] border-l-emerald-500/80 bg-[var(--bg-surface)] p-3 shadow-card transition-all">
      {/* Collapsed Progressive Disclosure Row: Title (Cormorant Garamond), 1-line summary, max 2 badges */}
      <div className="flex items-start justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="mt-1 shrink-0 text-[var(--text-muted)]">
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="truncate font-display text-base font-semibold tracking-wide text-[var(--text-primary)]">
              {name}
            </h4>
            <p className="mt-0.5 line-clamp-1 font-sans text-xs text-[var(--text-muted)]">
              {summaryLine}
            </p>
          </div>
        </button>

        {/* Strictly max 2 badges: 1) Primary Role/Attitude chip, 2) Privacy/Visibility badge */}
        <div className="flex shrink-0 items-center gap-1.5">
          {primaryRoleChip && (
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-sans text-[11px] font-medium capitalize text-[var(--text-muted)]">
              {primaryRoleChip}
            </span>
          )}
          {onSaveAnnotation ? (
            <PlayerPrivacyPill
              sharedWithGm={sharedWithGm}
              onToggle={handleToggleShare}
              compact
            />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-sans text-[11px] font-medium text-emerald-500 dark:text-emerald-300">
              👁️ Party
            </span>
          )}
        </div>
      </div>

      {/* Expandable Details & Private Annotation */}
      <div className={`gm-collapse ${expanded ? 'gm-collapse-open' : ''}`}>
        <div className="gm-collapse-content">
          <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
            {fields.map(([k, v]) => (
              <div key={k} className="font-sans text-xs leading-relaxed text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-primary)]">{prettify(k)}:</span>{' '}
                <FieldValue value={v} />
              </div>
            ))}

            {onSaveAnnotation && (
              <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    My Note
                  </span>
                  <PlayerPrivacyPill
                    sharedWithGm={sharedWithGm}
                    onToggle={handleToggleShare}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 font-sans text-[11px] text-[var(--text-muted)]">
                    Attitude:
                  </span>
                  {ATTITUDE_OPTIONS.map((opt) => {
                    const active = attitude === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const nextAtt = active ? undefined : opt.value;
                          setAttitude(nextAtt);
                          commitAnnotation(noteDraft, nextAtt, sharedWithGm);
                        }}
                        className={`rounded-full border px-2 py-0.5 font-sans text-[11px] font-medium transition-colors ${
                          active
                            ? opt.colorClass
                            : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => commitAnnotation(noteDraft, attitude, sharedWithGm)}
                  rows={2}
                  placeholder="Write your personal notes about this entity…"
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
