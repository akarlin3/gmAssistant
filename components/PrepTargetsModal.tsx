'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, User, Users } from 'lucide-react';
import {
  PHASE_GROUPS,
  TARGETS,
  type PrepTargetKey,
  type PrepTargetOverrides,
} from '@/lib/prepTargets';

type Props = {
  open: boolean;
  initialOverrides: PrepTargetOverrides;
  onClose: () => void;
  onSave: (next: PrepTargetOverrides) => void;
};

type DraftRow = { standard: string; solo: string };
type Draft = Record<PrepTargetKey, DraftRow>;

const MIN = 0;
const MAX = 99;

function bookDefault(key: PrepTargetKey, mode: 'standard' | 'solo'): number {
  return TARGETS[key][mode];
}

function toDraftValue(override: number | undefined, fallback: number): string {
  return String(override ?? fallback);
}

function buildDraft(overrides: PrepTargetOverrides): Draft {
  const draft = {} as Draft;
  (Object.keys(TARGETS) as PrepTargetKey[]).forEach((key) => {
    const o = overrides[key];
    draft[key] = {
      standard: toDraftValue(o?.standard, bookDefault(key, 'standard')),
      solo: toDraftValue(o?.solo, bookDefault(key, 'solo')),
    };
  });
  return draft;
}

function parseDraft(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX, Math.max(MIN, n));
}

// Diff the draft against book defaults — only keys that diverge are persisted,
// so resetting a row removes it from the saved overrides entirely.
function draftToOverrides(draft: Draft): PrepTargetOverrides {
  const out: PrepTargetOverrides = {};
  (Object.keys(TARGETS) as PrepTargetKey[]).forEach((key) => {
    const std = parseDraft(draft[key].standard, bookDefault(key, 'standard'));
    const solo = parseDraft(draft[key].solo, bookDefault(key, 'solo'));
    const stdDiff = std !== bookDefault(key, 'standard');
    const soloDiff = solo !== bookDefault(key, 'solo');
    if (!stdDiff && !soloDiff) return;
    out[key] = {};
    if (stdDiff) out[key]!.standard = std;
    if (soloDiff) out[key]!.solo = solo;
  });
  return out;
}

export default function PrepTargetsModal({ open, initialOverrides, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(() => buildDraft(initialOverrides));

  // Re-seed the draft whenever the modal re-opens, so an unsaved edit from a
  // prior open doesn't bleed through.
  useEffect(() => {
    if (open) setDraft(buildDraft(initialOverrides));
  }, [open, initialOverrides]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const dirty = useMemo(() => {
    const next = draftToOverrides(draft);
    return JSON.stringify(next) !== JSON.stringify(initialOverrides);
  }, [draft, initialOverrides]);

  if (!open) return null;

  const updateCell = (key: PrepTargetKey, mode: 'standard' | 'solo', value: string) => {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [mode]: value } }));
  };
  const resetRow = (key: PrepTargetKey) => {
    setDraft((d) => ({
      ...d,
      [key]: {
        standard: String(bookDefault(key, 'standard')),
        solo: String(bookDefault(key, 'solo')),
      },
    }));
  };
  const resetAll = () => {
    if (!confirm('Reset every category to its suggested default?')) return;
    setDraft(buildDraft({}));
  };

  const handleSave = () => {
    onSave(draftToOverrides(draft));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Prep target settings"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-rule bg-parchment shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <div>
            <h2 className="font-display text-lg tracking-wide text-ink">Prep Target Settings</h2>
            <p className="mt-0.5 font-serif text-[11px] italic text-ink-mute">
              How many items each category needs before the pre-session gate opens.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-crimson"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-rule pb-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
            <span>Category</span>
            <span className="flex w-16 items-center justify-center gap-1 text-center text-wine">
              <User size={10} /> Solo
            </span>
            <span className="flex w-16 items-center justify-center gap-1 text-center text-brass-deep">
              <Users size={10} /> Group
            </span>
            <span className="w-6" />
          </div>

          {PHASE_GROUPS.map((group) => (
            <section key={group.phase} className="space-y-2">
              <h3 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.keys.map((key) => {
                  const spec = TARGETS[key];
                  const row = draft[key];
                  const isOverridden =
                    parseDraft(row.standard, spec.standard) !== spec.standard ||
                    parseDraft(row.solo, spec.solo) !== spec.solo;
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-serif text-sm text-ink">{spec.label}</div>
                        <div className="truncate font-serif text-[10px] italic text-ink-mute">
                          {spec.source}
                        </div>
                      </div>
                      <NumberCell
                        value={row.solo}
                        suggested={spec.solo}
                        onChange={(v) => updateCell(key, 'solo', v)}
                        accent="wine"
                        ariaLabel={`${spec.label} — solo target`}
                      />
                      <NumberCell
                        value={row.standard}
                        suggested={spec.standard}
                        onChange={(v) => updateCell(key, 'standard', v)}
                        accent="brass"
                        ariaLabel={`${spec.label} — group target`}
                      />
                      <button
                        type="button"
                        onClick={() => resetRow(key)}
                        disabled={!isOverridden}
                        className="p-1 text-ink-mute hover:text-crimson disabled:cursor-default disabled:opacity-30 disabled:hover:text-ink-mute"
                        title={isOverridden ? 'Reset to suggested default' : 'Matches default'}
                        aria-label={`Reset ${spec.label} to default`}
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-rule bg-parchment-soft px-4 py-3">
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:text-crimson"
          >
            <RotateCcw size={12} /> Reset all to suggested
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-crimson/10 disabled:hover:text-crimson"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberCell({
  value,
  suggested,
  onChange,
  accent,
  ariaLabel,
}: {
  value: string;
  suggested: number;
  onChange: (v: string) => void;
  accent: 'wine' | 'brass';
  ariaLabel: string;
}) {
  const parsed = parseDraft(value, suggested);
  const overridden = parsed !== suggested;
  const ring =
    accent === 'wine' ? 'focus:border-wine focus:ring-wine/30' : 'focus:border-brass-deep focus:ring-brass-deep/30';
  const overrideTint =
    overridden
      ? accent === 'wine'
        ? 'border-wine/40 bg-wine/5 text-wine'
        : 'border-brass-deep/40 bg-brass/5 text-brass-deep'
      : 'border-rule bg-parchment-soft text-ink';
  return (
    <div className="flex w-16 flex-col items-center">
      <input
        type="number"
        inputMode="numeric"
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`w-full rounded border px-1.5 py-1 text-center font-display text-sm focus:outline-none focus:ring-2 ${overrideTint} ${ring}`}
      />
      <span className="mt-0.5 h-3 font-display text-[9px] uppercase tracking-wider text-ink-mute">
        {overridden ? `def ${suggested}` : ''}
      </span>
    </div>
  );
}
