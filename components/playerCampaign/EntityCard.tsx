'use client';

// Read-only card for a projected entity (character, npc, location, faction,
// clock). Sorts fields by the per-type FIELD_ORDER, then alphabetically for any
// remaining fields, and renders each via FieldValue. Extracted verbatim from
// PlayerCampaignView.

import React, { useState, useEffect } from 'react';
import { FIELD_ORDER } from './constants';
import { FieldValue, isEmptyValue, prettify } from './fieldRendering';
import type { EntityRecord } from './types';
import type { LoreAttitudeTag, PlayerLoreAnnotation } from '@/lib/pc/types';

const ATTITUDE_OPTIONS: { value: LoreAttitudeTag; label: string; colorClass: string }[] = [
  { value: 'friendly', label: 'Friendly', colorClass: 'border-forest/40 bg-forest/10 text-forest' },
  { value: 'neutral', label: 'Neutral', colorClass: 'border-rule bg-surface text-ink-soft' },
  { value: 'suspicious', label: 'Suspicious', colorClass: 'border-gold/50 bg-gold/15 text-gold-deep' },
  { value: 'hostile', label: 'Hostile', colorClass: 'border-wax/40 bg-wax/10 text-wax' },
];

export default function EntityCard({
  entity,
  entityType,
  annotation,
  onSaveAnnotation,
  onToggleAnnotationShare,
}: {
  entity: EntityRecord;
  entityType?: string;
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
}) {
  const entityId = (entity.id as string) || (entity.name as string) || 'unknown';
  const name = (entity.name as string) || (entity.text as string) || 'Unnamed';
  const fields = Object.entries(entity).filter(
    ([k, v]) => k !== 'id' && k !== 'name' && k !== 'text' && !isEmptyValue(v),
  );

  if (entityType && FIELD_ORDER[entityType]) {
    const order = FIELD_ORDER[entityType];
    fields.sort((a, b) => {
      const idxA = order.indexOf(a[0]);
      const idxB = order.indexOf(b[0]);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }

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
      entityCategory: entityType || 'entity',
      attitudeTag: nextAttitude,
      privateNotes: nextNotes,
      sharedWithGm: nextShared,
    });
  };

  const handleToggleShare = () => {
    const nextShared = !sharedWithGm;
    if (onToggleAnnotationShare && annotation) {
      onToggleAnnotationShare(entityId, nextShared);
    } else {
      commitAnnotation(noteDraft, attitude, nextShared);
    }
  };

  return (
    <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-lg tracking-wide text-ink">{name}</div>
        {attitude && (
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              ATTITUDE_OPTIONS.find((a) => a.value === attitude)?.colorClass ?? 'border-rule bg-surface text-ink-soft'
            }`}
          >
            {attitude}
          </span>
        )}
      </div>

      {fields.map(([k, v]) => (
        <div key={k} className="font-serif text-sm text-ink-soft">
          <span className="font-semibold text-ink">{prettify(k)}:</span> <FieldValue value={v} />
        </div>
      ))}

      {onSaveAnnotation && (
        <div className="mt-3 space-y-2 border-t border-rule/60 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              My Private Note
            </span>
            <button
              type="button"
              onClick={handleToggleShare}
              title={
                sharedWithGm
                  ? 'Currently visible to your GM. Click to make 100% local/private.'
                  : 'Stored only on your device. Click to share this note with your GM.'
              }
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                sharedWithGm
                  ? 'border-gold/60 bg-gold/15 text-gold-deep hover:bg-gold/25'
                  : 'border-rule bg-surface text-ink-soft hover:border-ink-faint hover:text-ink'
              }`}
            >
              {sharedWithGm ? '👁️ Shared with GM' : '🔒 Private (Local Only)'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-ink-faint">Attitude:</span>
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
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                    active ? opt.colorClass : 'border-rule/60 bg-surface/50 text-ink-faint hover:text-ink-soft'
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
            onBlur={() => {
              if (noteDraft !== (annotation?.privateNotes ?? '') || attitude !== annotation?.attitudeTag) {
                commitAnnotation(noteDraft, attitude, sharedWithGm);
              }
            }}
            rows={2}
            placeholder="Write your personal notes, theories, or suspicions about this entry..."
            className="w-full rounded border border-rule bg-surface/70 px-2.5 py-1.5 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

