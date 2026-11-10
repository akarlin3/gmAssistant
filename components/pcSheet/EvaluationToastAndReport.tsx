'use client';

import React, { useRef, useState } from 'react';
import { abilityMod, formatMod, proficiencyBonusForLevel } from '@/lib/pc/derived';
import type { CharacterEvaluation, PlayerCharacter } from '@/lib/pc/types';
import { uploadAndMergePcFiles } from '@/components/campaignEditor/useCampaignEditor/useSheetUpload';

function classesSummary(pc: PlayerCharacter): string {
  if (pc.classes && pc.classes.length > 0) {
    return pc.classes
      .map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`)
      .join(' / ');
  }
  return `Level ${pc.level || 1}`;
}

function computePassivePerception(pc: PlayerCharacter): number {
  const wisMod = abilityMod(pc.abilities?.WIS ?? 10);
  const pb = proficiencyBonusForLevel(pc.level || 1);
  const prof = pc.proficiencies?.skills?.includes('Perception') ? pb : 0;
  const exp = pc.skillExpertise?.includes('Perception') ? pb : 0;
  return 10 + wisMod + prof + exp;
}

export type SheetUploadBannerState = {
  message: string;
  pcs: PlayerCharacter[];
  onUndo?: () => void;
};

export function DefensiveProfileInlineBadge({
  evaluation,
  compact = false,
}: {
  evaluation?: CharacterEvaluation;
  compact?: boolean;
}) {
  if (!evaluation?.defensiveProfile) return null;
  const { defensiveProfile, partyRoles, auditNotes } = evaluation;
  const strongText = defensiveProfile.strongestSaves
    .map((s) => `${s.ability} ${formatMod(s.bonus)}`)
    .join(', ');
  const weakText = defensiveProfile.weakestSaves
    .map((s) => `${s.ability} ${formatMod(s.bonus)}`)
    .join(', ');

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: compact ? 5 : 6,
        marginTop: compact ? 4 : 6,
        fontSize: compact ? 10 : 11,
        lineHeight: 1.35,
      }}
    >
      {partyRoles && partyRoles.length > 0 && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {partyRoles.join(' · ')}
        </span>
      )}
      {strongText && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
          title="Strongest Saving Throws"
        >
          Saves ▲ {strongText}
        </span>
      )}
      {weakText && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
          title="Weakest Saving Throws"
        >
          ▼ {weakText}
        </span>
      )}
      {defensiveProfile.senses.length > 0 && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          title="Special Senses"
        >
          👁 {defensiveProfile.senses.join(', ')}
        </span>
      )}
      {defensiveProfile.resistances.length > 0 && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--green)',
          }}
          title="Damage Resistances"
        >
          🛡 Res: {defensiveProfile.resistances.join(', ')}
        </span>
      )}
      {defensiveProfile.immunities.length > 0 && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--green)',
          }}
          title="Immunities"
        >
          ★ Imm: {defensiveProfile.immunities.join(', ')}
        </span>
      )}
      {auditNotes && auditNotes.length > 0 && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'rgba(217, 119, 6, 0.12)',
            border: '1px solid rgba(217, 119, 6, 0.35)',
            color: '#d97706',
            fontWeight: 600,
          }}
          title={auditNotes.map((n) => n.message).join(' | ')}
        >
          ⚠ {auditNotes.length} Audit {auditNotes.length === 1 ? 'Note' : 'Notes'}
        </span>
      )}
    </div>
  );
}

export function EvaluationReportCard({ pc }: { pc: PlayerCharacter }) {
  const evalData = pc.evaluation;
  if (!evalData) return null;
  const { partyRoles, defensiveProfile, auditNotes, derivedStats } = evalData;

  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 6,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 12 }}>
          {pc.name || 'Character'} — Mechanical & Tactical Evaluation
        </strong>
        {partyRoles.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {partyRoles.map((role) => (
              <span
                key={role}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent)',
                }}
              >
                {role}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 8,
          marginBottom: auditNotes.length > 0 ? 8 : 0,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Defensive Profile
          </div>
          <div style={{ fontWeight: 600 }}>{defensiveProfile.acSummary}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Strong Saves:{' '}
            {defensiveProfile.strongestSaves
              .map((s) => `${s.ability} ${formatMod(s.bonus)}`)
              .join(', ')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Weak Saves:{' '}
            {defensiveProfile.weakestSaves
              .map((s) => `${s.ability} ${formatMod(s.bonus)}`)
              .join(', ')}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Senses & Resistances
          </div>
          <div style={{ fontSize: 11 }}>
            <strong>Senses:</strong>{' '}
            {defensiveProfile.senses.length > 0 ? defensiveProfile.senses.join(', ') : 'Normal'}
          </div>
          <div style={{ fontSize: 11 }}>
            <strong>Resistances:</strong>{' '}
            {defensiveProfile.resistances.length > 0
              ? defensiveProfile.resistances.join(', ')
              : 'None'}
          </div>
          {defensiveProfile.immunities.length > 0 && (
            <div style={{ fontSize: 11 }}>
              <strong>Immunities:</strong> {defensiveProfile.immunities.join(', ')}
            </div>
          )}
        </div>

        {derivedStats && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Derived Passives & Casting
            </div>
            <div style={{ fontSize: 11 }}>
              Passives: PRC {derivedStats.passivePerception} · INV{' '}
              {derivedStats.passiveInvestigation} · INS {derivedStats.passiveInsight}
            </div>
            {derivedStats.spellSaveDc !== null && (
              <div style={{ fontSize: 11 }}>
                Spell Save DC {derivedStats.spellSaveDc} · Spell Atk{' '}
                {formatMod(derivedStats.spellAttackBonus ?? 0)}
              </div>
            )}
            <div style={{ fontSize: 11 }}>
              Carrying Capacity: {derivedStats.carryingCapacity} lb.
            </div>
          </div>
        )}
      </div>

      {auditNotes.length > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            Rules & Sheet Audit Notes
          </div>
          {auditNotes.map((note) => (
            <div
              key={note.id}
              style={{
                fontSize: 11,
                color: note.severity === 'warning' ? '#d97706' : 'var(--text-muted)',
              }}
            >
              {note.severity === 'warning' ? '⚠ ' : 'ℹ '}
              {note.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SheetUploadToast({
  banner,
  onDismiss,
}: {
  banner: SheetUploadBannerState | null;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!banner) return null;

  const totalAuditNotes = banner.pcs.reduce(
    (sum, p) => sum + (p.evaluation?.auditNotes?.length || 0),
    0,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginBottom: 12,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'var(--surface)',
        border: '1px solid var(--accent-border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--green)',
            }}
          >
            ✓ {banner.message}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setExpanded((v) => !v)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              background: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            Evaluation Report
            {totalAuditNotes > 0 ? ` (${totalAuditNotes})` : ''} {expanded ? '▴' : '▾'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {banner.onUndo && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                banner.onUndo?.();
                onDismiss();
              }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 10px',
              }}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            style={{ fontSize: 11, padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {banner.pcs.map((pc) => (
            <EvaluationReportCard key={pc.id} pc={pc} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SheetUploadDropzone({
  onFilesSelected,
  uploading = false,
  multiple = true,
  label = 'Drop character sheet (.pdf, .json, .png, .jpg, .webp) or click to upload',
  buttonLabel = 'Upload Sheet',
  compact = false,
}: {
  onFilesSelected: (files: File[]) => void;
  uploading?: boolean;
  multiple?: boolean;
  label?: string;
  buttonLabel?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || uploading) return;
    const files = Array.from(fileList);
    onFilesSelected(multiple ? files : [files[0]]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!uploading) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => {
        if (!uploading) inputRef.current?.click();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '5px 10px' : '8px 12px',
        borderRadius: 6,
        border: dragging ? '1.5px dashed var(--accent)' : '1px dashed var(--border)',
        background: dragging ? 'var(--accent-subtle)' : 'var(--bg)',
        cursor: uploading ? 'wait' : 'pointer',
        fontSize: compact ? 11 : 12,
        color: 'var(--text-muted)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      title={label}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept=".pdf,.json,.png,.jpg,.jpeg,.webp,application/pdf,application/json,image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <span
        style={{
          fontWeight: 600,
          color: 'var(--accent)',
        }}
      >
        {uploading ? 'Evaluating & Saving…' : `↑ ${buttonLabel}`}
      </span>
      {!compact && <span style={{ fontSize: 11 }}>{label}</span>}
    </div>
  );
}

export function PartyRosterRunTracker({
  pcs,
  onPcsChange,
  compact = false,
}: {
  pcs: PlayerCharacter[];
  onPcsChange?: (nextPcs: PlayerCharacter[]) => void;
  compact?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<SheetUploadBannerState | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const handleFilesSelected = async (files: File[]) => {
    if (!onPcsChange || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const snapshot = pcs.map((p) => ({ ...p }));
    try {
      const { nextPcs, uploadedPcs } = await uploadAndMergePcFiles(files, pcs);
      onPcsChange(nextPcs);
      setBanner({
        message: 'Character Evaluated & Saved (Active HP & Spent Resources Preserved)',
        pcs: uploadedPcs,
        onUndo: () => onPcsChange(snapshot),
      });
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to parse character sheet');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {onPcsChange && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <SheetUploadDropzone
            onFilesSelected={handleFilesSelected}
            uploading={uploading}
            multiple={true}
            compact={compact}
            buttonLabel="Upload / Drop PC Sheets"
            label="Drop 1 or more .pdf, .json, or image character sheets to auto-evaluate & merge"
          />
        </div>
      )}

      {uploadError && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid rgba(220, 38, 38, 0.4)',
            background: 'rgba(220, 38, 38, 0.08)',
            color: '#dc2626',
            fontSize: 11,
          }}
        >
          {uploadError}
        </div>
      )}

      <SheetUploadToast banner={banner} onDismiss={() => setBanner(null)} />

      {pcs.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          No PCs in roster yet. Drop character sheets above to populate the party.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pcs.map((pc) => {
            const curHp = pc.hp?.current ?? 0;
            const maxHp = pc.hp?.max ?? 0;
            const tempHp = pc.hp?.temp ?? 0;
            const pp = pc.passivePerception ?? computePassivePerception(pc);
            const reportOpen = expandedReportId === pc.id;
            return (
              <div
                key={pc.id}
                style={{
                  padding: compact ? '6px 8px' : '8px 10px',
                  borderRadius: 6,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{pc.name || 'Unnamed PC'}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {classesSummary(pc)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        fontWeight: 600,
                      }}
                    >
                      HP {curHp}/{maxHp}
                      {tempHp > 0 ? ` (+${tempHp})` : ''}
                    </span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        fontWeight: 600,
                      }}
                    >
                      AC {pc.ac}
                    </span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                      title="Passive Perception"
                    >
                      PP {pp}
                    </span>
                    {pc.spellSaveDc != null && (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}
                        title="Spell Save DC"
                      >
                        DC {pc.spellSaveDc}
                      </span>
                    )}
                    {pc.evaluation && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setExpandedReportId(reportOpen ? null : pc.id)}
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          background: reportOpen ? 'var(--accent-subtle)' : 'var(--bg)',
                        }}
                      >
                        Report {reportOpen ? '▴' : '▾'}
                      </button>
                    )}
                  </div>
                </div>

                {pc.conditions && pc.conditions.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {pc.conditions.map((cond) => (
                      <span
                        key={cond}
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'rgba(220, 38, 38, 0.12)',
                          color: '#dc2626',
                          fontWeight: 600,
                        }}
                      >
                        {cond}
                      </span>
                    ))}
                  </div>
                )}

                <DefensiveProfileInlineBadge evaluation={pc.evaluation} compact={compact} />

                {reportOpen && <EvaluationReportCard pc={pc} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

