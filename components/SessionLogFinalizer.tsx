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
  const [date, setDate] = useState(() => {
    const d = new Date(startedAt);
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD}`;
  });
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(startedAt);
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    return `${HH}:${MM}`;
  });
  const [durationMinutes, setDurationMinutes] = useState(() => {
    return Math.max(0, Math.round((endedAt - startedAt) / 60000));
  });
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
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const finalStartedAt = new Date(year, month - 1, day, hour, minute).getTime();
    const finalEndedAt = finalStartedAt + (durationMinutes * 60000);

    const keptEvents = draftEvents.filter(e => !e.dismissed);
    const xpAwardedNum = parseInt(xpText.trim() || '0', 10);
    const entry: SessionLogEntry = {
      id: sessionId,
      number: initialNumber,
      date,
      startedAt: finalStartedAt,
      endedAt: finalEndedAt,
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-3">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-rule bg-parchment-soft shadow-page">
        <div className="flex items-center justify-between border-b border-rule bg-parchment px-4 py-3">
          <h2 className="font-display text-lg tracking-wide text-ink">End of Session</h2>
          <span className="font-serif text-xs italic text-ink-mute">
            Save the log to continue editing your campaign
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1.2fr]">
            <label className="space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Start Time</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value || "00:00")}
                className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Duration</span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <input
                  type="number"
                  min={0}
                  value={Math.floor(durationMinutes / 60)}
                  onChange={(e) => {
                    const h = parseInt(e.target.value || '0', 10);
                    const m = durationMinutes % 60;
                    setDurationMinutes(h * 60 + m);
                  }}
                  className="w-12 rounded border border-rule bg-parchment px-1.5 py-1 text-center font-serif text-sm text-ink"
                />
                <span className="font-serif text-[11px] text-ink-mute">h</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={durationMinutes % 60}
                  onChange={(e) => {
                    const h = Math.floor(durationMinutes / 60);
                    const m = parseInt(e.target.value || '0', 10);
                    setDurationMinutes(h * 60 + m);
                  }}
                  className="w-12 rounded border border-rule bg-parchment px-1.5 py-1 text-center font-serif text-sm text-ink"
                />
                <span className="font-serif text-[11px] text-ink-mute">m</span>
              </div>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Recap</span>
            <textarea
              value={recap}
              onChange={(e) => setRecap(e.target.value)}
              placeholder="What happened? Threads opened, threads closed, memorable moments."
              rows={6}
              className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">XP Awarded (optional)</span>
            <input
              type="number"
              min={0}
              value={xpText}
              onChange={(e) => setXpText(e.target.value)}
              placeholder="e.g. 250"
              className="w-32 rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
            />
          </label>

          <div className="rounded border border-rule bg-parchment p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-display text-sm tracking-wide text-ink">Events Captured</span>
              <span className="font-serif text-[11px] text-ink-mute">
                {draftEvents.length} total · {summary.kept} kept · {summary.dismissed} dismissed · {summary.starred} starred
              </span>
            </div>
            {draftEvents.length === 0 ? (
              <p className="font-serif text-xs italic text-ink-mute">No events were captured during this session.</p>
            ) : (
              <div className="space-y-2">
                {(Object.entries(grouped) as [ChangeEventKind, ChangeEvent[]][]).map(([kind, list]) => {
                  const open = groupOpen[kind] ?? true;
                  return (
                    <div key={kind} className="rounded border border-rule/60 bg-parchment-soft">
                      <button
                        onClick={() => setGroupOpen(g => ({ ...g, [kind]: !open }))}
                        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-parchment-deep/40"
                      >
                        {open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />}
                        <span className="flex-1 font-display text-[11px] uppercase tracking-wider text-brass-deep">
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
                              <span className={`flex-1 font-serif text-xs ${e.dismissed ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>
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
          <div className="border-t border-rule bg-moss/5 px-4 py-2 font-serif text-xs italic text-ink-soft">
            <span className="font-display text-[10px] uppercase not-italic tracking-wider text-moss">Prep · </span>
            Prep notes from your wizard run are available in the Sessions tab.
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-rule bg-parchment px-4 py-3">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-mute hover:text-crimson"
            title="Discard this session without saving"
          >
            <Trash2 size={12} /> Discard
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
          >
            <Save size={12} /> Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
