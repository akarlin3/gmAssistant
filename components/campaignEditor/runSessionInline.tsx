// Run/Session inline view — same intent as the full-screen RunSessionView
// overlay, but rendered inside the sub-view container so the rest of the
// app chrome (mode nav, header) stays visible. The overlay is still
// available via the header "Run Session" button. Extracted verbatim from
// CampaignEditor.tsx along with its module-scope helper components.
'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, Check, Plus,
  User, Users, Map, Swords, Target,
  ScrollText, Sparkles, Play, Dice5, Skull, NotebookPen, Zap, Gem, Music,
} from 'lucide-react';
import type { Character } from '@/lib/character-schema';
import type { InitiativeState } from '@/lib/initiative';
import type { HomebrewMonster } from '../MonstersTab';
import { QuickDice, QuickInspire, PanelShell, MusicPlayer } from '../RunSessionView';
import InitiativePanel from '../InitiativePanel';
import { type ChangeEvent, type ChangeEventKind } from '@/lib/sessionEvents';
import { markSessionPlayed } from '@/lib/lastPlayed';
import { type SessionLogEntry } from '@/lib/sessionLog';
import { nextSessionNumber, parseMonsterName } from '@/lib/sessionLog';
import { normalizePcs } from '@/lib/pc/factory';
import { normalizeItem } from '@/lib/playerMode/types';
import { type Mode } from '@/lib/modes';
import { Empty, Detail } from './prepShared';

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
        <h2 className="font-display text-xl tracking-wide text-crimson mb-1 flex items-center gap-2">
          <Swords size={20} /> Start a Session
        </h2>
        <p className="text-sm text-ink-soft font-serif mb-3">
          Track prep items used, capture events, and seed the session log. Start in-tab to keep
          the app chrome visible, or open the full-screen run-session overlay.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startNewSession(false)}
            className="text-sm px-4 py-2 rounded border border-crimson/60 bg-crimson text-parchment hover:bg-wine font-display uppercase tracking-wider flex items-center gap-2"
          >
            <Play size={14} /> Start In-Tab
          </button>
          <button
            type="button"
            onClick={() => startNewSession(true)}
            className="text-sm px-4 py-2 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-2"
          >
            Start Full-Screen
          </button>
        </div>
      </div>

      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display tracking-wide text-ink text-sm">Recent Sessions</h3>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={() => navigateTo({ mode: 'organize', subview: 'log' })}
              className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider"
            >
              View All →
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-xs text-ink-mute italic font-serif">No session logs yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map(entry => (
              <li key={entry.id} className="rounded border border-rule bg-parchment-soft p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
                      Session {entry.number}
                      {entry.endedAt && <span className="ml-2 text-ink-mute">{new Date(entry.endedAt).toLocaleDateString()}</span>}
                    </div>
                    {entry.title && <div className="font-display text-sm text-ink truncate">{entry.title}</div>}
                    {entry.recap && (
                      <p className="text-xs text-ink-soft font-serif italic line-clamp-2 mt-0.5">{entry.recap}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateTo({ mode: 'organize', subview: 'log' })}
                    className="text-[10px] px-2 py-0.5 rounded-sm border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex-shrink-0"
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
        <h3 className="font-display tracking-wide text-ink text-sm mb-2">Prep Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <PrepStat label="NPCs" value={npcsCount} />
          <PrepStat label="Locations" value={locationsCount} />
          <PrepStat label="Secrets" value={`${secretsRemaining}/${secretsTotal}`} sub="unrevealed" />
          <PrepStat label="Scenes" value={scenesCount} />
        </div>
        {nextUp ? (
          <div className="flex items-center gap-2 rounded border border-brass/40 bg-brass/5 p-2">
            <span className="text-[10px] font-display uppercase tracking-wider text-brass-deep flex-shrink-0">Lowest Progress</span>
            <span className="flex-1 text-xs font-serif text-ink-soft">
              <span className="text-ink font-display">{nextUp.label}</span>
              <span className="text-ink-mute italic ml-1">— {nextUp.current} of {nextUp.target}</span>
            </span>
            <button
              type="button"
              onClick={jumpToNextUp}
              className="text-[10px] px-2 py-0.5 rounded-sm border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex-shrink-0"
            >
              Jump
            </button>
          </div>
        ) : (
          <p className="text-xs text-moss italic font-serif">All prep targets met. Ready to run.</p>
        )}
      </div>
    </div>
  );
}

function PrepStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded border border-rule bg-parchment-soft p-2 text-center">
      <div className="font-display text-xl text-ink tabular-nums">{value}</div>
      <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep">{label}</div>
      {sub && <div className="text-[9px] text-ink-mute italic">{sub}</div>}
    </div>
  );
}

function RunSessionInlineActive({
  get, setVal, characters, campaignContext, startedAt, trackEvent, onEndSession, usedPrep,
  sessionPlaylistAnchor, setSessionPlaylistAnchor,
}: {
  get: (k: string, fb: any) => any;
  setVal: (k: string, v: any) => void;
  characters: Character[];
  campaignContext: any;
  startedAt: number;
  trackEvent: (kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => void;
  onEndSession: () => void;
  usedPrep: any;
  sessionPlaylistAnchor: { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null;
  setSessionPlaylistAnchor: (next: { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null) => void;
}) {
  const sessionV2 = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const sessionNumber = nextSessionNumber(sessionV2);
  const party = normalizePcs(get('pcs', []));
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const musicOpen = !!get('__musicOpen', false);
  const setMusicOpen = (v: boolean) => setVal('__musicOpen', v);

  const scenes = (get('scenes', []) as string[]).filter(s => !usedPrep.usedScenes.has(s.trim()));
  const secrets = (get('secrets', []) as string[]).filter(s => !usedPrep.usedSecrets.has(s.trim()));
  const npcs = (get('npcs', []) as any[]).filter(n => !usedPrep.linkedNpcIds.has(n.id) && !usedPrep.linkedNpcNames.has(n.name));
  const locations = (get('locations', []) as any[]).filter(l => !usedPrep.linkedLocIds.has(l.id) && !usedPrep.linkedLocNames.has(l.name));
  const usedScenes = (get('__sessionUsedScenes', []) as string[]) || [];
  const revSec = (get('revSec', {}) as Record<number, boolean>) || {};
  const scratchpad = (get('__sessionScratchpad', '') as string) || '';

  const monstersList = (get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
  const magicItemsList = ((get('items', []) as any[]) || []).filter(item => {
    if (typeof item === 'object' && item) {
      const isAssigned = !!item.assignedPlayerId;
      const id = String(item.id || '').trim();
      const name = String(item.name || '').trim();
      const isLinked = usedPrep.linkedLootIds.has(id) || usedPrep.linkedLootNames.has(name);
      return !isAssigned && !isLinked;
    }
    if (typeof item === 'string') {
      const trimmed = item.trim();
      const isLinked = usedPrep.linkedLootIds.has(trimmed) || usedPrep.linkedLootNames.has(trimmed);
      return !isLinked;
    }
    return true;
  });
  const normalizedItems = magicItemsList.map((it, i) => normalizeItem(it, i));
  const treasureList = (get('treasure', []) as string[]).filter(t => !usedPrep.linkedLootIds.has(t.trim()) && !usedPrep.linkedLootNames.has(t.trim()));
  const playerConfig = (get('player', {}) as any) || {};
  const roster = playerConfig.roster || [];
  const givenItems = (get('__sessionItemsGiven', []) as string[]) || [];
  const pcGoals = (get('pcGoals', []) as any[]) || [];
  const clocks = (get('clocks', []) as any[]) || [];
  const factions = (get('factions', []) as any[]) || [];
  const strongStart = ((get('strongStart', '') as string) || '').trim();
  const strongStartDone = !!get('__sessionStrongStartDelivered', false);

  const elapsed = formatElapsed(Date.now() - startedAt);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const toggleSceneUsed = (text: string) => {
    const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
    if (usedScenes.includes(text)) {
      setVal('__sessionUsedScenes', usedScenes.filter(s => s !== text));
      setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'scene_used' && e.summary === `Used scene: ${text}`)));
      return;
    }
    setVal('__sessionUsedScenes', [...usedScenes, text]);
    trackEvent('scene_used', `Used scene: ${text}`);
  };

  const setRevealed = (i: number, value: boolean, text: string) => {
    const next = { ...revSec, [i]: value };
    setVal('revSec', next);
    const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
    if (value && !revSec[i]) {
      trackEvent('secret_revealed', text);
    } else if (!value && revSec[i]) {
      setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'secret_revealed' && e.summary === text)));
    }
  };

  const toggleItemGiven = (text: string, assignedPlayerId?: string) => {
    const givenItems = (get('__sessionItemsGiven', []) as string[]) || [];
    const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
    if (givenItems.includes(text)) {
      setVal('__sessionItemsGiven', givenItems.filter(s => s !== text));
      setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'magic_item_given' && (e.summary === `Magic item given: ${text}` || e.summary.startsWith(`Magic item "${text}"`)))));
      return;
    }
    setVal('__sessionItemsGiven', [...givenItems, text]);
    let summary = `Magic item given: ${text}`;
    if (assignedPlayerId) {
      const playerConfig = (get('player', {}) as any) || {};
      const roster = playerConfig.roster || [];
      const player = roster.find((r: any) => r.slotId === assignedPlayerId);
      const name = player ? player.displayName : 'Player';
      summary = `Magic item "${text}" given to ${name}`;
    }
    trackEvent('magic_item_given', summary);
  };

  const updateGoalStatus = (i: number, status: string) => {
    const goal = pcGoals[i];
    const fromStatus = goal?.status || 'Active';
    if (fromStatus === status) return;
    const next = [...pcGoals];
    next[i] = { ...goal, status };
    setVal('pcGoals', next);
    trackEvent(
      'goal_status',
      `${goal?.text || `Goal ${i + 1}`}: ${fromStatus} → ${status}`,
      fromStatus, status,
    );
  };

  const tickClock = (i: number, delta: number) => {
    const c = clocks[i];
    if (!c) return;
    const max = c.max || 6;
    const filledNew = Math.max(0, Math.min(max, (c.filled || 0) + delta));
    if (filledNew === c.filled) return;
    const next = [...clocks];
    next[i] = { ...c, filled: filledNew };
    setVal('clocks', next);
    trackEvent(
      'faction_clock_ticked',
      `${c.faction || 'Faction'}: ${c.text || 'clock'} ${c.filled || 0} → ${filledNew} / ${max}`,
      c.filled || 0, filledNew,
    );
  };

  const adjustRenown = (i: number, delta: number) => {
    const f = factions[i];
    if (!f) return;
    const fromV = typeof f.renown === 'number' ? f.renown : 0;
    const toV = fromV + delta;
    const next = [...factions];
    next[i] = { ...f, renown: toV };
    setVal('factions', next);
    trackEvent(
      'renown_changed',
      `${f.name || `Faction ${i + 1}`} renown: ${fromV} → ${toV}`,
      fromV, toV,
    );
  };

  const unrevealedSecrets = secrets
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !revSec[i]);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded border-2 border-crimson/50 bg-crimson/5 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Swords size={16} className="text-crimson" />
          <span className="font-display text-base tracking-wide text-crimson">
            Session {sessionNumber}
          </span>
          <span className="text-xs text-ink-soft font-serif italic">started {elapsed} ago</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setVal('__runSessionOpen', true)}
            className="text-xs px-3 py-1.5 rounded border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
            title="Switch to the full-screen overlay"
          >
            Full-Screen
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
          >
            End Session
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="space-y-3 min-w-0">
          {strongStart && (
            <section className="rounded border-2 border-crimson/50 bg-crimson/5 shadow-card p-3 sm:p-4">
              <div className="flex items-start gap-2 mb-1.5">
                <Zap size={16} className="text-crimson flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h2 className="font-display tracking-wide text-sm sm:text-base text-crimson uppercase">
                      Strong Start
                    </h2>
                    <button
                      onClick={() => {
                        const next = !strongStartDone;
                        setVal('__sessionStrongStartDelivered', next);
                        if (next) {
                          trackEvent('other', 'Strong start delivered');
                        } else {
                          const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
                          setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'other' && e.summary === 'Strong start delivered')));
                        }
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider flex items-center gap-1 ${
                        strongStartDone
                          ? 'bg-brass border-brass-deep text-parchment'
                          : 'border-brass-deep/60 text-brass-deep hover:bg-brass/10'
                      }`}
                    >
                      {strongStartDone && <Check size={10} strokeWidth={3} />}
                      {strongStartDone ? 'Delivered' : 'Mark Delivered'}
                    </button>
                  </div>
                  <p className={`mt-1 text-sm sm:text-base font-serif text-ink-soft whitespace-pre-wrap ${strongStartDone ? 'italic opacity-60' : ''}`}>
                    {strongStart}
                  </p>
                </div>
              </div>
            </section>
          )}

          <ActivePrepGroup title="Scenes" icon={NotebookPen} count={scenes.length}>
            {scenes.length === 0 ? <Empty>No scenes prepped.</Empty> : scenes.map((s, i) => {
              const used = usedScenes.includes(s);
              return (
                <CompactCard
                  key={i}
                  label={s}
                  status={used ? 'used' : undefined}
                  action={{
                    label: used ? 'Unmark' : 'Mark Used',
                    onClick: () => toggleSceneUsed(s),
                  }}
                />
              );
            })}
          </ActivePrepGroup>

          <ActivePrepGroup title="Secrets & Clues" icon={ScrollText} count={secrets.length}>
            {secrets.length === 0 ? <Empty>No secrets prepped.</Empty> : secrets.map((s, i) => {
              const revealed = !!revSec[i];
              return (
                <CompactCard
                  key={i}
                  label={s}
                  status={revealed ? 'used' : undefined}
                  action={{
                    label: revealed ? 'Unmark' : 'Mark Revealed',
                    onClick: () => setRevealed(i, !revealed, s),
                  }}
                />
              );
            })}
          </ActivePrepGroup>

          <ActivePrepGroup title="NPCs" icon={User} count={npcs.length}>
            {npcs.length === 0 ? <Empty>No NPCs prepped.</Empty> : npcs.map((n: any, i: number) => (
              <ExpandableCard
                key={i}
                label={(n.name || '').trim() || (n.archetype || '').trim() || `NPC ${i + 1}`}
                tag={[n.type, n.faction].filter(Boolean).join(' · ')}
              >
                {n.goal && <Detail label="Goal">{n.goal}</Detail>}
                {n.method && <Detail label="Method">{n.method}</Detail>}
                {n.archetype && <Detail label="Archetype">{n.archetype}</Detail>}
                {n.mannerism && <Detail label="Mannerism">{n.mannerism}</Detail>}
              </ExpandableCard>
            ))}
          </ActivePrepGroup>

          <ActivePrepGroup title="Locations" icon={Map} count={locations.length}>
            {locations.length === 0 ? <Empty>No locations prepped.</Empty> : locations.map((l: any, i: number) => (
              <ExpandableCard
                key={i}
                label={(l.name || '').trim() || `Location ${i + 1}`}
                tag={l.type || ''}
              >
                {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
                  <ul className="ml-3 list-disc text-[12px] text-ink-soft italic">
                    {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
                  </ul>
                )}
                {l.factions && <Detail label="Factions">{l.factions}</Detail>}
              </ExpandableCard>
            ))}
          </ActivePrepGroup>

          <ActivePrepGroup title="Relevant Monsters" icon={Skull} count={monstersList.length}>
            {monstersList.length === 0 ? <Empty>No monsters prepped.</Empty> : (
              <ul className="space-y-1">
                {monstersList.map((m, i) => (
                  <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif text-ink-soft">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </ActivePrepGroup>

          <ActivePrepGroup title="Loot & Treasure" icon={Gem} count={magicItemsList.length + treasureList.length}>
            {normalizedItems.length === 0 && treasureList.length === 0 ? (
              <Empty>No magic items or treasure prepped.</Empty>
            ) : (
              <div className="space-y-2 w-full">
                {normalizedItems.map((item, i) => {
                  const isGiven = givenItems.includes(item.name);
                  const isAssigned = !!item.assignedPlayerId;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded border font-serif text-sm transition-all duration-150 flex gap-2 items-start ${
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
                        <div className="flex justify-between items-start gap-2">
                          <div className={`text-ink ${isGiven ? 'text-ink-mute' : ''}`}>
                            {item.name || 'Unnamed Item'}
                          </div>
                        </div>
                        {item.description && (
                          <p className="text-xs text-ink-soft italic whitespace-pre-wrap">
                            {item.description}
                          </p>
                        )}

                        {/* GM Controls inside Session Running panel */}
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 items-center text-[11px] border-t border-rule/30 pt-2 font-sans">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                              Assigned to:
                            </span>
                            <select
                              value={item.assignedPlayerId || ''}
                              onChange={(e) => {
                                const slotId = e.target.value || undefined;
                                const allItems = [...((get('items', []) as any[]) || [])];
                                const targetIndex = allItems.findIndex((it) => {
                                  if (typeof it === 'object' && it && typeof item === 'object' && item) {
                                    return it.id === item.id || (it.name === item.name && it.description === item.description);
                                  }
                                  return it === item || it === item.name;
                                });
                                if (targetIndex !== -1) {
                                  const originalItem = allItems[targetIndex];
                                  if (typeof originalItem === 'object' && originalItem) {
                                    allItems[targetIndex] = { ...originalItem, assignedPlayerId: slotId };
                                  } else {
                                    allItems[targetIndex] = { name: item.name, description: item.description, assignedPlayerId: slotId };
                                  }
                                  setVal('items', allItems);
                                }

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
                              className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-[10px] text-ink-soft cursor-pointer focus:outline-none"
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
                                  const allItems = [...((get('items', []) as any[]) || [])];
                                  const targetIndex = allItems.findIndex((it) => {
                                    if (typeof it === 'object' && it && typeof item === 'object' && item) {
                                      return it.id === item.id || (it.name === item.name && it.description === item.description);
                                    }
                                    return it === item || it === item.name;
                                  });
                                  if (targetIndex !== -1) {
                                    const originalItem = allItems[targetIndex];
                                    if (typeof originalItem === 'object' && originalItem) {
                                      allItems[targetIndex] = { ...originalItem, playerVisibility: vis };
                                    } else {
                                      allItems[targetIndex] = { name: item.name, description: item.description, playerVisibility: vis };
                                    }
                                    setVal('items', allItems);
                                  }
                                }}
                                className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-[10px] text-ink-soft cursor-pointer focus:outline-none"
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

                {treasureList.map((treasure, idx) => {
                  const isGiven = givenItems.includes(treasure);
                  return (
                    <div
                      key={`t-${idx}`}
                      className={`p-3 rounded border font-serif text-sm transition-all duration-150 flex gap-2 items-start ${
                        isGiven
                          ? 'border-brass/60 bg-brass/10 shadow-sm'
                          : 'border-rule bg-parchment hover:border-brass/45'
                      }`}
                    >
                      <button
                        onClick={() => toggleItemGiven(treasure)}
                        className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm border ${
                          isGiven
                            ? 'border-brass-deep bg-brass text-parchment'
                            : 'border-ink-mute bg-parchment hover:border-brass-deep'
                        }`}
                        title={isGiven ? 'Unmark treasure given' : 'Mark treasure given this session'}
                      >
                        {isGiven && <Check size={10} strokeWidth={3} />}
                      </button>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <div className={`text-ink ${isGiven ? 'text-ink-mute' : ''}`}>
                            {treasure}
                          </div>
                          <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep bg-brass/10 border border-brass/25 rounded px-1.5 py-0.5">
                            Treasure
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ActivePrepGroup>

          <ActivePrepGroup title="PC Goals" icon={Target} count={pcGoals.length}>
            {pcGoals.length === 0 ? <Empty>No PC goals prepped.</Empty> : (
              <ul className="space-y-1.5">
                {pcGoals.map((g: any, i: number) => (
                  <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif">
                    <div className="text-ink-soft">{g.text || `Goal ${i + 1}`}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                        <button
                          key={s}
                          onClick={() => updateGoalStatus(i, s)}
                          className={`text-[10px] px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider ${g.status === s ? 'bg-crimson border-crimson text-parchment' : 'border-rule text-ink-mute hover:bg-parchment-deep'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ActivePrepGroup>

          <ActivePrepGroup title="Faction Clocks" icon={ScrollText} count={clocks.length}>
            {clocks.length === 0 ? <Empty>No clocks prepped.</Empty> : (
              <ul className="space-y-1.5">
                {clocks.map((c: any, i: number) => {
                  const max = c.max || 6;
                  const filled = c.filled || 0;
                  return (
                    <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink">{c.text || `Clock ${i + 1}`}</span>
                        <span className="text-[11px] text-brass-deep font-display">{filled}/{max}</span>
                      </div>
                      {c.faction && <div className="text-[10px] text-ink-mute italic">{c.faction}</div>}
                      <div className="flex gap-0.5">
                        {Array.from({ length: max }).map((_, j) => (
                          <button
                            key={j}
                            onClick={() => tickClock(i, j + 1 === filled ? -filled : (j + 1) - filled)}
                            className={`flex-1 h-3 rounded-sm transition-colors ${j < filled ? 'bg-crimson' : 'bg-parchment-deep hover:bg-parchment-deep/70'}`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => tickClock(i, -1)} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">−1</button>
                        <button onClick={() => tickClock(i, 1)} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">+1</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ActivePrepGroup>

          {factions.length > 0 && (
            <ActivePrepGroup title="Faction Renown" icon={Users} count={factions.length}>
              <ul className="space-y-1.5">
                {factions.map((f: any, i: number) => (
                  <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif flex items-center gap-2">
                    <span className="flex-1 text-ink">{f.name || `Faction ${i + 1}`}</span>
                    <span className="text-xs text-brass-deep font-display tabular-nums">{typeof f.renown === 'number' ? f.renown : 0}</span>
                    <button onClick={() => adjustRenown(i, -1)} className="text-[11px] w-6 h-6 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display">−</button>
                    <button onClick={() => adjustRenown(i, 1)} className="text-[11px] w-6 h-6 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display">+</button>
                  </li>
                ))}
              </ul>
            </ActivePrepGroup>
          )}
        </div>

        <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
          <PanelShell title="Initiative" icon={Swords} open={initiativeOpen} onToggle={() => setInitiativeOpen(o => !o)}>
            {initiativeOpen ? (
              <InitiativePanel
                variant="inline"
                state={(get('__initiative', null) as InitiativeState | null)}
                onChange={(next) => setVal('__initiative', next)}
                monsters={get('homebrewMonsters', []) as HomebrewMonster[]}
                pcs={party}
                onClose={() => setInitiativeOpen(false)}
              />
            ) : (
              <p className="text-xs text-ink-mute italic font-serif px-1">Tap to expand and track turns, HP, conditions.</p>
            )}
          </PanelShell>

          <PanelShell title="Session Music" icon={Music} open={musicOpen} onToggle={() => setMusicOpen(!musicOpen)}>
            <MusicPlayer
              playlistUrl={(get('__sessionPlaylist', '') as string)}
              onChangePlaylist={(next) => {
                setVal('__sessionPlaylist', next);
                setVal('__sessionPlaylistIndex', 0);
                setSessionPlaylistAnchor(null);
              }}
              isPlayingProp={!!get('__sessionPlaylistPlaying', false)}
              onChangePlaying={(next) => setVal('__sessionPlaylistPlaying', next)}
              playlists={(get('__sessionPlaylists', []) as Array<{ id: string; name: string; url: string }>)}
              onChangePlaylists={(next) => setVal('__sessionPlaylists', next)}
              playlistIndexProp={(get('__sessionPlaylistIndex', 0) as number)}
              onChangePlaylistIndex={(next) => setVal('__sessionPlaylistIndex', next)}
              onPublishSyncAnchor={setSessionPlaylistAnchor}
            />
          </PanelShell>

          <PanelShell title="Quick Dice" icon={Dice5} open={true} onToggle={() => {}}>
            <QuickDice />
          </PanelShell>

          <PanelShell title="Quick Inspire" icon={Sparkles} open={true} onToggle={() => {}}>
            <QuickInspire campaignContext={campaignContext} />
          </PanelShell>
        </div>
      </div>

      <InlineNoteSeed trackEvent={trackEvent} />

      <div className="sticky bottom-2 bg-parchment-soft border border-rule rounded shadow-page p-2 flex items-start gap-2">
        <NotebookPen size={14} className="text-brass-deep flex-shrink-0 mt-1.5" />
        <textarea
          value={scratchpad}
          onChange={(e) => setVal('__sessionScratchpad', e.target.value)}
          placeholder="Session scratchpad — what happened, threads, open questions. Seeds the log when you end the session."
          rows={2}
          className="flex-1 bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y"
        />
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return 'just now';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return 'just now';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function InlineNoteSeed({ trackEvent }: { trackEvent: (kind: ChangeEventKind, summary: string) => void }) {
  const [text, setText] = useState('');
  return (
    <details className="rounded border border-rule bg-parchment-soft shadow-card">
      <summary className="px-3 py-2 cursor-pointer font-display tracking-wide text-sm text-ink hover:bg-parchment-deep/30 flex items-center gap-2">
        <Plus size={12} className="text-brass-deep" /> Add Session Note
      </summary>
      <div className="px-3 pb-3 pt-1 border-t border-rule space-y-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A moment to remember…"
          className="w-full bg-parchment border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
        />
        <button
          disabled={!text.trim()}
          onClick={() => { trackEvent('other', text.trim()); setText(''); }}
          className="text-xs px-2 py-1 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment disabled:opacity-40 disabled:cursor-not-allowed font-display uppercase tracking-wider"
        >
          Mark as Session Note
        </button>
      </div>
    </details>
  );
}

function ActivePrepGroup({
  title, icon: Icon, count, children,
}: { title: string; icon: any; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30"
      >
        <Icon size={14} className="text-brass-deep flex-shrink-0" />
        <span className="font-display tracking-wide text-sm text-ink flex-1">{title}</span>
        {typeof count === 'number' && <span className="text-[11px] text-ink-mute font-serif">{count}</span>}
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-rule space-y-1.5">{children}</div>}
    </section>
  );
}

function CompactCard({
  label, status, action,
}: {
  label: string;
  status?: 'used';
  action?: { label: string; onClick: () => void };
}) {
  const dim = status === 'used';
  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded border text-sm font-serif ${dim ? 'border-brass/60 bg-brass/10' : 'border-rule bg-parchment'}`}>
      <span className={`flex-1 ${dim ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>{label}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-[10px] px-2 py-0.5 rounded-sm border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex-shrink-0"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function ExpandableCard({
  label, tag, children,
}: { label: string; tag?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const hasContent = !!children && (React.Children.count(children) > 0);
  return (
    <div className="rounded border border-rule bg-parchment text-sm font-serif">
      <button
        type="button"
        onClick={() => hasContent && setOpen(o => !o)}
        className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-parchment-deep/30"
      >
        {hasContent && (open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />)}
        <span className="flex-1 text-ink truncate">{label}</span>
        {tag && <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">{tag}</span>}
      </button>
      {open && hasContent && (
        <div className="px-3 pb-2 pt-1 border-t border-rule text-[12px] text-ink-soft space-y-0.5">{children}</div>
      )}
    </div>
  );
}
