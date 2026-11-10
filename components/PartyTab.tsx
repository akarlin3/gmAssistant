'use client';

import React, { useState, useContext, useRef } from 'react';
import { Plus, Users, FileUp, Wand2 } from 'lucide-react';
import PcSheet from './PcSheet';
import { PC_CAP, type PlayerCharacter } from '@/lib/pc/types';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';
import { parseCharacterSheet } from '@/lib/characterSheetParser';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  CharacterSheetUploadToast,
  ExportAllPartyPdfsButton,
  type SheetUploadToastState,
} from './CharacterSheetLifecycleControls';
import { CharacterWizardModal } from './CharacterWizardModal';

type Props = {
  pcs: PlayerCharacter[];
  openMap: Record<string, boolean>;
  isPro: boolean;
  uploading?: boolean;
  uploadError?: string;
  onToggleOpen: (id: string) => void;
  onAdd: () => void;
  onUpdate: (pc: PlayerCharacter) => void;
  onRemove: (id: string) => void;
  onUploadClick?: () => void;
  roster?: { slotId: string; displayName: string }[];
  onReplaceAllPcs?: (nextPcs: PlayerCharacter[]) => void;
};

export default function PartyTab({
  pcs,
  openMap,
  uploading,
  uploadError,
  onToggleOpen,
  onAdd,
  onUpdate,
  onRemove,
  roster = [],
  onReplaceAllPcs,
}: Props) {
  const playMode = useContext(CampaignPlayModeContext);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [toast, setToast] = useState<SheetUploadToastState | null>(null);
  const [wizardCreateOpen, setWizardCreateOpen] = useState(false);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  const atCap = pcs.length >= PC_CAP;
  const isBusy = uploading || localUploading;
  const activeError = localError || uploadError;

  const showDuetPrompt =
    playMode === 'duet' &&
    pcs.length === 1 &&
    pcs[0].ownership?.ownerType !== 'player' &&
    !promptDismissed;
  const singlePc = pcs[0];

  const handleBatchFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setLocalError('');
    setLocalUploading(true);
    const previousPcs = pcs.map((p) => JSON.parse(JSON.stringify(p)) as PlayerCharacter);

    try {
      let idToken: string | undefined;
      try {
        const user = getFirebaseAuth().currentUser;
        if (user) idToken = await user.getIdToken();
      } catch {
        // Offline Tier 1 still works without auth
      }

      const workingPcs = [...pcs];
      let lastEvaluatedPc: PlayerCharacter | null = null;
      const updatedNames: string[] = [];

      for (const file of files) {
        const res = await parseCharacterSheet(file, {
          filename: file.name,
          mimeType: file.type,
          existingPcs: workingPcs,
          authToken: idToken,
        });
        lastEvaluatedPc = res.pc;
        updatedNames.push(res.pc.name || file.name);

        if (res.mergedWithExisting && res.matchedPcId) {
          const idx = workingPcs.findIndex((p) => p.id === res.matchedPcId);
          if (idx !== -1) {
            workingPcs[idx] = res.pc;
          }
          onUpdate(res.pc);
        } else if (workingPcs.length < PC_CAP) {
          workingPcs.push(res.pc);
          onUpdate(res.pc);
        }
      }

      if (onReplaceAllPcs) {
        onReplaceAllPcs(workingPcs);
      }

      setToast({
        message:
          updatedNames.length === 1
            ? `${updatedNames[0]} evaluated & saved.`
            : `${updatedNames.length} character sheets evaluated & saved (${updatedNames.join(', ')}).`,
        evaluation: lastEvaluatedPc?.evaluation,
        onUndo: () => {
          if (onReplaceAllPcs) {
            onReplaceAllPcs(previousPcs);
          } else {
            for (const prev of previousPcs) {
              onUpdate(prev);
            }
          }
        },
      });
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to parse character sheet.');
    } finally {
      setLocalUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-crimson" />
          <h2 className="font-display tracking-wide text-ink">Party</h2>
          <span className="font-serif text-xs italic text-ink-mute">
            {pcs.length} / {PC_CAP} characters
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportAllPartyPdfsButton pcs={pcs} compact />
        </div>
      </div>

      <p className="font-serif text-sm italic text-ink-soft">
        First-class player characters with live HP, abilities, skills, attacks,
        spell slots, and features. Drop or upload PDF, JSON, or image character sheets
        for automatic mechanical evaluation and state-preserving level-up merges.
      </p>

      <CharacterSheetUploadToast toast={toast} onDismiss={() => setToast(null)} />

      {showDuetPrompt && (
        <div className="animate-fade-in flex flex-col gap-3 rounded border border-teal-500/30 bg-teal-950/10 p-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h4 className="font-display text-sm font-semibold tracking-wide text-teal-400">
              Duet Mode Setup
            </h4>
            <p className="font-serif text-xs text-ink-soft">
              Is <strong className="text-teal-400">{singlePc.name || 'Unnamed PC'}</strong> your
              player&apos;s character? Duet campaigns are designed around exactly one player-owned
              character.
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => {
                const firstSlotId = roster?.[0]?.slotId;
                onUpdate({
                  ...singlePc,
                  ownership: { ownerType: 'player', playerSlotId: firstSlotId },
                });
              }}
              className="rounded bg-teal-600 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-white transition-colors hover:bg-teal-500"
            >
              Set as Player PC
            </button>
            <button
              onClick={() => setPromptDismissed(true)}
              className="rounded border border-rule bg-transparent px-2.5 py-1 font-display text-xs uppercase tracking-wider text-ink-mute transition-colors hover:bg-parchment-deep hover:text-ink"
            >
              Keep as DM NPC
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {pcs.map((pc) => (
          <div key={pc.id} data-cp-anchor={`pc:${pc.id}`}>
            <PcSheet
              pc={pc}
              open={!!openMap[pc.id]}
              onToggleOpen={() => onToggleOpen(pc.id)}
              onChange={onUpdate}
              onRemove={() => onRemove(pc.id)}
              roster={roster}
              allPcs={pcs}
              onEvaluatedUpload={(updatedPc, previousPc) => {
                onUpdate(updatedPc);
                setToast({
                  message: `${updatedPc.name || 'Character'} evaluated & merged (vitals & spent slots preserved).`,
                  evaluation: updatedPc.evaluation,
                  onUndo: () => onUpdate(previousPc),
                });
              }}
            />
          </div>
        ))}
        {pcs.length === 0 && (
          <p className="font-serif text-sm italic text-ink-mute">
            No PCs yet. Click &quot;New PC&quot; or drop `.pdf` / `.json` / image sheets to import.
          </p>
        )}
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files || []);
          if (dropped.length > 0) void handleBatchFiles(dropped);
        }}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-rule bg-parchment-deep/30 px-3 py-2 pt-2"
      >
        <button
          onClick={onAdd}
          disabled={atCap}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson disabled:opacity-40"
          title={atCap ? `Cap of ${PC_CAP} reached` : 'Add a new PC'}
        >
          <Plus size={12} /> New PC
        </button>

        <button
          type="button"
          onClick={() => setWizardCreateOpen(true)}
          disabled={atCap}
          data-testid="party-tab-create-wizard-btn"
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-indigo-700 hover:text-indigo-900 disabled:opacity-40"
          title="Guided Character Builder Wizard"
        >
          <Wand2 size={12} /> Create Character (Wizard)
        </button>

        <button
          type="button"
          onClick={() => batchFileInputRef.current?.click()}
          disabled={isBusy}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson hover:text-wine disabled:cursor-wait disabled:opacity-50"
          title="Upload one or more character sheets (.pdf, .json, .png, .jpg, .webp) — auto-evaluates & merges"
        >
          <FileUp size={12} />{' '}
          {isBusy ? 'Evaluating Sheet(s)…' : 'Upload / Merge Character Sheet(s)'}
        </button>
        <input
          ref={batchFileInputRef}
          type="file"
          multiple
          accept=".pdf,.json,.png,.jpg,.jpeg,.webp,application/pdf,application/json,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            void handleBatchFiles(files);
          }}
          className="hidden"
        />

        {activeError && (
          <span className="text-xs italic text-crimson" title={activeError}>
            {activeError}
          </span>
        )}
        {atCap && (
          <span className="font-serif text-xs italic text-ink-mute">
            Party is full ({PC_CAP} max — uploading an existing character name still merges).
          </span>
        )}
      </div>

      {wizardCreateOpen && (
        <CharacterWizardModal
          open={true}
          mode="create"
          onClose={() => setWizardCreateOpen(false)}
          onSave={(newPc) => {
            if (onReplaceAllPcs) {
              onReplaceAllPcs([...pcs, newPc]);
            } else {
              onUpdate(newPc);
            }
            setWizardCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}
