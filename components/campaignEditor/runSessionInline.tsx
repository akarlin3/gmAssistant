// Run/Session inline view — same intent as the full-screen RunSessionView
// overlay, but rendered inside the sub-view container so the rest of the
// app chrome (mode nav, header) stays visible. The overlay is still
// available via the header "Run Session" button. Extracted verbatim from
// CampaignEditor.tsx along with its module-scope helper components.
'use client';

import React, { useState } from 'react';
import {
  Swords, Play,
} from 'lucide-react';
import type { Character } from '@/lib/character-schema';
import { type ChangeEventKind } from '@/lib/sessionEvents';
import { markSessionPlayed } from '@/lib/lastPlayed';
import { type SessionLogEntry } from '@/lib/sessionLog';
import { type Mode } from '@/lib/modes';
import { PrepStat } from './runSessionInline/cards';
import { RunSessionInlineActive } from './runSessionInline/RunSessionInlineActive';

export function RunSessionInline({
  get, setVal, setState, characters, campaignContext,
  nextUp, jumpToNextUp, trackEvent, navigateTo, onEndSession, usedPrep,
  sessionPlaylistAnchor, setSessionPlaylistAnchor,
}: {
  get: (k: string, fb: any) => any;
  setVal: (k: string, v: any) => void;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  characters: Character[];
  campaignContext: any;
  nextUp: { id: string; label: string; current: number; target: number; sectionId: string; phaseId: string } | null;
  jumpToNextUp: () => void;
  trackEvent: (kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => void;
  navigateTo: (target: { mode: Mode; subview?: string; sessionId?: string; anchor?: string }) => void;
  onEndSession: () => void;
  usedPrep: any;
  sessionPlaylistAnchor: { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null;
  setSessionPlaylistAnchor: (next: { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null) => void;
}) {
  const activeId = (get('__activeSessionId', '') as string) || '';
  const isActive = !!activeId;
  const startedAt = (get('__sessionStartedAt', 0) as number) || 0;

  if (!isActive) {
    return <RunSessionInlineIdle
      get={get} setVal={setVal} setState={setState}
      nextUp={nextUp} jumpToNextUp={jumpToNextUp} navigateTo={navigateTo}
      usedPrep={usedPrep}
    />;
  }

  return <RunSessionInlineActive
    get={get} setVal={setVal} characters={characters} campaignContext={campaignContext}
    startedAt={startedAt} trackEvent={trackEvent} onEndSession={onEndSession}
    usedPrep={usedPrep}
    sessionPlaylistAnchor={sessionPlaylistAnchor}
    setSessionPlaylistAnchor={setSessionPlaylistAnchor}
  />;
}

function RunSessionInlineIdle({
  get, setVal, setState, nextUp, jumpToNextUp, navigateTo, usedPrep,
}: {
  get: (k: string, fb: any) => any;
  setVal: (k: string, v: any) => void;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  nextUp: { id: string; label: string; current: number; target: number; sectionId: string; phaseId: string } | null;
  jumpToNextUp: () => void;
  navigateTo: (target: { mode: Mode; subview?: string }) => void;
  usedPrep: any;
}) {
  const sessionV2 = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const recent = [...sessionV2].sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).slice(0, 3);

  const rawNpcs = (get('npcs', []) as any[]);
  const npcsCount = rawNpcs.filter(n => !usedPrep.linkedNpcIds.has(n.id) && !usedPrep.linkedNpcNames.has(n.name)).length;

  const rawLocs = (get('locations', []) as any[]);
  const locationsCount = rawLocs.filter(l => !usedPrep.linkedLocIds.has(l.id) && !usedPrep.linkedLocNames.has(l.name)).length;

  const rawSecrets = (get('secrets', []) as string[]);
  const secretsTotal = rawSecrets.length;
  const unusedSecrets = rawSecrets.filter(s => !usedPrep.usedSecrets.has(s.trim()));
  const secretsRemaining = unusedSecrets.length;

  const rawScenes = (get('scenes', []) as string[]);
  const scenesCount = rawScenes.filter(s => !usedPrep.usedScenes.has(s.trim())).length;

  const startNewSession = (openOverlay: boolean) => {
    if (nextUp) {
      if (!window.confirm(`You have unfinished prep targets (e.g. ${nextUp.label}). Are you sure you want to start the session anyway?`)) {
        return;
      }
    }
    const sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setState(s => markSessionPlayed({
      ...s,
      __activeSessionId: sid,
      __sessionStartedAt: Date.now(),
      __sessionChangeEvents: [],
      __sessionUsedScenes: [],
      __runSessionOpen: openOverlay,
      __livingWorldPromptDismissed: false,
    }));
  };

  return (
    <div className="space-y-3">
      <div className="rounded border-2 border-crimson/50 bg-crimson/5 p-5 shadow-card">
        <h2 className="mb-1 flex items-center gap-2 font-display text-xl tracking-wide text-crimson">
          <Swords size={20} /> Start a Session
        </h2>
        <p className="mb-3 font-serif text-sm text-ink-soft">
          Track prep items used, capture events, and seed the session log. Start in-tab to keep
          the app chrome visible, or open the full-screen run-session overlay.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startNewSession(false)}
            className="flex items-center gap-2 rounded border border-crimson/60 bg-crimson px-4 py-2 font-display text-sm uppercase tracking-wider text-parchment hover:bg-wine"
          >
            <Play size={14} /> Start In-Tab
          </button>
          <button
            type="button"
            onClick={() => startNewSession(true)}
            className="flex items-center gap-2 rounded border border-crimson/60 bg-crimson/10 px-4 py-2 font-display text-sm uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
          >
            Start Full-Screen
          </button>
        </div>
      </div>

      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm tracking-wide text-ink">Recent Sessions</h3>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={() => navigateTo({ mode: 'organize', subview: 'log' })}
              className="font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
            >
              View All →
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="font-serif text-xs italic text-ink-mute">No session logs yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map(entry => (
              <li key={entry.id} className="rounded border border-rule bg-parchment-soft p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                      Session {entry.number}
                      {entry.endedAt && <span className="ml-2 text-ink-mute">{new Date(entry.endedAt).toLocaleDateString()}</span>}
                    </div>
                    {entry.title && <div className="truncate font-display text-sm text-ink">{entry.title}</div>}
                    {entry.recap && (
                      <p className="mt-0.5 line-clamp-2 font-serif text-xs italic text-ink-soft">{entry.recap}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateTo({ mode: 'organize', subview: 'log' })}
                    className="flex-shrink-0 rounded-sm border border-brass-deep/60 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
                  >
                    View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h3 className="mb-2 font-display text-sm tracking-wide text-ink">Prep Status</h3>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PrepStat label="NPCs" value={npcsCount} />
          <PrepStat label="Locations" value={locationsCount} />
          <PrepStat label="Secrets" value={`${secretsRemaining}/${secretsTotal}`} sub="unrevealed" />
          <PrepStat label="Scenes" value={scenesCount} />
        </div>
        {nextUp ? (
          <div className="flex items-center gap-2 rounded border border-brass/40 bg-brass/5 p-2">
            <span className="flex-shrink-0 font-display text-[10px] uppercase tracking-wider text-brass-deep">Lowest Progress</span>
            <span className="flex-1 font-serif text-xs text-ink-soft">
              <span className="font-display text-ink">{nextUp.label}</span>
              <span className="ml-1 italic text-ink-mute">— {nextUp.current} of {nextUp.target}</span>
            </span>
            <button
              type="button"
              onClick={jumpToNextUp}
              className="flex-shrink-0 rounded-sm border border-brass-deep/60 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
            >
              Jump
            </button>
          </div>
        ) : (
          <p className="font-serif text-xs italic text-moss">All prep targets met. Ready to run.</p>
        )}
      </div>
    </div>
  );
}
