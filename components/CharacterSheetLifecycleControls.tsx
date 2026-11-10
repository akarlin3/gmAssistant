'use client';

import React, { useState } from 'react';
import { ABILITY_NAMES, type PcEvaluation, type PlayerCharacter, type RollEvent } from '@/lib/pc/types';
import {
  downloadOrShareCharacterSheetPdf,
  type PdfStylePreset,
} from '@/lib/characterPdfExporter';
import { computeEffectiveCharacterStats, type RollMode } from '@/lib/activeModifiers';
import {
  appendRollEventRingBuffer,
  rollAbilityCheck,
  rollInitiativeCheck,
  rollSavingThrow,
  rollWeaponOrSpellAttack,
  sanitizeRollEventsForOutbound,
} from '@/lib/diceRoller';

export interface ExportSheetPdfButtonProps {
  pc: Partial<PlayerCharacter> & Record<string, unknown>;
  mode?: 'gm' | 'player';
  compact?: boolean;
  label?: string;
  className?: string;
}

export function ExportSheetPdfButton({
  pc,
  mode = 'gm',
  compact = false,
  label = 'Export Sheet PDF',
  className = '',
}: ExportSheetPdfButtonProps) {
  const [open, setOpen] = useState(false);
  const [stylePreset, setStylePreset] = useState<PdfStylePreset>('parchment');
  const [includeGmSecrets, setIncludeGmSecrets] = useState(false);
  const [includePrivateNotes, setIncludePrivateNotes] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (preferShare = false) => {
    setExporting(true);
    try {
      await downloadOrShareCharacterSheetPdf(pc, {
        mode,
        stylePreset,
        includeGmSecrets: mode === 'gm' ? includeGmSecrets : false,
        includePrivateNotes: mode === 'player' ? includePrivateNotes : false,
        preferShare,
      });
      setOpen(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={exporting}
        title="Export Fillable Character Sheet PDF (Offline-Ready)"
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/20'
            : 'inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20'
        }
      >
        <span>📄</span>
        <span>{exporting ? 'Exporting…' : label}</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-50 mt-1.5 w-64 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Fillable PDF Options
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="mb-2.5">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Sheet Style Preset
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setStylePreset('parchment')}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  stylePreset === 'parchment'
                    ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
                    : 'border-slate-700 bg-slate-800/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                📜 Parchment PHB
              </button>
              <button
                type="button"
                onClick={() => setStylePreset('ink-saver')}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  stylePreset === 'ink-saver'
                    ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                    : 'border-slate-700 bg-slate-800/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                🖨️ Ink Saver
              </button>
            </div>
          </div>

          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
            {mode === 'gm' ? (
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={includeGmSecrets}
                  onChange={(e) => setIncludeGmSecrets(e.target.checked)}
                  className="mt-0.5 rounded border-slate-600"
                />
                <span>
                  <strong className="block text-slate-200">Include GM-Only Notes</strong>
                  <span className="text-[10px] text-slate-400">
                    Off by default so exported sheets are 100% player-safe.
                  </span>
                </span>
              </label>
            ) : (
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={includePrivateNotes}
                  onChange={(e) => setIncludePrivateNotes(e.target.checked)}
                  className="mt-0.5 rounded border-slate-600"
                />
                <span>
                  <strong className="block text-slate-200">Include Private Notes</strong>
                  <span className="text-[10px] text-slate-400">
                    Include unshared (private) quests, journal &amp; notes. Uncheck when sharing.
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExport(false)}
              className="flex-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-center text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {exporting ? 'Generating…' : '⬇ Download PDF'}
            </button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleExport(true)}
                title="Share via device share sheet"
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                📤 Share
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ExportAllPartyPdfsButtonProps {
  pcs: Array<Partial<PlayerCharacter> & Record<string, unknown>>;
  compact?: boolean;
  className?: string;
}

export function ExportAllPartyPdfsButton({
  pcs,
  compact = false,
  className = '',
}: ExportAllPartyPdfsButtonProps) {
  const [open, setOpen] = useState(false);
  const [stylePreset, setStylePreset] = useState<PdfStylePreset>('parchment');
  const [includeGmSecrets, setIncludeGmSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!pcs || pcs.length === 0) return null;

  const handleBatchExport = async () => {
    setExporting(true);
    try {
      for (const pc of pcs) {
        await downloadOrShareCharacterSheetPdf(pc, {
          mode: 'gm',
          stylePreset,
          includeGmSecrets,
        });
      }
      setOpen(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/20'
            : 'inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20'
        }
      >
        <span>📚</span>
        <span>{exporting ? 'Exporting Party…' : `Export All Party PDFs (${pcs.length})`}</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-50 mt-1.5 w-64 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Export All Party PDFs ({pcs.length})
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="mb-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setStylePreset('parchment')}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  stylePreset === 'parchment'
                    ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
                    : 'border-slate-700 bg-slate-800/70 text-slate-400'
                }`}
              >
                📜 Parchment PHB
              </button>
              <button
                type="button"
                onClick={() => setStylePreset('ink-saver')}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  stylePreset === 'ink-saver'
                    ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                    : 'border-slate-700 bg-slate-800/70 text-slate-400'
                }`}
              >
                🖨️ Ink Saver
              </button>
            </div>
          </div>

          <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={includeGmSecrets}
              onChange={(e) => setIncludeGmSecrets(e.target.checked)}
              className="mt-0.5 rounded border-slate-600"
            />
            <span>
              <strong className="block text-slate-200">Include GM-Only Notes</strong>
              <span className="text-[10px] text-slate-400">
                Player-safe by default (strips GM secrets).
              </span>
            </span>
          </label>

          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleBatchExport()}
            className="w-full rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {exporting ? 'Exporting All…' : `⬇ Download ${pcs.length} Sheet PDFs`}
          </button>
        </div>
      )}
    </div>
  );
}

export interface EvaluationReportBadgeProps {
  evaluation?: PcEvaluation;
  compact?: boolean;
}

export function EvaluationReportBadge({
  evaluation,
  compact = false,
}: EvaluationReportBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (!evaluation) return null;

  const warningCount = evaluation.auditNotes?.length ?? 0;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20'
            : 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20'
        }
        title="View Tactical & Mechanical Evaluation Report"
      >
        <span>🛡️ Evaluation Report</span>
        {evaluation.partyRoles?.length > 0 && (
          <span className="rounded bg-emerald-500/20 px-1 text-[10px] text-emerald-200">
            {evaluation.partyRoles.slice(0, 2).join(' · ')}
          </span>
        )}
        {warningCount > 0 && (
          <span className="rounded bg-amber-500/30 px-1 text-[10px] text-amber-200">
            {warningCount} flag{warningCount > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-50 mt-1.5 w-80 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left text-xs shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-bold uppercase tracking-wider text-emerald-400">
              Mechanical Evaluation Report
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 text-[11px] text-slate-300">
            <div>
              <span className="font-semibold text-slate-400">Party Roles: </span>
              <span className="font-semibold text-emerald-300">
                {evaluation.partyRoles.join(', ') || 'Adventurer'}
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 space-y-1">
              <div className="font-semibold text-slate-200">
                {evaluation.defensiveProfile.acSummary}
              </div>
              <div>
                <span className="text-slate-400">Strong Saves: </span>
                <span className="text-emerald-300">
                  {evaluation.defensiveProfile.strongestSaves.join(', ')}
                </span>
                {' · '}
                <span className="text-slate-400">Weak Saves: </span>
                <span className="text-rose-300">
                  {evaluation.defensiveProfile.weakestSaves.join(', ')}
                </span>
              </div>
              {evaluation.defensiveProfile.resistances.length > 0 && (
                <div>
                  <span className="text-slate-400">Resistances: </span>
                  <span className="text-amber-300">
                    {evaluation.defensiveProfile.resistances.join(', ')}
                  </span>
                </div>
              )}
              {evaluation.defensiveProfile.immunities.length > 0 && (
                <div>
                  <span className="text-slate-400">Immunities: </span>
                  <span className="text-sky-300">
                    {evaluation.defensiveProfile.immunities.join(', ')}
                  </span>
                </div>
              )}
              {evaluation.defensiveProfile.specialSenses.length > 0 && (
                <div>
                  <span className="text-slate-400">Senses: </span>
                  <span className="text-purple-300">
                    {evaluation.defensiveProfile.specialSenses.join(', ')}
                  </span>
                </div>
              )}
            </div>

            {evaluation.derivedStats && (
              <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span>PP {evaluation.derivedStats.passivePerception}</span>
                <span>PI {evaluation.derivedStats.passiveInvestigation}</span>
                <span>PIns {evaluation.derivedStats.passiveInsight}</span>
                {evaluation.derivedStats.spellSaveDc !== null && (
                  <span>Spell DC {evaluation.derivedStats.spellSaveDc}</span>
                )}
                <span>Carry {evaluation.derivedStats.carryingCapacity} lb</span>
              </div>
            )}

            {evaluation.auditNotes.length > 0 ? (
              <div className="space-y-1 pt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Rules &amp; Math Audit Flags ({evaluation.auditNotes.length})
                </div>
                {evaluation.auditNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
                  >
                    • {note.message}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-emerald-400">
                ✓ Zero math or attunement discrepancies detected.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SheetUploadToastState {
  message: string;
  evaluation?: PcEvaluation;
  onUndo?: () => void;
}

export function CharacterSheetUploadToast({
  toast,
  onDismiss,
}: {
  toast: SheetUploadToastState | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  return (
    <div
      role="status"
      className="my-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-3.5 py-2 text-xs text-emerald-200 shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-emerald-300">✓ Character Evaluated &amp; Saved</span>
        <span className="text-emerald-200/90">{toast.message}</span>
        {toast.evaluation && <EvaluationReportBadge evaluation={toast.evaluation} compact />}
      </div>
      <div className="flex items-center gap-2">
        {toast.onUndo && (
          <button
            type="button"
            onClick={() => {
              toast.onUndo?.();
              onDismiss();
            }}
            className="rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/30"
          >
            ↶ Undo
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-200"
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function PartyRunTrackerSection({
  pcs,
  onUpdatePcs,
}: {
  pcs: PlayerCharacter[];
  onUpdatePcs: (nextPcs: PlayerCharacter[]) => void;
}) {
  const [toast, setToast] = useState<SheetUploadToastState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const [lastGmRoll, setLastGmRoll] = useState<RollEvent | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const recordPcRoll = (pc: PlayerCharacter, roll: RollEvent) => {
    setLastGmRoll(roll);
    const nextRolls = sanitizeRollEventsForOutbound(
      appendRollEventRingBuffer(pc.rollEvents ?? [], roll),
    );
    onUpdatePcs(
      pcs.map((item) => (item.id === pc.id ? { ...item, rollEvents: nextRolls } : item)),
    );
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    const prevSnapshot = pcs.map((p) => JSON.parse(JSON.stringify(p)) as PlayerCharacter);

    try {
      const { parseCharacterSheet } = await import('@/lib/characterSheetParser');
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      let idToken: string | undefined;
      try {
        const user = getFirebaseAuth().currentUser;
        if (user) idToken = await user.getIdToken();
      } catch {
        // Offline Tier 1 fallback
      }

      const working = [...pcs];
      let lastEval: PcEvaluation | undefined;
      const names: string[] = [];

      for (const file of files) {
        const res = await parseCharacterSheet(file, {
          filename: file.name,
          mimeType: file.type,
          existingPcs: working,
          authToken: idToken,
        });
        lastEval = res.pc.evaluation;
        names.push(res.pc.name || file.name);
        if (res.mergedWithExisting && res.matchedPcId) {
          const idx = working.findIndex((p) => p.id === res.matchedPcId);
          if (idx !== -1) working[idx] = res.pc;
        } else {
          working.push(res.pc);
        }
      }

      onUpdatePcs(working);
      setToast({
        message: `${names.join(', ')} evaluated & merged into live session state.`,
        evaluation: lastEval,
        onUndo: () => onUpdatePcs(prevSnapshot),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to parse character sheet.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const dropped = Array.from(e.dataTransfer.files || []);
        if (dropped.length > 0) void handleFiles(dropped);
      }}
      className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
        <div>
          <h3 className="font-display text-xs uppercase tracking-wider text-ink">
            Party Tactical &amp; Defensive Tracker ({pcs.length})
          </h3>
          <p className="font-serif text-[11px] italic text-ink-mute">
            Live AC, 1-Tap Click-to-Roll Checks/Saves/Attacks, Strong/Weak Saves &amp; Sheet Upload
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded border border-rule bg-parchment-deep text-[9px] font-display uppercase tracking-wider">
            {(['normal', 'advantage', 'disadvantage'] as RollMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRollMode(mode)}
                className={`px-1.5 py-0.5 transition-colors ${
                  rollMode === mode
                    ? 'bg-crimson text-parchment font-bold'
                    : 'text-ink-soft hover:bg-parchment'
                }`}
              >
                {mode === 'normal' ? 'Norm' : mode === 'advantage' ? 'Adv' : 'Dis'}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-crimson/50 bg-crimson/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:opacity-50"
          >
            <span>📤</span>
            <span>{uploading ? 'Evaluating…' : 'Upload / Level-Up Sheet(s)'}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.json,.png,.jpg,.jpeg,.webp,application/pdf,application/json,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              void handleFiles(files);
            }}
            className="hidden"
          />
          <ExportAllPartyPdfsButton pcs={pcs} compact />
        </div>
      </div>

      {lastGmRoll && (
        <div className="flex items-center justify-between gap-2 rounded border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs">
          <div>
            <span className="font-display font-bold text-ink">{lastGmRoll.actorName}</span> ·{' '}
            <span className="font-serif text-ink-soft">{lastGmRoll.label}:</span>{' '}
            <span className="font-mono font-bold text-crimson">{lastGmRoll.total}</span>{' '}
            <span className="font-mono text-[10px] text-ink-mute">({lastGmRoll.breakdown})</span>
          </div>
          <button
            type="button"
            onClick={() => setLastGmRoll(null)}
            className="text-[10px] text-ink-mute hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      <CharacterSheetUploadToast toast={toast} onDismiss={() => setToast(null)} />
      {error && <div className="text-xs italic text-crimson">{error}</div>}

      {pcs.length === 0 ? (
        <div className="py-2 font-serif text-xs italic text-ink-mute">
          No party PCs loaded yet. Drop a `.pdf`, `.json`, or image character sheet here to evaluate &amp; add to the session.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pcs.map((pc) => {
            const ev = pc.evaluation;
            const def = ev?.defensiveProfile;
            const eff = computeEffectiveCharacterStats(pc);
            return (
              <div
                key={pc.id}
                className="flex flex-col justify-between gap-1.5 rounded border border-rule bg-parchment-soft p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div>
                    <span className="font-display font-bold text-ink">
                      {pc.name || 'Unnamed PC'}
                    </span>{' '}
                    <span className="font-serif text-[11px] italic text-ink-mute">
                      Lv.{pc.level}{' '}
                      {pc.classes.map((c) => `${c.name} ${c.level}`).join('/') || pc.race}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        recordPcRoll(pc, rollInitiativeCheck(pc, { rollMode }))
                      }
                      title="Roll Initiative"
                      className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-display text-[10px] text-ink hover:border-gold"
                    >
                      🎲 Init {eff.initiative >= 0 ? `+${eff.initiative}` : eff.initiative}
                    </button>
                    <span className="rounded border border-crimson/30 bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] text-crimson">
                      HP {pc.hp.current}/{pc.hp.max}
                    </span>
                    <span className="rounded border border-brass-deep/30 bg-brass/10 px-1.5 py-0.5 font-display text-[10px] text-brass-deep">
                      AC {eff.ac}
                      {eff.acDelta !== 0
                        ? ` (${eff.acDelta > 0 ? `+${eff.acDelta}` : eff.acDelta})`
                        : ''}
                    </span>
                  </div>
                </div>

                {/* 1-Tap Click-to-Roll Ability & Save Strip */}
                <div className="flex flex-wrap items-center gap-1">
                  {ABILITY_NAMES.map((ab) => {
                    const mod = eff.abilityModifiers[ab];
                    const saveMod = eff.savingThrowModifiers[ab];
                    return (
                      <div
                        key={ab}
                        className="inline-flex items-center overflow-hidden rounded border border-rule/80 bg-parchment text-[10px]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            recordPcRoll(
                              pc,
                              rollAbilityCheck(pc, ab, { rollMode }),
                            )
                          }
                          title={`Roll ${ab.toUpperCase()} Check`}
                          className="px-1 py-0.5 font-display uppercase text-ink hover:bg-gold/15"
                        >
                          {ab.toUpperCase()} {mod >= 0 ? `+${mod}` : mod}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            recordPcRoll(
                              pc,
                              rollSavingThrow(pc, ab, { rollMode }),
                            )
                          }
                          title={`Roll ${ab.toUpperCase()} Save`}
                          className="border-l border-rule/60 bg-parchment-deep/60 px-1 py-0.5 font-mono text-[9px] text-ink-soft hover:bg-crimson/15 hover:text-crimson"
                        >
                          Sv{saveMod >= 0 ? `+${saveMod}` : saveMod}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {(pc.attacks ?? []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {(pc.attacks ?? []).slice(0, 3).map((atk) => (
                      <button
                        key={atk.id}
                        type="button"
                        onClick={() =>
                          recordPcRoll(
                            pc,
                            rollWeaponOrSpellAttack(pc, atk, { rollMode }),
                          )
                        }
                        className="rounded border border-crimson/30 bg-crimson/5 px-1.5 py-0.5 font-display text-[10px] text-crimson hover:bg-crimson/15"
                      >
                        ⚔️ {atk.name} ({atk.attackBonus >= 0 ? `+${atk.attackBonus}` : atk.attackBonus})
                      </button>
                    ))}
                  </div>
                )}

                {def && (
                  <div className="space-y-0.5 rounded border border-rule/60 bg-parchment px-2 py-1 font-serif text-[11px] text-ink-soft">
                    <div>
                      <strong className="text-ink">Saves:</strong> Strong{' '}
                      <span className="text-moss">{def.strongestSaves.join(', ')}</span> · Weak{' '}
                      <span className="text-crimson">{def.weakestSaves.join(', ')}</span>
                    </div>
                    {(def.resistances.length > 0 || def.immunities.length > 0) && (
                      <div>
                        {def.resistances.length > 0 && (
                          <span>
                            <strong className="text-ink">Res:</strong> {def.resistances.join(', ')}{' '}
                          </span>
                        )}
                        {def.immunities.length > 0 && (
                          <span>
                            <strong className="text-ink">Imm:</strong> {def.immunities.join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                    {def.specialSenses.length > 0 && (
                      <div>
                        <strong className="text-ink">Senses:</strong> {def.specialSenses.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                  <EvaluationReportBadge evaluation={ev} compact />
                  <ExportSheetPdfButton pc={pc} mode="gm" compact />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

