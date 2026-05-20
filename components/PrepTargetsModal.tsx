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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Prep target settings"
    >
      <div
        className="w-full max-w-2xl bg-parchment border border-rule rounded-lg shadow-page overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
          <div>
            <h2 className="font-display text-lg tracking-wide text-ink">Prep Target Settings</h2>
            <p className="text-[11px] text-ink-mute font-serif italic mt-0.5">
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

        <div className="px-4 py-3 overflow-y-auto flex-1 space-y-5">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center text-[10px] font-display uppercase tracking-wider text-ink-mute pb-1 border-b border-rule">
            <span>Category</span>
            <span className="w-16 text-center flex items-center justify-center gap-1 text-wine">
              <User size={10} /> Solo
            </span>
            <span className="w-16 text-center flex items-center justify-center gap-1 text-brass-deep">
              <Users size={10} /> Group
            </span>
            <span className="w-6" />
          </div>

          {PHASE_GROUPS.map((group) => (
            <section key={group.phase} className="space-y-2">
              <h3 className="text-[10px] font-display uppercase tracking-wider text-brass-deep">
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
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-serif text-ink truncate">{spec.label}</div>
                        <div className="text-[10px] text-ink-mute font-serif italic truncate">
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
                        className="text-ink-mute hover:text-crimson disabled:opacity-30 disabled:hover:text-ink-mute disabled:cursor-default p-1"
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

        <div className="px-4 py-3 border-t border-rule bg-parchment-soft flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-ink-soft hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1.5"
          >
            <RotateCcw size={12} /> Reset all to suggested
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-crimson/10 disabled:hover:text-crimson"
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
    <div className="w-16 flex flex-col items-center">
      <input
        type="number"
        inputMode="numeric"
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`w-full text-center font-display text-sm px-1.5 py-1 rounded border focus:outline-none focus:ring-2 ${overrideTint} ${ring}`}
      />
      <span className="text-[9px] font-display uppercase tracking-wider text-ink-mute mt-0.5 h-3">
        {overridden ? `def ${suggested}` : ''}
      </span>
    </div>
  );
}
