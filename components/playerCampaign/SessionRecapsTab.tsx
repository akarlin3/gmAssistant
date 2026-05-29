'use client';

// "Sessions" tab: collapsible session recap cards. Extracted verbatim from
// PlayerCampaignView.

import React from 'react';
import { ChevronDown, ChevronRight, Award, Zap } from 'lucide-react';
import type { ChangeEvent, ChangeEventKind } from '@/lib/sessionEvents';
import { CHANGE_EVENT_LABELS } from '@/lib/sessionEvents';
import type { SessionRecap } from './types';

export default function SessionRecapsTab({
  sessionRecaps,
  openSessionIds,
  onToggleSession,
}: {
  sessionRecaps?: SessionRecap[];
  openSessionIds: Record<string, boolean>;
  onToggleSession: (id: string) => void;
}) {
  if (!sessionRecaps || sessionRecaps.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-rule bg-parchment bg-parchment-soft p-8 text-center font-serif italic text-ink-soft shadow-card">
          No sessions have been logged yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessionRecaps.map((log, i) => (
        <div key={log.id || i} className="rounded border border-rule bg-parchment shadow-card">
          {/* Header */}
          <div className="flex items-center gap-2 rounded-t bg-parchment-soft px-3 py-2">
            <button
              type="button"
              onClick={() => onToggleSession(log.id)}
              className="flex-shrink-0 text-ink-mute hover:text-ink focus:outline-none"
            >
              {openSessionIds[log.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <button
              type="button"
              onClick={() => onToggleSession(log.id)}
              className="min-w-0 flex-1 text-left focus:outline-none"
            >
              <div className="truncate font-display font-semibold tracking-wide text-ink">
                {log.title || 'Untitled Session'}
              </div>
              <div className="font-serif text-[11px] text-ink-mute">
                {log.date} {log.events && log.events.length > 0 ? `· ${log.events.length} events` : ''} {log.xpAwarded ? `· ${log.xpAwarded} XP` : ''}
              </div>
            </button>
          </div>

          {/* Collapsible Content */}
          {openSessionIds[log.id] && (
            <div className="space-y-4 border-t border-rule bg-parchment-soft/10 p-4">
              {/* Recap Body */}
              <div className="space-y-1">
                <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">Recap</div>
                {log.body && log.body.trim() ? (
                  <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink-soft">{log.body}</p>
                ) : (
                  <p className="font-serif text-xs italic text-ink-mute">No recap written.</p>
                )}
              </div>

              {/* Strong Start */}
              {log.strongStart && (
                <div className="flex max-w-2xl items-start gap-2.5 rounded border border-crimson/30 bg-crimson/5 p-3 shadow-sm">
                  <Zap size={14} className="mt-0.5 flex-shrink-0 text-crimson" />
                  <div className="min-w-0 flex-1">
                    <span className="block font-display text-[10px] font-semibold uppercase tracking-wider text-crimson">Strong Start Delivered</span>
                    <p className="mt-0.5 whitespace-pre-wrap font-serif text-sm italic text-ink-soft">
                      "{log.strongStart}"
                    </p>
                  </div>
                </div>
              )}

              {/* XP Awarded */}
              {log.xpAwarded && (
                <div className="flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-wider text-brass-deep">
                  <Award size={13} className="text-brass-deep" /> {log.xpAwarded.toLocaleString()} XP Awarded
                </div>
              )}

              {/* Grouped Events */}
              {log.events && log.events.length > 0 && (
                <div className="space-y-2">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">Captured Events</div>
                  <div className="space-y-1.5 border-l border-rule pl-2">
                    {(() => {
                      const eventsByKind: Record<ChangeEventKind, ChangeEvent[]> = {} as Record<ChangeEventKind, ChangeEvent[]>;
                      log.events!.forEach((e: ChangeEvent) => {
                        if (e && e.kind) {
                          (eventsByKind[e.kind] ||= []).push(e);
                        }
                      });
                      return (Object.entries(eventsByKind) as [ChangeEventKind, ChangeEvent[]][]).map(([kind, list]) => (
                        <div key={kind} className="max-w-xl rounded border border-rule/40 bg-parchment-soft p-2">
                          <div className="mb-0.5 font-display text-[9px] font-semibold uppercase tracking-wider text-brass-deep">
                            {CHANGE_EVENT_LABELS[kind] || kind}
                          </div>
                          <ul className="list-disc space-y-0.5 pl-3">
                            {list.map((e) => (
                              <li key={e.id} className="font-serif text-[11px] leading-normal text-ink-soft">
                                <span>{e.summary}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Secrets Revealed */}
              {log.secretsRevealed && log.secretsRevealed.length > 0 && (
                <div className="space-y-1">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">Secrets & Clues Revealed</div>
                  <ul className="list-disc space-y-0.5 pl-4 font-serif text-[11px] text-ink-soft">
                    {log.secretsRevealed.map((s, idx) => <li key={idx}>{s}</li>)}
                  </ul>
                </div>
              )}

              {/* Scenes Used */}
              {log.scenesUsed && log.scenesUsed.length > 0 && (
                <div className="space-y-1">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">Scenes Played</div>
                  <ul className="list-disc space-y-0.5 pl-4 font-serif text-[11px] text-ink-soft">
                    {log.scenesUsed.map((s, idx) => <li key={idx}>{s}</li>)}
                  </ul>
                </div>
              )}

              {/* Goal Updates */}
              {log.goalUpdates && log.goalUpdates.length > 0 && (
                <div className="space-y-1">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">Goal Status Changes</div>
                  <ul className="list-disc space-y-0.5 pl-4 font-serif text-[11px] text-ink-soft">
                    {log.goalUpdates.map((g, idx) => (
                      <li key={idx}>
                        {g.goal}: <span className="text-ink-mute">{g.from} → {g.to}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
