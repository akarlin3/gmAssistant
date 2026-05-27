'use client';

import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, eventsOfKind } from '@/lib/prepWizard';
import { normalizeItem, type PlayerConfig, type CampaignItem } from '@/lib/playerMode/types';
import { Plus, Trash2, Gift } from 'lucide-react';
import StepShell from './StepShell';
import { countFilled } from '@/lib/prepTargets';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type Goal = { text?: string; status?: string };

type Props = {
  get: Get;
  setVal: SetVal;
  soloTarget: number;
  standardTarget: number;
  soloMode: boolean;
};

export default function Step8MagicItems({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const rawItems = (get('items', []) as any[]) || [];
  const normalizedItems = rawItems.map((it, i) => normalizeItem(it, i));

  const config = (get('player', {}) as PlayerConfig) || {};
  const roster = config.roster || [];

  const unassignedItems = normalizedItems.filter(it => !it.assignedPlayerId);

  const updateItem = (itemId: string, patch: Partial<CampaignItem>) => {
    const next = normalizedItems.map(it => {
      if (it.id === itemId) {
        return { ...it, ...patch };
      }
      return it;
    });
    setVal('items', next);
  };

  const removeItem = (itemId: string) => {
    const next = normalizedItems.filter(it => it.id !== itemId);
    setVal('items', next);
  };

  const addItem = () => {
    const newItem: CampaignItem = {
      id: `item_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`,
      name: '',
      description: '',
      playerVisibility: 'full',
    };
    setVal('items', [...rawItems, newItem]);
  };

  const pcGoals = (get('pcGoals', []) as Goal[]) || [];
  const activeGoals = pcGoals.filter(g => !g.status || g.status === 'Active' || g.status === 'Progressed');

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[8]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 8: v });
  };

  const itemEvents = eventsOfKind(last, ['magic_item_given']);
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = itemEvents.length > 0 || activeGoals.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {itemEvents.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Given Last Session — Skip Back-to-Back Rewards
          </div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {itemEvents.map((e, i) => <li key={i}>{e.summary}</li>)}
          </ul>
        </div>
      )}
      {activeGoals.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Active PC Goals — Items That Resonate Matter Most
          </div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {activeGoals.slice(0, 5).map((g, i) => (
              <li key={i}>{g.text || 'Unnamed goal'}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  return (
    <StepShell
      stepNumber={8}
      title="Select Magic Item Rewards"
      purpose="1–2 rewards aligned to a PC's interests or goals. Skip when nothing feels right — better none than generic."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm tracking-wide text-ink">Magic Item Rewards</h3>
        <span className="font-serif text-[11px] text-ink-mute">
          {countFilled('items', rawItems, config)} / {target} target
        </span>
      </div>

      <div className="space-y-3">
        {unassignedItems.length === 0 && (
          <p className="font-serif text-xs italic text-ink-mute">No magic items prepped yet.</p>
        )}
        {unassignedItems.map((item) => (
          <div
            key={item.id}
            className="group relative rounded-lg border border-rule bg-parchment-soft/50 hover:bg-parchment-soft p-3.5 shadow-sm hover:shadow transition-all duration-200 space-y-2.5"
          >
            <div className="flex gap-3 items-start">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  placeholder="Magic Item Name (e.g. +1 Flame Tongue Rapier)"
                  className="w-full rounded border border-rule bg-parchment px-2.5 py-1.5 font-display text-sm font-semibold text-ink placeholder:text-ink-faint focus:border-crimson focus:outline-none"
                />
                <textarea
                  value={item.description || ''}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  placeholder="Provocative read-aloud description, atmospheric note, or mechanical effects..."
                  rows={2}
                  className="w-full resize-y rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink-soft placeholder:text-ink-faint focus:border-crimson focus:outline-none"
                />
                <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                      Assign to player:
                    </span>
                    <select
                      value={item.assignedPlayerId || ''}
                      onChange={(e) => updateItem(item.id, { assignedPlayerId: e.target.value || undefined })}
                      className="rounded border border-rule bg-parchment px-2 py-0.5 font-serif text-[10px] text-ink-soft focus:border-crimson focus:outline-none cursor-pointer"
                    >
                      <option value="">Unassigned</option>
                      {roster.map(r => (
                        <option key={r.slotId} value={r.slotId}>{r.displayName}</option>
                      ))}
                    </select>
                  </div>
                  {item.assignedPlayerId && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                        Player visibility:
                      </span>
                      <select
                        value={item.playerVisibility || 'full'}
                        onChange={(e) => updateItem(item.id, { playerVisibility: e.target.value as 'name-only' | 'full' })}
                        className="rounded border border-rule bg-parchment px-2 py-0.5 font-serif text-[10px] text-ink-soft focus:border-crimson focus:outline-none cursor-pointer"
                      >
                        <option value="full">Name & Description</option>
                        <option value="name-only">Name Only</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="p-1 rounded text-ink-mute hover:text-crimson hover:bg-crimson/5 transition-colors duration-150 flex-shrink-0"
                title="Remove Item"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1.5 rounded-full border border-brass-deep/60 bg-brass/5 px-4 py-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass-deep transition-all duration-150"
        >
          <Plus size={12} /> Add Magic Item
        </button>
      </div>

      <label className="block space-y-1 mt-4">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Who gets what, how it surfaces in the fiction."
          className="w-full resize-y rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-sm text-ink focus:border-crimson focus:outline-none placeholder:italic placeholder:text-ink-faint"
        />
      </label>
    </StepShell>
  );
}
