'use client';

import { useMemo } from 'react';
import { ListMusic } from 'lucide-react';
import { useVoiceOptional } from './VoiceProvider';
import { SpeakButton } from './SpeakButton';
import { parseNpcDialogueLines } from '@/lib/voice/parseNpcDialogue';

type NpcLike = { id?: string; name?: string };

// Surfaces `@NpcName: "line"` dialogue detected in free text with a per-line
// replay button plus a "Read Aloud" bulk action. Renders nothing when voice is
// unavailable or no speakable lines are found.
export function NpcDialogueLines({
  text,
  npcs,
  label = 'Read Session Aloud',
}: {
  text: string;
  npcs: NpcLike[];
  label?: string;
}) {
  const voice = useVoiceOptional();
  const lines = useMemo(() => parseNpcDialogueLines(text, npcs), [text, npcs]);

  if (!voice?.enabled || lines.length === 0) return null;

  // Only offer the bulk action when at least one detected NPC has a voice.
  const speakable = lines.filter((l) => voice.npcVoiceProfile(l.npcId));
  if (speakable.length === 0) return null;

  return (
    <div className="mt-3 max-w-2xl space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Voiced Lines
        </span>
        <button
          type="button"
          onClick={() =>
            voice.speakSequence(speakable.map((l) => ({ npcId: l.npcId, line: l.line })))
          }
          className="flex items-center gap-1 rounded border border-brass/60 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:border-crimson hover:text-crimson"
        >
          <ListMusic size={11} /> {label}
        </button>
      </div>
      {speakable.map((l, i) => (
        <div key={i} className="flex items-start gap-1.5 font-serif text-xs text-ink-soft">
          <span className="font-display text-[10px] uppercase tracking-wider text-crimson">
            {l.npcName}:
          </span>
          <span className="min-w-0 flex-1 italic">&ldquo;{l.line}&rdquo;</span>
          <SpeakButton npcId={l.npcId} line={l.line} size={12} />
        </div>
      ))}
    </div>
  );
}
