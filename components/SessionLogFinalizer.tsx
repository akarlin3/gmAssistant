'use client';

import { useMemo, useState } from 'react';
import { X, Star, Trash2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import type { ChangeEvent, ChangeEventKind } from '@/lib/sessionEvents';
import { CHANGE_EVENT_LABELS } from '@/lib/sessionEvents';
import type { SessionLogEntry, GoalUpdate } from '@/lib/sessionLog';
import { nextSessionNumber, todayISO, summarizeEvents } from '@/lib/sessionLog';

type Props = {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  scratchpad: string;
  events: ChangeEvent[];
  existingEntries: SessionLogEntry[];
  hasPrepWizardRun?: boolean;
  onSave: (entry: SessionLogEntry) => void;
  onDiscard: () => void;
};

function eventsToGoalUpdates(events: ChangeEvent[]): GoalUpdate[] {
  return events
    .filter(e => e.kind === 'goal_status' && !e.dismissed)
    .map(e => {
      const [goalText, _change] = e.summary.split(': ');
      const fromTo = e.summary.split(': ')[1] || '';
      const [from, to] = fromTo.split(' → ');
      return { goal: goalText || '', from: from || String(e.before ?? ''), to: to || String(e.after ?? '') };
    });
}

function eventsToSecrets(events: ChangeEvent[]): string[] {
  return events.filter(e => e.kind === 'secret_revealed' && !e.dismissed).map(e => e.summary);
}

function eventsToScenes(events: ChangeEvent[]): string[] {
  return events
    .filter(e => e.kind === 'scene_used' && !e.dismissed)
    .map(e => e.summary.replace(/^Used scene:\s*/, ''));
}

export default function SessionLogFinalizer({
  sessionId, startedAt, endedAt, scratchpad, events, existingEntries, hasPrepWizardRun, onSave, onDiscard,
}: Props) {
  const initialNumber = useMemo(() => nextSessionNumber(existingEntries), [existingEntries]);
  const [title, setTitle] = useState(`Session ${initialNumber}`);
  const [date, setDate] = useState(todayISO());
  const [recap, setRecap] = useState(scratchpad || '');
  const [xpText, setXpText] = useState('');
  const [draftEvents, setDraftEvents] = useState<ChangeEvent[]>(events);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const acc: Record<ChangeEventKind, ChangeEvent[]> = {} as any;
    for (const e of draftEvents) {
      (acc[e.kind] ||= []).push(e);
    }
    return acc;
  }, [draftEvents]);

  const summary = summarizeEvents(draftEvents);

  const toggleStar = (id: string) => {
    setDraftEvents(es => es.map(e => e.id === id ? { ...e, starred: !e.starred } : e));
  };
  const toggleDismiss = (id: string) => {
    setDraftEvents(es => es.map(e => e.id === id ? { ...e, dismissed: !e.dismissed } : e));
  };

  const handleSave = () => {
    const keptEvents = draftEvents.filter(e => !e.dismissed);
    const xpAwardedNum = parseInt(xpText.trim() || '0', 10);
    const entry: SessionLogEntry = {
      id: sessionId,
      number: initialNumber,
      date,
      startedAt,
      endedAt,
      title: title.trim() || `Session ${initialNumber}`,
      recap,
      xpAwarded: isNaN(xpAwardedNum) || xpAwardedNum === 0 ? undefined : xpAwardedNum,
      events: keptEvents,
      secretsRevealed: eventsToSecrets(keptEvents),
      scenesUsed: eventsToScenes(keptEvents),
      goalUpdates: eventsToGoalUpdates(keptEvents),
    };
    onSave(entry);
  };

  const handleDiscard = () => {
    if (!confirm('Discard this session without saving? Scratchpad and event capture will be lost.')) return;
    onDiscard();
  };

  return (
    <div className="fixed inset-0 z-40 bg-ink/60 flex items-center justify-center p-3">
      <div className="bg-parchment-soft border border-rule rounded-lg shadow-page w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rule bg-parchment">
          <h2 className="font-display text-lg tracking-wide text-ink">End of Session</h2>
          <span className="text-xs text-ink-mute font-serif italic">
            Save the log to continue editing your campaign
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-parchment border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-parchment border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Recap</span>
            <textarea
              value={recap}
              onChange={(e) => setRecap(e.target.value)}
              placeholder="What happened? Threads opened, threads closed, memorable moments."
              rows={6}
              className="w-full bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif resize-y"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">XP Awarded (optional)</span>
            <input
              type="number"
              min={0}
              value={xpText}
              onChange={(e) => setXpText(e.target.value)}
              placeholder="e.g. 250"
              className="w-32 bg-parchment border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
            />
          </label>

          <div className="rounded border border-rule bg-parchment p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-display tracking-wide text-sm text-ink">Events Captured</span>
              <span className="text-[11px] text-ink-mute font-serif">
                {draftEvents.length} total · {summary.kept} kept · {summary.dismissed} dismissed · {summary.starred} starred
              </span>
            </div>
            {draftEvents.length === 0 ? (
              <p className="text-xs text-ink-mute italic font-serif">No events were captured during this session.</p>
            ) : (
              <div className="space-y-2">
                {(Object.entries(grouped) as [ChangeEventKind, ChangeEvent[]][]).map(([kind, list]) => {
                  const open = groupOpen[kind] ?? true;
                  return (
                    <div key={kind} className="rounded border border-rule/60 bg-parchment-soft">
                      <button
                        onClick={() => setGroupOpen(g => ({ ...g, [kind]: !open }))}
                        className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-parchment-deep/40"
                      >
                        {open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />}
                        <span className="text-[11px] font-display uppercase tracking-wider text-brass-deep flex-1">
                          {CHANGE_EVENT_LABELS[kind] || kind}
                        </span>
                        <span className="text-[10px] text-ink-mute">{list.length}</span>
                      </button>
                      {open && (
                        <ul className="divide-y divide-rule/40">
                          {list.map(e => (
                            <li key={e.id} className={`flex items-start gap-2 px-2 py-1.5 ${e.dismissed ? 'opacity-50' : ''}`}>
                              <button
                                onClick={() => toggleStar(e.id)}
                                className={`mt-0.5 flex-shrink-0 ${e.starred ? 'text-brass' : 'text-ink-mute hover:text-brass'}`}
                                title={e.starred ? 'Unstar' : 'Star'}
                              >
                                <Star size={12} fill={e.starred ? 'currentColor' : 'none'} />
                              </button>
                              <span className={`flex-1 text-xs font-serif ${e.dismissed ? 'line-through text-ink-mute' : 'text-ink-soft'}`}>
                                {e.summary}
                              </span>
                              <button
                                onClick={() => toggleDismiss(e.id)}
                                className="mt-0.5 flex-shrink-0 text-ink-mute hover:text-crimson"
                                title={e.dismissed ? 'Restore' : 'Dismiss'}
                              >
                                <X size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {hasPrepWizardRun && (
          <div className="px-4 py-2 border-t border-rule bg-moss/5 text-xs text-ink-soft font-serif italic">
            <span className="text-moss font-display uppercase tracking-wider text-[10px] not-italic">Prep · </span>
            Prep notes from your wizard run are available in the Sessions tab.
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-rule bg-parchment">
          <button
            onClick={handleDiscard}
            className="text-xs text-ink-mute hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1"
            title="Discard this session without saving"
          >
            <Trash2 size={12} /> Discard
          </button>
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
          >
            <Save size={12} /> Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
