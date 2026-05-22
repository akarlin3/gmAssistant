'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, eventsOfKind } from '@/lib/prepWizard';
import StepShell from './StepShell';
import { countFilled } from '@/lib/prepTargets';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type NPC = {
  name?: string;
  type?: string;
  faction?: string;
  archetype?: string;
  goal?: string;
  method?: string;
};

type Props = {
  get: Get;
  setVal: SetVal;
  soloTarget: number;
  standardTarget: number;
  soloMode: boolean;
};

export default function Step6NPCs({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const npcs = (get('npcs', []) as NPC[]) || [];
  const setNpcs = (next: NPC[]) => setVal('npcs', next);

  const clocks = (get('clocks', []) as Array<{ faction?: string; filled?: number }>) || [];

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[6]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 6: v });
  };

  const npcEvents = eventsOfKind(last, ['npc_added', 'npc_edited']);
  const advancingFactions = new Set(
    clocks
      .filter(c => (c.filled || 0) > 0 && (c.faction || '').trim().length > 0)
      .map(c => (c.faction || '').trim().toLowerCase())
  );
  const factionTiedNpcs = npcs.filter(n => {
    const f = (n.faction || '').trim().toLowerCase();
    return f && advancingFactions.has(f);
  });
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = npcEvents.length > 0 || factionTiedNpcs.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {npcEvents.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">NPCs Touched Last Session</div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {npcEvents.slice(0, 6).map((e, i) => <li key={i}>{e.summary}</li>)}
          </ul>
        </div>
      )}
      {factionTiedNpcs.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            NPCs Tied to Advancing Clocks
          </div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {factionTiedNpcs.slice(0, 6).map((n, i) => (
              <li key={i}>
                <span className="text-brass-deep">{n.name || 'Unnamed'}</span>
                {n.faction && <span className="text-ink-mute"> · {n.faction}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  const updateNpc = (i: number, patch: Partial<NPC>) => {
    const next = [...npcs];
    next[i] = { ...next[i], ...patch };
    setNpcs(next);
  };
  const removeNpc = (i: number) => setNpcs(npcs.filter((_, j) => j !== i));
  const addNpc = () => setNpcs([...npcs, { name: '', type: '', faction: '', archetype: '', goal: '', method: '' }]);

  return (
    <StepShell
      stepNumber={6}
      title="Outline Important NPCs"
      purpose="3–4 NPCs the party is likely to meet. A name, one trait, one want."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm tracking-wide text-ink">NPCs</h3>
        <span className="font-serif text-[11px] text-ink-mute">
          {countFilled('npcs', npcs)} / {target} target
        </span>
      </div>

      <div className="space-y-2">
        {npcs.length === 0 && (
          <p className="font-serif text-xs italic text-ink-mute">No NPCs yet.</p>
        )}
        {npcs.map((n, i) => (
          <div key={i} className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
            <div className="flex items-start gap-2">
              <input
                value={n.name || ''}
                onChange={(e) => updateNpc(i, { name: e.target.value })}
                placeholder="Name"
                className="flex-1 rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
              />
              <input
                value={n.type || ''}
                onChange={(e) => updateNpc(i, { type: e.target.value })}
                placeholder="Type (Ally / Foil / Villain)"
                className="w-44 rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink-soft"
              />
              <button
                onClick={() => removeNpc(i)}
                className="mt-0.5 p-1 text-ink-mute hover:text-crimson"
                title="Remove NPC"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={n.faction || ''}
                onChange={(e) => updateNpc(i, { faction: e.target.value })}
                placeholder="Faction"
                className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink-soft"
              />
              <input
                value={n.archetype || ''}
                onChange={(e) => updateNpc(i, { archetype: e.target.value })}
                placeholder="Archetype or trait"
                className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink-soft"
              />
              <input
                value={n.goal || ''}
                onChange={(e) => updateNpc(i, { goal: e.target.value })}
                placeholder="Wants (one want)"
                className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink-soft"
              />
              <input
                value={n.method || ''}
                onChange={(e) => updateNpc(i, { method: e.target.value })}
                placeholder="Method (how they pursue it)"
                className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink-soft"
              />
            </div>
          </div>
        ))}
        <button
          onClick={addNpc}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
        >
          <Plus size={12} /> Add NPC
        </button>
      </div>

      <label className="block space-y-1">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Voices, mannerisms, what one NPC reveals about the world."
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </label>
    </StepShell>
  );
}
