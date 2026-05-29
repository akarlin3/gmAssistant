'use client';

import { Check, Eye } from 'lucide-react';
import { SectionShell, Empty, PinToggle } from '../sections';
import type { SectionKey, PinKind } from '../types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import type { ChangeEvent } from '@/lib/sessionEvents';
import { SECTION_META } from './constants';

type NormalizedItem = {
  id: string;
  name: string;
  description?: string;
  assignedPlayerId?: string;
  playerVisibility?: 'name-only' | 'full';
};

type Props = {
  open: boolean;
  onToggle: () => void;
  normalizedItems: NormalizedItem[];
  magicItemsList: any[];
  givenItems: string[];
  playerLog: PlayerLogEntry[];
  roster: any[];
  isPinned: (kind: PinKind, key: string) => boolean;
  togglePin: (kind: PinKind, key: string) => void;
  toggleItemGiven: (name: string, assignedPlayerId?: string) => void;
  setVal: (key: string, val: unknown) => void;
  get: (key: string, fallback: unknown) => unknown;
  shareToPlayerLog: (text: string) => void;
  pushEvent: (e: ChangeEvent) => void;
};

export function MagicItemsSection({
  open,
  onToggle,
  normalizedItems,
  magicItemsList,
  givenItems,
  playerLog,
  roster,
  isPinned,
  togglePin,
  toggleItemGiven,
  setVal,
  get,
  shareToPlayerLog,
  pushEvent,
}: Props) {
  const sectionKey: SectionKey = 'magicItems';

  return (
    <SectionShell
      id={`section-${sectionKey}`}
      title={SECTION_META[sectionKey].label}
      icon={SECTION_META[sectionKey].icon}
      open={open}
      onToggle={onToggle}
      count={magicItemsList.length}
    >
      {normalizedItems.length === 0 ? (
        <Empty>No magic items prepped.</Empty>
      ) : (
        <div className="space-y-2">
          {normalizedItems.map((item, i) => {
            const isGiven = givenItems.includes(item.name);
            const isAssigned = !!item.assignedPlayerId;
            const isShared = playerLog.some(entry => entry.text.includes(`Found Item: ${item.name}`));
            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 rounded-lg border p-3 font-serif text-sm transition-all duration-150 ${
                  isGiven
                    ? 'border-brass/60 bg-brass/10 shadow-sm'
                    : 'border-rule bg-parchment hover:border-brass/45'
                }`}
              >
                <button
                  onClick={() => toggleItemGiven(item.name, item.assignedPlayerId)}
                  className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm border ${
                    isGiven
                      ? 'border-brass-deep bg-brass text-parchment'
                      : 'border-ink-mute bg-parchment hover:border-brass-deep'
                  }`}
                  title={isGiven ? 'Unmark item given' : 'Mark item given this session'}
                >
                  {isGiven && <Check size={10} strokeWidth={3} />}
                </button>
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-ink ${isGiven ? 'text-ink-mute' : ''}`}>
                      {item.name || 'Unnamed Item'}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (isShared) return;
                          shareToPlayerLog(`Found Item: ${item.name}${item.description ? ` — ${item.description}` : ''}`);
                        }}
                        disabled={isShared}
                        className={`p-1 transition-colors ${isShared ? 'cursor-default text-moss' : 'rounded text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
                        title={isShared ? 'Shared with Party Feed' : 'Share with Party Feed'}
                      >
                        <Eye size={12} />
                      </button>
                      <PinToggle pinned={isPinned('item', item.name)} onClick={() => togglePin('item', item.name)} />
                    </div>
                  </div>
                  {item.description && (
                    <p className="whitespace-pre-wrap text-xs italic text-ink-soft">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule/30 pt-2 font-sans text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                        Assigned to:
                      </span>
                      <select
                        value={item.assignedPlayerId || ''}
                        onChange={(e) => {
                          const slotId = e.target.value || undefined;
                          const nextItems = [...magicItemsList];
                          nextItems[i] = { ...item, assignedPlayerId: slotId };
                          setVal('items', nextItems);

                          if (givenItems.includes(item.name)) {
                            const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
                            let newSummary = `Magic item given: ${item.name}`;
                            if (slotId) {
                              const player = roster.find((r: any) => r.slotId === slotId);
                              const name = player ? player.displayName : 'Player';
                              newSummary = `Magic item "${item.name}" given to ${name}`;
                            }
                            const nextEvents = currentEvents.map(ev => {
                              if (ev.kind === 'magic_item_given' && (ev.summary === `Magic item given: ${item.name}` || ev.summary.startsWith(`Magic item "${item.name}"`))) {
                                return { ...ev, summary: newSummary };
                              }
                              return ev;
                            });
                            setVal('__sessionChangeEvents', nextEvents);
                          }
                        }}
                        className="cursor-pointer rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-[10px] text-ink-soft focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {roster.map((r: any) => (
                          <option key={r.slotId} value={r.slotId}>{r.displayName}</option>
                        ))}
                      </select>
                    </div>

                    {isAssigned && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                          Player sees:
                        </span>
                        <select
                          value={item.playerVisibility || 'full'}
                          onChange={(e) => {
                            const vis = e.target.value as 'name-only' | 'full';
                            const nextItems = [...magicItemsList];
                            nextItems[i] = { ...item, playerVisibility: vis };
                            setVal('items', nextItems);
                          }}
                          className="cursor-pointer rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-[10px] text-ink-soft focus:outline-none"
                        >
                          <option value="full">Name & Description</option>
                          <option value="name-only">Name Only</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}
