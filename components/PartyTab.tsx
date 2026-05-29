'use client';

import { useState, useContext } from 'react';
import { Plus, Users, FileUp } from 'lucide-react';
import PcSheet from './PcSheet';
import { LockedInline } from './LockedFeature';
import { PC_CAP, type PlayerCharacter } from '@/lib/pc/types';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';

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
};

export default function PartyTab({
  pcs, openMap, isPro, uploading, uploadError,
  onToggleOpen, onAdd, onUpdate, onRemove, onUploadClick,
  roster = [],
}: Props) {
  const playMode = useContext(CampaignPlayModeContext);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const atCap = pcs.length >= PC_CAP;

  const showDuetPrompt = playMode === 'duet' && pcs.length === 1 && pcs[0].ownership?.ownerType !== 'player' && !promptDismissed;
  const singlePc = pcs[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-crimson" />
        <h2 className="font-display tracking-wide text-ink">Party</h2>
        <span className="font-serif text-xs italic text-ink-mute">
          {pcs.length} / {PC_CAP} characters
        </span>
      </div>

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
            No PCs yet. Click &quot;New PC&quot; to build a character sheet.
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
        {isPro ? (
          <button
            onClick={onUploadClick}
            disabled={uploading || atCap}
            className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson hover:text-wine disabled:cursor-wait disabled:opacity-50"
            title="Upload a character sheet — parsed by Claude into a PC (pro only)"
          >
            <FileUp size={12} /> {uploading ? 'Parsing…' : 'Import Sheet as PC'}
          </button>
        ) : (
          <LockedInline label="Import Sheet as PC" />
        )}
        {uploadError && (
          <span className="text-xs italic text-crimson" title={uploadError}>{uploadError}</span>
        )}
        {atCap && (
          <span className="font-serif text-xs italic text-ink-mute">
            Party is full ({PC_CAP} max).
          </span>
        )}
      </div>
    </div>
  );
}
