'use client';

import { useState, useContext } from 'react';
import { Plus, Users, FileUp } from 'lucide-react';
import PcSheet from './PcSheet';
import { PC_CAP, type PlayerCharacter } from '@/lib/pc/types';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';
import { uploadAndMergePcFiles } from './campaignEditor/useCampaignEditor/useSheetUpload';
import {
  SheetUploadDropzone,
  SheetUploadToast,
  type SheetUploadBannerState,
} from './pcSheet/EvaluationToastAndReport';

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
  onWritePcs?: (next: PlayerCharacter[]) => void;
  roster?: { slotId: string; displayName: string }[];
};

export default function PartyTab({
  pcs, openMap, uploading, uploadError,
  onToggleOpen, onAdd, onUpdate, onRemove, onUploadClick, onWritePcs,
  roster = [],
}: Props) {
  const playMode = useContext(CampaignPlayModeContext);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [banner, setBanner] = useState<SheetUploadBannerState | null>(null);
  const atCap = pcs.length >= PC_CAP;

  const isBusy = Boolean(uploading || localUploading);
  const effectiveError = localError || uploadError;

  const applyPcsList = (next: PlayerCharacter[]) => {
    if (onWritePcs) {
      onWritePcs(next);
    } else {
      next.forEach((p) => onUpdate(p));
    }
  };

  const handleBatchFiles = async (files: File[]) => {
    if (!files.length) return;
    setLocalError('');
    setLocalUploading(true);
    try {
      const outcome = await uploadAndMergePcFiles(
        files,
        pcs,
        {},
        (next) => applyPcsList(next),
      );
      outcome.evaluatedPcs.forEach((p) => {
        if (!openMap[p.id]) onToggleOpen(p.id);
      });
      setBanner({
        message: 'Character Evaluated & Saved (Active HP & Spent Resources Preserved)',
        pcs: outcome.evaluatedPcs,
        onUndo: () => applyPcsList(outcome.previousPcs),
      });
    } catch (err: any) {
      setLocalError(err?.message || 'Upload failed');
    } finally {
      setLocalUploading(false);
    }
  };

  const showDuetPrompt = playMode === 'duet' && pcs.length === 1 && pcs[0].ownership?.ownerType !== 'player' && !promptDismissed;
  const singlePc = pcs[0];

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
        <SheetUploadDropzone
          onFilesSelected={handleBatchFiles}
          uploading={isBusy}
          multiple={true}
          buttonLabel="Drop / Upload Sheets"
          label="Drop 1 or more sheets (.pdf, .json, .png, .jpg, .webp) — auto-evaluates & preserves active state"
        />
      </div>

      <SheetUploadToast banner={banner} onDismiss={() => setBanner(null)} />

      <p className="font-serif text-sm italic text-ink-soft">
        First-class player characters with live HP, abilities, skills, attacks,
        spell slots, and features. Wired into Scene Mode rolls and Session Mode
        combat.
      </p>

      {showDuetPrompt && (
        <div className="animate-fade-in flex flex-col gap-3 rounded border border-teal-500/30 bg-teal-950/10 p-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h4 className="font-display text-sm font-semibold tracking-wide text-teal-400">Duet Mode Setup</h4>
            <p className="font-serif text-xs text-ink-soft">
              Is <strong className="text-teal-400">{singlePc.name || 'Unnamed PC'}</strong> your player&apos;s character? Duet campaigns are designed around exactly one player-owned character.
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => {
                const firstSlotId = roster?.[0]?.slotId;
                onUpdate({
                  ...singlePc,
                  ownership: { ownerType: 'player', playerSlotId: firstSlotId }
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
            />
          </div>
        ))}
        {pcs.length === 0 && (
          <p className="font-serif text-sm italic text-ink-mute">
            No PCs yet. Click &quot;New PC&quot; or drop character sheets above to build your party.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={onAdd}
          disabled={atCap}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson disabled:opacity-40"
          title={atCap ? `Cap of ${PC_CAP} reached` : 'Add a new PC'}
        >
          <Plus size={12} /> New PC
        </button>
        {onUploadClick && (
          <button
            onClick={onUploadClick}
            disabled={isBusy}
            className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson hover:text-wine disabled:cursor-wait disabled:opacity-50"
            title="Upload one or more character sheets (.pdf, .json, .png, .jpg, .webp)"
          >
            <FileUp size={12} /> {isBusy ? 'Evaluating & Saving…' : 'Import Sheet as PC'}
          </button>
        )}
        {effectiveError && (
          <span className="text-xs italic text-crimson" title={effectiveError}>{effectiveError}</span>
        )}
        {atCap && (
          <span className="font-serif text-xs italic text-ink-mute">
            Party is full ({PC_CAP} max) — re-uploading an existing character merges in-place.
          </span>
        )}
      </div>
    </div>
  );
}

