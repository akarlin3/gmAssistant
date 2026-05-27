'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Flag, Dice5, Sparkles, ChevronDown, ChevronRight, Check,
  Eye, EyeOff, Plus, Swords, NotebookPen, Target, Map, Users, ScrollText,
  Skull, Gem, Zap, BookOpen, Pin, PinOff, Wand2, Loader2, X, Wrench, ChevronUp, Clock,
  Music, ExternalLink, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
} from 'lucide-react';
import { TABLES, rollTable } from '@/lib/inspirationTables';
import InitiativePanel from './InitiativePanel';
import MonsterStatBlock from './MonsterStatBlock';
import type { InitiativeState } from '@/lib/initiative';
import { normalizePcs } from '@/lib/pc/factory';
import type { HomebrewMonster } from './MonstersTab';
import type { Character } from '@/lib/character-schema';
import { makeEvent, type ChangeEvent } from '@/lib/sessionEvents';
import { LockedInline } from '@/components/LockedFeature';
import { useAuth } from '@/lib/firebase/auth-context';
import { generatePlotSegues } from '@/lib/generators/plot-segue';
import { generateQuickInspire } from '@/lib/generators/quick-inspire';
import { describeScene } from '@/lib/generators/describe-scene';
import type { CampaignContext, PlotSegueType } from '@/lib/generators/types';
import { normalizeItem, type PlayerConfig, type CampaignItem, type EntityVisibility, type PlayerEntityType } from '@/lib/playerMode/types';
import { publishProjections } from '@/lib/playerMode/publish';
import { makeLogEntryId, applyNarrationReveal, type PlayerLogEntry, type Mention } from '@/lib/playerMode/sessionLog';

type PinKind = 'scene' | 'npc' | 'location' | 'monster' | 'item';
type PinRef = { kind: PinKind; key: string };

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type Props = {
  get: Get;
  setVal: SetVal;
  characters: Character[];
  onEndSession: () => void;
  onExitWithoutEnding: () => void;
  onOpenLibrary: () => void;
  campaignContext?: CampaignContext;
  campaignId?: string;
  campaignName?: string;
};

const SECTION_KEYS = [
  'scenes', 'secrets', 'npcs', 'locations', 'monsters', 'magicItems', 'goals', 'clocks',
] as const;

type SectionKey = typeof SECTION_KEYS[number];

const SECTION_META: Record<SectionKey, { label: string; icon: any }> = {
  scenes:     { label: 'Potential Scenes',  icon: NotebookPen },
  secrets:    { label: 'Secrets & Clues',   icon: Eye },
  npcs:       { label: 'NPCs',              icon: Users },
  locations:  { label: 'Locations',         icon: Map },
  monsters:   { label: 'Relevant Monsters', icon: Skull },
  magicItems: { label: 'Magic Items',       icon: Gem },
  goals:      { label: 'PC Goals',          icon: Target },
  clocks:     { label: 'Faction Clocks',    icon: ScrollText },
};

export default function RunSessionView({
  get, setVal, characters, onEndSession, onExitWithoutEnding, onOpenLibrary, campaignContext, campaignId, campaignName,
}: Props) {
  const [section, setSection] = useState<Record<SectionKey, boolean>>({
    scenes: true, secrets: true, npcs: true, locations: true,
    monsters: true, magicItems: true, goals: true, clocks: true,
  });
  const party = useMemo(() => normalizePcs(get('pcs', [])), [get]);
  const strongStartDone = !!get('__sessionStrongStartDelivered', false);
  const [toast, setToast] = useState<string | null>(null);

  // --- REAL-TIME PLAYER SHARING & AUTO-PUBLISH SYSTEM ---
  const playerConfig = useMemo(() => (get('player', {}) as PlayerConfig) || {}, [get]);
  const playerLog = useMemo(() => (get('playerLog', []) as PlayerLogEntry[]) || [], [get]);

  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle');
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishSignature = useMemo(
    () => JSON.stringify({
      p: playerConfig,
      n: get('npcs', []),
      l: get('locations', []),
      f: get('factions', []),
      c: get('characters', []),
      k: get('clocks', []),
      h: get('handouts', ''),
      s: playerLog,
      i: get('items', []),
      playlist: get('__sessionPlaylist', ''),
      playing: !!get('__sessionPlaylistPlaying', false),
      index: get('__sessionPlaylistIndex', 0),
    }),
    [playerConfig, get, playerLog],
  );

  useEffect(() => {
    if (!playerConfig?.shareToken || !campaignId) return;
    if (publishTimer.current) clearTimeout(publishTimer.current);
    publishTimer.current = setTimeout(() => {
      void (async () => {
        setPublishState('publishing');
        try {
          const dataToPublish = {
            player: playerConfig,
            npcs: get('npcs', []),
            locations: get('locations', []),
            factions: get('factions', []),
            characters: get('characters', []),
            clocks: get('clocks', []),
            handouts: get('handouts', ''),
            playerLog,
            items: get('items', []),
            maps: get('maps', []),
            __sessionPlaylist: get('__sessionPlaylist', '') as string,
            __sessionPlaylistPlaying: !!get('__sessionPlaylistPlaying', false),
            __sessionPlaylistIndex: get('__sessionPlaylistIndex', 0) as number,
          };
          await publishProjections(campaignId, campaignName || 'Campaign', dataToPublish);
          setPublishState('done');
          setTimeout(() => setPublishState('idle'), 2000);
        } catch (e) {
          console.error('[RunSessionView] publish failed', e);
          setPublishState('error');
        }
      })();
    }, 1500);
    return () => { if (publishTimer.current) clearTimeout(publishTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishSignature, campaignId, campaignName]);

  // Generic helper to post narrative clues/events to the player feed
  const shareToPlayerLog = (text: string, mentions: Mention[] = []) => {
    const nextLog = [...playerLog, {
      id: makeLogEntryId(),
      text: text.trim(),
      mentions,
      visibility: { mode: 'party' },
      authorRef: 'gm',
      postedAtMs: Date.now(),
    }];
    setVal('playerLog', nextLog);

    if (mentions.length > 0) {
      const nextConfig = applyNarrationReveal(playerConfig, mentions, { mode: 'party' });
      setVal('player', nextConfig);
    }
    setToast('Shared with players!');
  };

  // Helper to toggle formal public/private visibility of campaign entities (NPCs, Locations, Clocks)
  const toggleEntityShare = (type: PlayerEntityType, id: string) => {
    const ev = { ...(playerConfig.entityVisibility ?? {}) };
    const bucket = { ...(ev[type] ?? {}) };
    const curVis = bucket[id];
    
    if (curVis && curVis.mode === 'party') {
      delete bucket[id];
    } else {
      bucket[id] = { mode: 'party' };
    }
    ev[type] = bucket;
    setVal('player', { ...playerConfig, entityVisibility: ev });
    setToast(bucket[id] ? 'Shared with players!' : 'Removed from player view');
  };

  const toggleSection = (k: SectionKey) => setSection(s => ({ ...s, [k]: !s[k] }));

  const events = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
  const pushEvent = (e: ChangeEvent) => {
    setVal('__sessionChangeEvents', [...events, e]);
    setToast('Added to Session Log');
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const usedScenes = (get('__sessionUsedScenes', []) as string[]) || [];
  const toggleSceneUsed = (text: string) => {
    const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
    if (usedScenes.includes(text)) {
      setVal('__sessionUsedScenes', usedScenes.filter(s => s !== text));
      setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'scene_used' && e.summary === `Used scene: ${text}`)));
      return;
    }
    setVal('__sessionUsedScenes', [...usedScenes, text]);
    pushEvent(makeEvent('scene_used', `Used scene: ${text}`));
  };

  const givenItems = (get('__sessionItemsGiven', []) as string[]) || [];
  const toggleItemGiven = (text: string, assignedPlayerId?: string) => {
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
    pushEvent(makeEvent('magic_item_given', summary));
  };

  const revSec = (get('revSec', {}) as Record<number, boolean>) || {};
  const setRevSec = (i: number, value: boolean, text: string) => {
    const next = { ...revSec, [i]: value };
    setVal('revSec', next);
    const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
    if (value && !revSec[i]) {
      pushEvent(makeEvent('secret_revealed', text));
    } else if (!value && revSec[i]) {
      setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'secret_revealed' && e.summary === text)));
    }
  };

  const pcGoals = (get('pcGoals', []) as any[]) || [];
  const updateGoalStatus = (i: number, status: string) => {
    const goal = pcGoals[i];
    const fromStatus = goal?.status || 'Active';
    if (fromStatus === status) return;
    const next = [...pcGoals];
    next[i] = { ...goal, status };
    setVal('pcGoals', next);
    pushEvent(makeEvent(
      'goal_status',
      `${goal?.text || `Goal ${i + 1}`}: ${fromStatus} → ${status}`,
      fromStatus, status,
    ));
  };

  const clocks = (get('clocks', []) as any[]) || [];
  const tickClock = (i: number, delta: number) => {
    const c = clocks[i];
    if (!c) return;
    const max = c.max || 6;
    const filledNew = Math.max(0, Math.min(max, (c.filled || 0) + delta));
    if (filledNew === c.filled) return;
    const next = [...clocks];
    next[i] = { ...c, filled: filledNew };
    setVal('clocks', next);
    pushEvent(makeEvent(
      'faction_clock_ticked',
      `${c.faction || 'Faction'}: ${c.text || 'clock'} ${c.filled || 0} → ${filledNew} / ${max}`,
      c.filled || 0, filledNew,
    ));
  };

  const factions = (get('factions', []) as any[]) || [];
  const adjustRenown = (i: number, delta: number) => {
    const f = factions[i];
    if (!f) return;
    const fromV = typeof f.renown === 'number' ? f.renown : 0;
    const toV = fromV + delta;
    const next = [...factions];
    next[i] = { ...f, renown: toV };
    setVal('factions', next);
    pushEvent(makeEvent(
      'renown_changed',
      `${f.name || `Faction ${i + 1}`} renown: ${fromV} → ${toV}`,
      fromV, toV,
    ));
  };

  const scenes = (get('scenes', []) as string[]) || [];
  const secrets = (get('secrets', []) as string[]) || [];
  const npcs = (get('npcs', []) as any[]) || [];
  const locations = (get('locations', []) as any[]) || [];
  const monstersList = (get('monsters', []) as string[]) || [];
  const magicItemsList = (get('items', []) as any[]) || [];
  const normalizedItems = magicItemsList.map((it, i) => normalizeItem(it, i));
  const roster = playerConfig.roster || [];
  const strongStart = ((get('strongStart', '') as string) || '').trim();

  const scratchpad = (get('__sessionScratchpad', '') as string) || '';
  const setScratchpad = (v: string) => setVal('__sessionScratchpad', v);

  const initiativeOpen = !!get('__initiativeOpen', false);
  const setInitiativeOpen = (v: boolean) => setVal('__initiativeOpen', v);

  const musicOpen = !!get('__musicOpen', false);
  const setMusicOpen = (v: boolean) => setVal('__musicOpen', v);

  const homebrewMonstersRaw = get('homebrewMonsters', []) as HomebrewMonster[];
  const homebrewMonsters = useMemo(() => homebrewMonstersRaw || [], [homebrewMonstersRaw]);
  const [statBlockSlug, setStatBlockSlug] = useState<string | null>(null);
  const statBlockMonster = useMemo(
    () => (statBlockSlug ? homebrewMonsters.find(m => m.slug === statBlockSlug) ?? null : null),
    [statBlockSlug, homebrewMonsters],
  );

  const pinned = (get('__sessionPinned', []) as PinRef[]) || [];
  const isPinned = (kind: PinKind, key: string) =>
    pinned.some(p => p.kind === kind && p.key === key);
  const togglePin = (kind: PinKind, key: string) => {
    if (isPinned(kind, key)) {
      setVal('__sessionPinned', pinned.filter(p => !(p.kind === kind && p.key === key)));
    } else {
      setVal('__sessionPinned', [...pinned, { kind, key }]);
    }
  };

  const sceneDescriptions = (get('__sessionSceneDescriptions', {}) as Record<string, string>) || {};
  const setSceneDescription = (sceneText: string, description: string) => {
    setVal('__sessionSceneDescriptions', { ...sceneDescriptions, [sceneText]: description });
  };
  const clearSceneDescription = (sceneText: string) => {
    const next = { ...sceneDescriptions };
    delete next[sceneText];
    setVal('__sessionSceneDescriptions', next);
  };

  const [longSessionPrompt, setLongSessionPrompt] = useState(false);
  const [sessionDurationHours, setSessionDurationHours] = useState(0);
  useEffect(() => {
    const startedAt = get('__sessionStartedAt', Date.now()) as number;
    const hours = (Date.now() - startedAt) / (1000 * 60 * 60);
    setSessionDurationHours(hours);
    if (hours > 4) {
      setLongSessionPrompt(true);
    }
  }, [get]);

  const [mobileToolsExpanded, setMobileToolsExpanded] = useState(true);

  const toolsContent = (
    <>
      <PanelShell title="Initiative" icon={Swords} open={initiativeOpen} onToggle={() => setInitiativeOpen(!initiativeOpen)}>
        {initiativeOpen ? (
          <InitiativePanel
            variant="inline"
            state={(get('__initiative', null) as InitiativeState | null)}
            onChange={(next) => setVal('__initiative', next)}
            monsters={get('homebrewMonsters', []) as HomebrewMonster[]}
            pcs={party}
            onClose={() => setInitiativeOpen(false)}
            onEnded={(summary) => {
              pushEvent(makeEvent('other', summary));
            }}
          />
        ) : (
          <p className="px-1 font-serif text-xs italic text-ink-mute">Tap to expand and track turns, HP, conditions.</p>
        )}
      </PanelShell>

      <PanelShell title="Session Music" icon={Music} open={musicOpen} onToggle={() => setMusicOpen(!musicOpen)}>
        <MusicPlayer
          playlistUrl={(get('__sessionPlaylist', '') as string)}
          onChangePlaylist={(next) => {
            setVal('__sessionPlaylist', next);
            setVal('__sessionPlaylistIndex', 0);
          }}
          isPlayingProp={!!get('__sessionPlaylistPlaying', false)}
          onChangePlaying={(next) => setVal('__sessionPlaylistPlaying', next)}
          playlists={(get('__sessionPlaylists', []) as Array<{ id: string; name: string; url: string }>)}
          onChangePlaylists={(next) => setVal('__sessionPlaylists', next)}
          playlistIndexProp={(get('__sessionPlaylistIndex', 0) as number)}
          onChangePlaylistIndex={(next) => setVal('__sessionPlaylistIndex', next)}
        />
      </PanelShell>

      <PanelShell title="Quick Dice" icon={Dice5} open={true} onToggle={() => {}}>
        <QuickDice />
      </PanelShell>

      <PanelShell title="Quick Inspire" icon={Sparkles} open={true} onToggle={() => {}}>
        <QuickInspire campaignContext={campaignContext} />
      </PanelShell>
    </>
  );

  return (
    <main className="min-h-screen p-3 pb-32 sm:p-5 md:p-6">
      <div className="mx-auto max-w-7xl space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onExitWithoutEnding}
              className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
              title="Hide run mode without ending the session"
            >
              <ArrowLeft size={12} /> Hide
            </button>
            <button
              onClick={onOpenLibrary}
              className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
              title="Open Library without ending the session"
            >
              <BookOpen size={12} /> Library
            </button>
            <h1 className="flex items-center gap-2 font-display text-lg tracking-wide text-ink sm:text-xl">
              <Swords size={18} className="text-crimson" /> Run Session
            </h1>
            <span className="font-serif text-xs italic text-ink-mute">
              Started {new Date(get('__sessionStartedAt', Date.now()) as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {playerConfig?.shareToken && (
              <div className="flex items-center gap-1.5 rounded-full border border-rule/50 bg-parchment px-2.5 py-0.5 text-[10px] font-display uppercase tracking-wider shadow-sm select-none">
                {publishState === 'publishing' ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brass opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-brass-deep"></span>
                    </span>
                    <span className="text-brass-deep font-semibold">Syncing...</span>
                  </>
                ) : publishState === 'error' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-crimson"></span>
                    <span className="text-crimson font-semibold">Sync Error</span>
                  </>
                ) : publishState === 'done' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-moss"></span>
                    <span className="text-moss font-semibold">Synced</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-moss opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-moss"></span>
                    </span>
                    <span className="text-moss font-semibold">Live Sharing</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onEndSession}
            className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
          >
            <Flag size={12} /> End Session
          </button>
        </header>

        <div className="sticky top-0 z-20 flex overflow-x-auto bg-parchment/90 backdrop-blur border-b border-rule py-2 gap-2 hide-scrollbar -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
          {SECTION_KEYS.map(k => {
            const Icon = SECTION_META[k].icon;
            return (
              <button
                key={k}
                onClick={() => {
                  setSection(s => ({ ...s, [k]: true }));
                  setTimeout(() => {
                    document.getElementById(`section-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 0);
                }}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rule bg-parchment px-3 py-1 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep hover:text-ink"
              >
                <Icon size={10} className="text-brass-deep" />
                {SECTION_META[k].label}
              </button>
            );
          })}
        </div>

        {strongStart && (() => {
          const isShared = playerLog.some(e => e.text.includes(strongStart));
          return (
            <section className="rounded border-2 border-crimson/50 bg-crimson/5 p-3 shadow-card sm:p-4">
              <div className="mb-1.5 flex items-start gap-2">
                <Zap size={16} className="mt-0.5 flex-shrink-0 text-crimson" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-display text-sm uppercase tracking-wide text-crimson sm:text-base">
                      Strong Start
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (isShared) return;
                          shareToPlayerLog(`Story Intro: ${strongStart}`);
                        }}
                        disabled={isShared}
                        className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                          isShared
                            ? 'border-moss bg-moss/10 text-moss cursor-default'
                            : 'border-brass-deep/60 text-brass-deep hover:bg-brass/10'
                        }`}
                        title={isShared ? 'Shared with Players' : 'Share with Players'}
                      >
                        <Eye size={10} />
                        {isShared ? 'Shared' : 'Share'}
                      </button>
                      <button
                        onClick={() => {
                          const next = !strongStartDone;
                          setVal('__sessionStrongStartDelivered', next);
                          if (next) {
                            pushEvent(makeEvent('other', 'Strong start delivered'));
                          } else {
                            const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
                            setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'other' && e.summary === 'Strong start delivered')));
                          }
                        }}
                        className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
                          strongStartDone
                            ? 'border-brass-deep bg-brass text-parchment'
                            : 'border-brass-deep/60 text-brass-deep hover:bg-brass/10'
                        }`}
                      >
                        {strongStartDone && <Check size={10} strokeWidth={3} />}
                        {strongStartDone ? 'Delivered' : 'Mark Delivered'}
                      </button>
                    </div>
                  </div>
                  <p className={`mt-1 whitespace-pre-wrap font-serif text-sm text-ink-soft sm:text-base ${strongStartDone ? 'italic opacity-60' : ''}`}>
                    {strongStart}
                  </p>
                </div>
              </div>
            </section>
          );
        })()}

        <StageBar
          pinned={pinned}
          scenes={scenes}
          npcs={npcs}
          locations={locations}
          monsters={monstersList}
          items={normalizedItems.map(it => it.name)}
          homebrewMonsters={homebrewMonsters}
          sceneDescriptions={sceneDescriptions}
          onUnpin={togglePin}
          onOpenStatBlock={(slug) => setStatBlockSlug(slug)}
        />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            <SectionShell id="section-scenes" title={SECTION_META.scenes.label} icon={SECTION_META.scenes.icon} open={section.scenes} onToggle={() => toggleSection('scenes')} count={scenes.length}>
              {scenes.length === 0 ? <Empty>No scenes prepped.</Empty> : (
                <ul className="space-y-1">
                  {scenes.map((s, i) => {
                    const desc = sceneDescriptions[s] || '';
                    const isShared = desc && playerLog.some(entry => entry.text.includes(desc));
                    return (
                      <SceneRow
                        key={i}
                        text={s}
                        used={usedScenes.includes(s)}
                        pinned={isPinned('scene', s)}
                        description={desc}
                        onToggleUsed={() => toggleSceneUsed(s)}
                        onTogglePin={() => togglePin('scene', s)}
                        onDescribed={(desc) => setSceneDescription(s, desc)}
                        onClearDescription={() => clearSceneDescription(s)}
                        campaignContext={campaignContext}
                        shared={!!isShared}
                        onShare={() => shareToPlayerLog(`Scene: ${s}\n\n${desc}`)}
                      />
                    );
                  })}
                </ul>
              )}
            </SectionShell>

            <SectionShell id="section-secrets" title={SECTION_META.secrets.label} icon={SECTION_META.secrets.icon} open={section.secrets} onToggle={() => toggleSection('secrets')} count={secrets.length}>
              {secrets.length === 0 ? <Empty>No secrets prepped.</Empty> : (
                <ul className="space-y-1">
                  {secrets.map((s, i) => {
                    const revealed = !!revSec[i];
                    const isShared = playerLog.some(entry => entry.text.includes(s));
                    return (
                      <li key={i} className={`flex items-start gap-2 rounded border px-2 py-1.5 ${revealed ? 'border-brass/60 bg-brass/10' : 'border-rule bg-parchment'}`}>
                        <button
                          onClick={() => setRevSec(i, !revealed, s)}
                          className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm border ${revealed ? 'border-brass-deep bg-brass text-parchment' : 'border-ink-mute bg-parchment hover:border-brass-deep'}`}
                          title={revealed ? 'Unmark revealed' : 'Mark revealed'}
                        >
                          {revealed && <Check size={10} strokeWidth={3} />}
                        </button>
                        <button
                          onClick={() => {
                            if (isShared) return;
                            shareToPlayerLog(`Clue: ${s}`);
                          }}
                          disabled={isShared}
                          className={`mt-0.5 p-0.5 transition-colors ${isShared ? 'text-moss cursor-default' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10 rounded'}`}
                          title={isShared ? 'Shared with Players' : 'Share with Players'}
                        >
                          <Eye size={12} />
                        </button>
                        <span className={`font-serif text-sm ${revealed ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>{s}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionShell>

            <SectionShell id="section-npcs" title={SECTION_META.npcs.label} icon={SECTION_META.npcs.icon} open={section.npcs} onToggle={() => toggleSection('npcs')} count={npcs.length}>
              {npcs.length === 0 ? <Empty>No NPCs prepped.</Empty> : (
                <ul className="space-y-1.5">
                  {npcs.map((n: any, i: number) => {
                    const key = n.name || `__npc_${i}`;
                    const isShared = playerConfig.entityVisibility?.npcs?.[n.id]?.mode === 'party';
                    return (
                      <NPCRow
                        key={i}
                        npc={n}
                        pinned={isPinned('npc', key)}
                        onTogglePin={() => togglePin('npc', key)}
                        shared={isShared}
                        onToggleShare={() => toggleEntityShare('npcs', n.id)}
                      />
                    );
                  })}
                </ul>
              )}
            </SectionShell>

            <SectionShell id="section-locations" title={SECTION_META.locations.label} icon={SECTION_META.locations.icon} open={section.locations} onToggle={() => toggleSection('locations')} count={locations.length}>
              {locations.length === 0 ? <Empty>No locations prepped.</Empty> : (
                <ul className="space-y-1">
                  {locations.map((l: any, i: number) => {
                    const key = l.name || `__loc_${i}`;
                    const pin = isPinned('location', key);
                    const isShared = playerConfig.entityVisibility?.locations?.[l.id]?.mode === 'party';
                    return (
                      <li key={i} className="flex items-start gap-2 rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm">
                        <PinToggle pinned={pin} onClick={() => togglePin('location', key)} />
                        <button
                          onClick={() => toggleEntityShare('locations', l.id)}
                          className={`mt-0.5 p-1 transition-colors ${isShared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10'}`}
                          title={isShared ? 'Shared with Players (Click to hide)' : 'Share with Players'}
                        >
                          {isShared ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-ink">{l.name || `Location ${i + 1}`}</div>
                          {l.type && <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{l.type}</div>}
                          {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
                            <ul className="ml-3 mt-0.5 list-disc text-[11px] italic text-ink-soft">
                              {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionShell>

            <SectionShell id="section-monsters" title={SECTION_META.monsters.label} icon={SECTION_META.monsters.icon} open={section.monsters} onToggle={() => toggleSection('monsters')} count={monstersList.length}>
              {monstersList.length === 0 ? <Empty>No monsters prepped.</Empty> : (
                <ul className="space-y-1">
                  {monstersList.map((m, i) => {
                    const hb = homebrewMonsters.find(h => h.name === m);
                    const key = hb ? hb.slug : m;
                    const isShared = playerLog.some(entry => entry.text.includes(`Encountered: ${m}`));
                    return (
                      <li key={i} className="flex items-center gap-2 rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink-soft">
                        <PinToggle pinned={isPinned('monster', key)} onClick={() => togglePin('monster', key)} />
                        <button
                          onClick={() => {
                            if (isShared) return;
                            shareToPlayerLog(`Encountered: ${m}${hb?.challenge_rating ? ` — CR ${hb.challenge_rating}` : ''}`);
                          }}
                          disabled={isShared}
                          className={`p-1 transition-colors ${isShared ? 'text-moss cursor-default' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10 rounded'}`}
                          title={isShared ? 'Shared with Players' : 'Share with Players'}
                        >
                          <Eye size={12} />
                        </button>
                        <span className="flex-1 truncate">{m}</span>
                        {hb && (
                          <button
                            onClick={() => setStatBlockSlug(hb.slug)}
                            className="font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson underline decoration-dotted underline-offset-2"
                            title="Open stat block"
                          >
                            Stat
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionShell>

            <SectionShell id="section-magicItems" title={SECTION_META.magicItems.label} icon={SECTION_META.magicItems.icon} open={section.magicItems} onToggle={() => toggleSection('magicItems')} count={magicItemsList.length}>
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
                        className={`p-3 rounded-lg border font-serif text-sm transition-all duration-150 flex gap-2 items-start ${
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
                            <div className={`font-semibold text-ink ${isGiven ? 'text-ink-mute' : ''}`}>
                              {item.name || 'Unnamed Item'}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  if (isShared) return;
                                  shareToPlayerLog(`Found Item: ${item.name}${item.description ? ` — ${item.description}` : ''}`);
                                }}
                                disabled={isShared}
                                className={`p-1 transition-colors ${isShared ? 'text-moss cursor-default' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10 rounded'}`}
                                title={isShared ? 'Shared with Party Feed' : 'Share with Party Feed'}
                              >
                                <Eye size={12} />
                              </button>
                              <PinToggle pinned={isPinned('item', item.name)} onClick={() => togglePin('item', item.name)} />
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-xs text-ink-soft italic whitespace-pre-wrap">
                              {item.description}
                            </p>
                          )}

                          {/* GM Controls inside Full-Screen Run panel */}
                          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 items-center text-[11px] border-t border-rule/30 pt-2 font-sans">
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
                                className="rounded border border-rule bg-parchment px-1.5 py-0.5 text-ink-soft cursor-pointer focus:outline-none"
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
                                  className="rounded border border-rule bg-parchment px-1.5 py-0.5 text-ink-soft cursor-pointer focus:outline-none"
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

            <SectionShell id="section-goals" title={SECTION_META.goals.label} icon={SECTION_META.goals.icon} open={section.goals} onToggle={() => toggleSection('goals')} count={pcGoals.length}>
              {pcGoals.length === 0 ? <Empty>No PC goals prepped.</Empty> : (
                <ul className="space-y-1.5">
                  {pcGoals.map((g: any, i: number) => {
                    const isShared = g.text && playerLog.some(entry => entry.text.includes(g.text));
                    return (
                      <li key={i} className="rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-ink-soft">{g.text || `Goal ${i + 1}`}</div>
                          <button
                            onClick={() => {
                              if (isShared) return;
                              shareToPlayerLog(`Quest Update: "${g.text}" is currently ${g.status || 'Active'}.`);
                            }}
                            disabled={isShared}
                            className={`p-1 transition-colors ${isShared ? 'text-moss cursor-default' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10 rounded'}`}
                            title={isShared ? 'Shared with Players' : 'Share with Players'}
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                          <button
                            key={s}
                            onClick={() => updateGoalStatus(i, s)}
                            className={`rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${g.status === s ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-mute hover:bg-parchment-deep'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                  })}
                </ul>
              )}
            </SectionShell>

            <SectionShell id="section-clocks" title={SECTION_META.clocks.label} icon={SECTION_META.clocks.icon} open={section.clocks} onToggle={() => toggleSection('clocks')} count={clocks.length}>
              {clocks.length === 0 ? <Empty>No clocks prepped.</Empty> : (
                <ul className="space-y-1.5">
                  {clocks.map((c: any, i: number) => {
                    const max = c.max || 6;
                    const filled = c.filled || 0;
                    const isShared = playerConfig.entityVisibility?.clocks?.[c.id]?.mode === 'party';
                    return (
                      <li key={i} className="space-y-1 rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink">{c.text || `Clock ${i + 1}`}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => toggleEntityShare('clocks', c.id)}
                              className={`p-1 transition-colors ${isShared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10'}`}
                              title={isShared ? 'Shared with Players (Click to hide)' : 'Share with Players'}
                            >
                              {isShared ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <span className="font-display text-[11px] text-brass-deep">{filled}/{max}</span>
                          </div>
                        </div>
                        {c.faction && <div className="text-[10px] italic text-ink-mute">{c.faction}</div>}
                        <div className="flex gap-0.5">
                          {Array.from({ length: max }).map((_, j) => (
                            <button
                              key={j}
                              onClick={() => tickClock(i, j + 1 === filled ? -filled : (j + 1) - filled)}
                              className={`h-3 flex-1 rounded-sm transition-colors ${j < filled ? 'bg-crimson' : 'bg-parchment-deep hover:bg-parchment-deep/70'}`}
                            />
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => tickClock(i, -1)} className="rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep">−1</button>
                          <button onClick={() => tickClock(i, 1)} className="rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep">+1</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionShell>

            {factions.length > 0 && (
              <SectionShell title="Faction Renown" icon={Users} open={true} onToggle={() => {}} count={factions.length}>
                <ul className="space-y-1.5">
                  {factions.map((f: any, i: number) => (
                    <li key={i} className="flex items-center gap-2 rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm">
                      <span className="flex-1 text-ink">{f.name || `Faction ${i + 1}`}</span>
                      <span className="font-display text-xs tabular-nums text-brass-deep">{typeof f.renown === 'number' ? f.renown : 0}</span>
                      <button onClick={() => adjustRenown(i, -1)} className="size-6 rounded border border-rule font-display text-[11px] text-ink-soft hover:bg-parchment-deep">−</button>
                      <button onClick={() => adjustRenown(i, 1)} className="size-6 rounded border border-rule font-display text-[11px] text-ink-soft hover:bg-parchment-deep">+</button>
                    </li>
                  ))}
                </ul>
              </SectionShell>
            )}
          </div>

          <div className="hidden lg:block space-y-3 pr-1 lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:self-start lg:overflow-y-auto">
            {toolsContent}
          </div>
        </div>

        <NoteSeed pushEvent={pushEvent} />
      </div>

      {/* Mobile Tools Drawer */}
      <div className={`lg:hidden fixed left-0 right-0 z-30 bg-parchment/95 backdrop-blur border-t border-rule shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-transform duration-300 flex flex-col ${mobileToolsExpanded ? 'bottom-[56px] translate-y-0' : 'bottom-[56px] translate-y-full'}`}>
        <button
          onClick={() => setMobileToolsExpanded(!mobileToolsExpanded)}
          className="absolute right-4 -top-8 bg-parchment border border-rule border-b-0 rounded-t px-3 py-1.5 text-brass-deep text-xs font-display uppercase tracking-wider flex items-center gap-1.5 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]"
        >
          <Wrench size={12} /> Tools {mobileToolsExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <div className="max-h-[45vh] overflow-y-auto p-3 space-y-3">
          {toolsContent}
        </div>
      </div>

      {statBlockMonster && (
        <MonsterStatBlock monster={statBlockMonster} onClose={() => setStatBlockSlug(null)} />
      )}

      {longSessionPrompt && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in duration-300">
          <div className="bg-parchment-soft border-2 border-brass-deep/60 px-4 py-3 rounded shadow-lg flex items-start gap-3 w-[90vw] max-w-sm">
            <Clock size={16} className="text-brass-deep mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-display text-xs uppercase tracking-wider text-brass-deep mb-1">Long Session</div>
              <p className="font-serif text-sm text-ink-soft mb-2">
                {sessionDurationHours > 12 
                  ? "You've been in Run Session mode for over 12 hours! You definitely forgot to end the session."
                  : "You've been in Run Session mode for over 4 hours. Did you forget to end the previous session?"}
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setLongSessionPrompt(false)} className="px-2 py-1 text-xs text-ink-mute hover:bg-parchment-deep rounded">Dismiss</button>
                <button onClick={() => { setLongSessionPrompt(false); onEndSession(); }} className="px-2 py-1 text-xs text-crimson hover:bg-crimson/10 border border-crimson/30 rounded font-display uppercase tracking-wider">End Session</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="bg-ink text-parchment px-4 py-2 rounded shadow-lg font-serif text-sm flex items-center gap-2">
            <Check size={14} className="text-emerald-400" />
            {toast}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-parchment shadow-page">
        <div className="mx-auto flex max-w-7xl items-start gap-2 p-2 sm:p-3">
          <NotebookPen size={14} className="mt-1.5 flex-shrink-0 text-brass-deep" />
          <textarea
            value={scratchpad}
            onChange={(e) => setScratchpad(e.target.value)}
            placeholder="Session scratchpad — what happened, threads, open questions. Seeds the log when you end the session."
            rows={2}
            className="flex-1 resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
        </div>
      </div>
    </main>
  );
}

export function SectionShell({
  title, icon: Icon, open, onToggle, count, children, id
}: {
  title: string; icon: any; open: boolean; onToggle: () => void; count?: number; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded border border-rule bg-parchment-soft shadow-card">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30">
        <Icon size={14} className="flex-shrink-0 text-brass-deep" />
        <span className="flex-1 font-display text-sm tracking-wide text-ink">{title}</span>
        {typeof count === 'number' && <span className="font-serif text-[11px] text-ink-mute">{count}</span>}
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="border-t border-rule px-3 pb-3 pt-1">{children}</div>}
    </section>
  );
}

export function PanelShell({
  title, icon: Icon, open, onToggle, children,
}: {
  title: string; icon: any; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30">
        <Icon size={14} className="flex-shrink-0 text-crimson" />
        <span className="flex-1 font-display text-sm tracking-wide text-ink">{title}</span>
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="border-t border-rule px-3 pb-3 pt-1">{children}</div>}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-xs italic text-ink-mute">{children}</p>;
}

function NPCRow({
  npc, pinned, onTogglePin, shared, onToggleShare,
}: {
  npc: any;
  pinned: boolean;
  onTogglePin: () => void;
  shared: boolean;
  onToggleShare: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded border border-rule bg-parchment font-serif text-sm">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(o => !o)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-parchment-deep/30">
          {open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />}
          <span className="flex-1 truncate text-ink">{npc.name || 'Unnamed NPC'}</span>
          {npc.type && <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">{npc.type}</span>}
        </button>
        <button
          onClick={onToggleShare}
          className={`p-1 transition-colors ${shared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10'}`}
          title={shared ? 'Shared with Players (Click to hide)' : 'Share with Players'}
        >
          {shared ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <div className="pr-2"><PinToggle pinned={pinned} onClick={onTogglePin} /></div>
      </div>
      {open && (
        <div className="space-y-0.5 border-t border-rule px-3 pb-2 pt-1 text-[12px] text-ink-soft">
          {npc.faction && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Faction · </span>{npc.faction}</div>}
          {npc.archetype && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Archetype · </span>{npc.archetype}</div>}
          {npc.goal && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Goal · </span>{npc.goal}</div>}
          {npc.method && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Method · </span>{npc.method}</div>}
          {npc.mannerism && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Mannerism · </span>{npc.mannerism}</div>}
          {npc.appearance && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Appearance · </span>{npc.appearance}</div>}
        </div>
      )}
    </li>
  );
}

function PinToggle({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  const Icon = pinned ? PinOff : Pin;
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 rounded p-1 transition-colors ${pinned ? 'text-crimson hover:bg-crimson/10' : 'text-ink-mute hover:text-brass-deep hover:bg-brass/10'}`}
      title={pinned ? 'Unpin from Stage' : 'Pin to Stage'}
    >
      <Icon size={12} />
    </button>
  );
}

function SceneRow({
  text, used, pinned, description, onToggleUsed, onTogglePin, onDescribed, onClearDescription, campaignContext, shared, onShare,
}: {
  text: string;
  used: boolean;
  pinned: boolean;
  description: string;
  onToggleUsed: () => void;
  onTogglePin: () => void;
  onDescribed: (d: string) => void;
  onClearDescription: () => void;
  campaignContext?: CampaignContext;
  shared: boolean;
  onShare: () => void;
}) {
  const { isPro } = useAuth();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const runDescribe = async () => {
    if (!isPro || loading) return;
    setErr('');
    setLoading(true);
    try {
      const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await describeScene(text, idToken, campaignContext);
      onDescribed(res.description);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Description failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className={`rounded border ${used ? 'border-brass/60 bg-brass/10' : 'border-rule bg-parchment'}`}>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <button
          onClick={onToggleUsed}
          className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm border ${used ? 'border-brass-deep bg-brass text-parchment' : 'border-ink-mute bg-parchment'}`}
          title={used ? 'Unmark used' : 'Mark used this session'}
        >
          {used && <Check size={10} strokeWidth={3} />}
        </button>
        <span className={`flex-1 font-serif text-sm ${used ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>{text}</span>
        {isPro ? (
          <button
            onClick={runDescribe}
            disabled={loading}
            className="flex flex-shrink-0 items-center gap-1 rounded border border-brass-deep/50 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment disabled:opacity-50"
            title="Generate a short read-aloud description"
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
            {loading ? 'Describing…' : 'Describe'}
          </button>
        ) : (
          <LockedInline label="Describe" />
        )}
        <PinToggle pinned={pinned} onClick={onTogglePin} />
      </div>
      {err && <p className="px-2 pb-1 text-[10px] italic text-crimson">{err}</p>}
      {description && (
        <div className="border-t border-rule/60 bg-parchment-soft px-2 py-1.5">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Read-aloud</span>
            <div className="flex gap-2">
              <button
                onClick={onShare}
                disabled={shared}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider transition-colors ${
                  shared
                    ? 'bg-moss/10 text-moss cursor-default font-semibold'
                    : 'bg-brass/20 text-brass-deep hover:bg-brass hover:text-parchment font-semibold'
                }`}
                title={shared ? 'Shared with Players' : 'Share with Players'}
              >
                <Eye size={10} />
                {shared ? 'Shared' : 'Share'}
              </button>
              <button
                onClick={onClearDescription}
                className="text-ink-mute hover:text-crimson"
                title="Clear description"
              >
                <X size={10} />
              </button>
            </div>
          </div>
          <p className="whitespace-pre-wrap font-serif text-[12px] italic text-ink-soft">{description}</p>
        </div>
      )}
    </li>
  );
}

function StageBar({
  pinned, scenes, npcs, locations, monsters, items, homebrewMonsters, sceneDescriptions, onUnpin, onOpenStatBlock,
}: {
  pinned: PinRef[];
  scenes: string[];
  npcs: any[];
  locations: any[];
  monsters: string[];
  items: string[];
  homebrewMonsters: HomebrewMonster[];
  sceneDescriptions: Record<string, string>;
  onUnpin: (kind: PinKind, key: string) => void;
  onOpenStatBlock: (slug: string) => void;
}) {
  if (pinned.length === 0) return null;

  const KIND_ICON: Record<PinKind, any> = {
    scene: NotebookPen,
    npc: Users,
    location: Map,
    monster: Skull,
    item: Gem,
  };

  const renderContent = (p: PinRef): React.ReactNode => {
    if (p.kind === 'scene') {
      const desc = sceneDescriptions[p.key] || '';
      return (
        <>
          <p className="font-serif text-sm text-ink">{p.key}</p>
          {desc && (
            <p className="mt-1 whitespace-pre-wrap font-serif text-[12px] italic text-ink-soft">{desc}</p>
          )}
        </>
      );
    }
    if (p.kind === 'npc') {
      const n = npcs.find((x: any) => (x.name || '') === p.key);
      if (!n) return <p className="font-serif text-sm text-ink-mute italic">{p.key} (removed)</p>;
      return (
        <>
          <p className="font-serif text-sm text-ink">{n.name || 'Unnamed NPC'}</p>
          <div className="mt-0.5 space-y-0.5 text-[11px] text-ink-soft">
            {n.faction && <div><span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Faction · </span>{n.faction}</div>}
            {n.goal && <div><span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Goal · </span>{n.goal}</div>}
            {n.mannerism && <div><span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Mannerism · </span>{n.mannerism}</div>}
          </div>
        </>
      );
    }
    if (p.kind === 'location') {
      const l = locations.find((x: any) => (x.name || '') === p.key);
      if (!l) return <p className="font-serif text-sm text-ink-mute italic">{p.key} (removed)</p>;
      return (
        <>
          <p className="font-serif text-sm text-ink">{l.name || 'Location'}</p>
          {l.type && <p className="font-display text-[9px] uppercase tracking-wider text-brass-deep">{l.type}</p>}
          {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
            <ul className="ml-3 mt-0.5 list-disc text-[11px] italic text-ink-soft">
              {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
            </ul>
          )}
        </>
      );
    }
    if (p.kind === 'monster') {
      const hb = homebrewMonsters.find(h => h.slug === p.key);
      const name = hb?.name || monsters.find(m => m === p.key) || p.key;
      return (
        <>
          <p className="font-serif text-sm text-ink">{name}</p>
          {hb && (
            <button
              onClick={() => onOpenStatBlock(hb.slug)}
              className="mt-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson underline decoration-dotted underline-offset-2"
            >
              Open stat block
            </button>
          )}
        </>
      );
    }
    return <p className="font-serif text-sm text-ink">{p.key}</p>;
  };

  return (
    <div className="rounded border-2 border-brass-deep/50 bg-brass/5 p-2 shadow-card">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
          <Pin size={10} /> Stage · pinned for quick reference
        </span>
        <span className="font-serif text-[10px] italic text-ink-mute">{pinned.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pinned.map((p) => {
          const Icon = KIND_ICON[p.kind];
          return (
            <div key={`${p.kind}:${p.key}`} className="relative rounded border border-rule bg-parchment p-2 pr-7 shadow-sm">
              <div className="mb-0.5 flex items-center gap-1 font-display text-[9px] uppercase tracking-wider text-brass-deep">
                <Icon size={10} /> {p.kind}
              </div>
              {renderContent(p)}
              <button
                onClick={() => onUnpin(p.kind, p.key)}
                className="absolute right-1 top-1 rounded p-1 text-ink-mute hover:bg-crimson/10 hover:text-crimson"
                title="Unpin"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type DiceRoll = { id: string; expr: string; result: number; breakdown: string; ts: number };

function rollDice(expr: string): { result: number; breakdown: string } | null {
  const cleaned = expr.replace(/\s+/g, '').toLowerCase();
  const match = cleaned.match(/^(\d*)d(\d+)([+\-]\d+)?$/);
  if (!match) return null;
  const count = Math.max(1, Math.min(99, parseInt(match[1] || '1', 10)));
  const sides = Math.max(2, parseInt(match[2], 10));
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
  const sum = rolls.reduce((a, b) => a + b, 0);
  const breakdown = `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ''} = [${rolls.join(', ')}]${mod ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}`;
  return { result: sum + mod, breakdown };
}

export function QuickDice() {
  const [history, setHistory] = useState<DiceRoll[]>([]);
  const [formula, setFormula] = useState('2d6+3');

  const doRoll = (expr: string) => {
    const r = rollDice(expr);
    if (!r) return;
    setHistory(h => [{ id: `r${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, expr, ...r, ts: Date.now() }, ...h].slice(0, 10));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {[4, 6, 8, 10, 12, 20, 100].map(s => (
          <button
            key={s}
            onClick={() => doRoll(`1d${s}`)}
            className="rounded border border-brass-deep/60 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
          >
            d{s}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doRoll(formula); }}
          placeholder="2d6+3"
          className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
        />
        <button
          onClick={() => doRoll(formula)}
          className="rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
        >
          Roll
        </button>
      </div>
      {history.length > 0 && (
        <ul className="max-h-32 space-y-0.5 overflow-y-auto">
          {history.map(r => (
            <li key={r.id} className="flex items-baseline gap-2 font-serif text-[11px] text-ink-soft">
              <span className="w-6 text-right font-display tabular-nums text-brass-deep">{r.result}</span>
              <span className="truncate text-ink-mute">{r.breakdown}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type InspireResult = { id: string; tableId: string; tableTitle: string; entry: string; ts: number };

const SEGUE_ENTRIES: { id: string; type: PlotSegueType; title: string }[] = [
  { id: 'segue:bridge',       type: 'bridge',       title: 'Plot Segue: Bridge' },
  { id: 'segue:complication', type: 'complication', title: 'Plot Segue: Complication' },
  { id: 'segue:cliffhanger',  type: 'cliffhanger',  title: 'Plot Segue: Cliffhanger' },
];

export function QuickInspire({ campaignContext }: { campaignContext?: CampaignContext }) {
  const { isPro } = useAuth();
  const [tableId, setTableId] = useState<string>('villainSchemes');
  const [history, setHistory] = useState<InspireResult[]>([]);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState('');
  const [aiBased, setAiBased] = useState(false);

  const tableEntries = useMemo(() => {
    return Object.values(TABLES).map(t => ({ id: t.id, title: t.title })).sort((a, b) => a.title.localeCompare(b.title));
  }, []);

  const isSegue = tableId.startsWith('segue:');
  const segueEntry = isSegue ? SEGUE_ENTRIES.find(s => s.id === tableId) : null;

  const pushHistory = (id: string, title: string, entry: string) => {
    setHistory(h => [{
      id: `i${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      tableId: id, tableTitle: title, entry, ts: Date.now(),
    }, ...h].slice(0, 5));
  };

  const doRoll = async () => {
    setError('');
    if (segueEntry) {
      if (!isPro) return;
      setRolling(true);
      try {
        const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
        if (!user) throw new Error('Not signed in');
        const idToken = await user.getIdToken();
        const result = await generatePlotSegues(
          { segueType: segueEntry.type, count: 1, tone: 'escalating', currentScene: '' },
          idToken,
          campaignContext,
        );
        const s = result.segues[0];
        if (s) pushHistory(segueEntry.id, segueEntry.title, `${s.title} — ${s.readAloud}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Roll failed');
      } finally {
        setRolling(false);
      }
      return;
    }
    const t = TABLES[tableId];
    if (aiBased) {
      if (!isPro) return;
      setRolling(true);
      try {
        const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
        if (!user) throw new Error('Not signed in');
        const idToken = await user.getIdToken();
        const result = await generateQuickInspire(t.title, idToken, campaignContext);
        if (result && result.entry) pushHistory(tableId, t.title, result.entry);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Roll failed');
      } finally {
        setRolling(false);
      }
      return;
    }
    const entry = rollTable(tableId);
    if (!entry) return;
    pushHistory(tableId, t.title, entry);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <select
          value={tableId}
          onChange={(e) => { setTableId(e.target.value); setError(''); }}
          className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
        >
          <optgroup label="AI (Pro)">
            {SEGUE_ENTRIES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </optgroup>
          <optgroup label="Curated tables">
            {tableEntries.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </optgroup>
        </select>
        {((isSegue || aiBased) && !isPro) ? (
          <LockedInline label="Roll (Pro)" />
        ) : (
          <button
            onClick={doRoll}
            disabled={rolling}
            className="rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:opacity-50"
          >
            {rolling ? 'Rolling…' : 'Roll'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input 
          type="checkbox" 
          id="aiBasedQuickInspire" 
          checked={aiBased} 
          onChange={(e) => setAiBased(e.target.checked)} 
          className="cursor-pointer rounded border-rule text-crimson focus:ring-crimson"
        />
        <label htmlFor="aiBasedQuickInspire" className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-ink-soft">
          Make all rolls AI based {aiBased && !isPro && <LockedInline label="(Pro)" />}
        </label>
      </div>
      {error && <p className="text-[10px] italic text-crimson" title={error}>{error}</p>}
      {history.length === 0 ? (
        <p className="font-serif text-[11px] italic text-ink-mute">No rolls yet.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {history.map(r => (
            <li key={r.id} className="border-l-2 border-brass/40 pl-2 font-serif text-[11px] text-ink-soft">
              <div className="font-display text-[9px] uppercase tracking-wider text-brass-deep">{r.tableTitle}</div>
              {r.entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteSeed({ pushEvent }: { pushEvent: (e: ChangeEvent) => void }) {
  const [text, setText] = useState('');
  return (
    <details className="rounded border border-rule bg-parchment-soft shadow-card">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-display text-sm tracking-wide text-ink hover:bg-parchment-deep/30">
        <Plus size={12} className="text-brass-deep" /> Add Session Note
      </summary>
      <div className="space-y-1.5 border-t border-rule px-3 pb-3 pt-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A moment to remember…"
          className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
        />
        <button
          disabled={!text.trim()}
          onClick={() => { pushEvent(makeEvent('other', text.trim())); setText(''); }}
          className="rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark as Session Note
        </button>
      </div>
    </details>
  );
}

function parseYoutubeUrl(urlOrId: string): { playlistId: string | null; videoId: string | null } {
  const trimmed = urlOrId.trim();
  if (!trimmed) return { playlistId: null, videoId: null };

  if (/^PL[a-zA-Z0-9_-]{16,38}$/.test(trimmed) || /^[a-zA-Z0-9_-]{18,40}$/.test(trimmed)) {
    if (trimmed.startsWith('PL')) {
      return { playlistId: trimmed, videoId: null };
    }
    if (trimmed.length === 11) {
      return { playlistId: null, videoId: trimmed };
    }
  }

  let playlistId: string | null = null;
  let videoId: string | null = null;

  try {
    const url = new URL(trimmed);
    playlistId = url.searchParams.get('list');
    
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else if (url.pathname.startsWith('/embed/')) {
      const parts = url.pathname.split('/');
      if (parts[2] && parts[2] !== 'videoseries') {
        videoId = parts[2];
      }
    } else {
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'youtu.be') {
        videoId = url.pathname.slice(1);
      }
    }
  } catch (e) {
    const listMatch = trimmed.match(/[&?]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) playlistId = listMatch[1];

    const vMatch = trimmed.match(/[&?]v=([a-zA-Z0-9_-]+)/);
    if (vMatch) videoId = vMatch[1];
    
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) videoId = shortMatch[1];
  }

  return { playlistId, videoId };
}

const DEFAULT_SCENARIOS = [
  { id: 'tavern', name: '🍻 Tavern Ambiance', url: 'https://www.youtube.com/playlist?list=PL2V6X2N_s14E9F7-M6WcI_qJ202w9420v' },
  { id: 'combat', name: '⚔ Epic Combat', url: 'https://www.youtube.com/playlist?list=PL6T1g8k3J46yEPLfA1w_1uT8F52093h41' },
  { id: 'dungeon', name: '🧭 Dark Dungeon', url: 'https://www.youtube.com/playlist?list=PL6T1g8k3J46zZf94pD59j3U6h3s12L1H1' },
  { id: 'creepy', name: '💀 Eerie Suspense', url: 'https://www.youtube.com/playlist?list=PL6T1g8k3J46yE258c7tZ1A2rO02W1H1H1' },
];

export function MusicPlayer({
  playlistUrl,
  onChangePlaylist,
  readOnly = false,
  isPlayingProp,
  onChangePlaying,
  playlists,
  onChangePlaylists,
  playlistIndexProp,
  onChangePlaylistIndex,
}: {
  playlistUrl: string;
  onChangePlaylist?: (v: string) => void;
  readOnly?: boolean;
  isPlayingProp?: boolean;
  onChangePlaying?: (v: boolean) => void;
  playlists?: Array<{ id: string; name: string; url: string }>;
  onChangePlaylists?: (v: Array<{ id: string; name: string; url: string }>) => void;
  playlistIndexProp?: number;
  onChangePlaylistIndex?: (index: number) => void;
}) {
  const [inputUrl, setInputUrl] = useState(playlistUrl);
  const [error, setError] = useState('');

  // Player state variables for readOnly mode
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playerState, setPlayerState] = useState<'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'unknown'>('unknown');
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);

  // Playlists scenario management
  const activePlaylists = playlists && playlists.length > 0 ? playlists : DEFAULT_SCENARIOS;
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioUrl, setNewScenarioUrl] = useState('');

  const handleSavePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim() || !newScenarioUrl.trim()) return;
    const nextPlaylists = [
      ...activePlaylists,
      {
        id: `pl_${Date.now()}`,
        name: newScenarioName.trim(),
        url: newScenarioUrl.trim(),
      },
    ];
    if (onChangePlaylists) {
      onChangePlaylists(nextPlaylists);
    }
    setNewScenarioName('');
    setNewScenarioUrl('');
    setShowAddForm(false);
  };

  const handleDeletePlaylist = (id: string) => {
    const nextPlaylists = activePlaylists.filter((pl) => pl.id !== id);
    if (onChangePlaylists) {
      onChangePlaylists(nextPlaylists);
    }
  };

  useEffect(() => {
    setInputUrl(playlistUrl);
  }, [playlistUrl]);

  // Synchronize local isPlaying state with isPlayingProp
  useEffect(() => {
    if (isPlayingProp !== undefined) {
      setIsPlaying(isPlayingProp);
    }
  }, [isPlayingProp]);

  // Command underlying YT Player when isPlayingProp changes
  useEffect(() => {
    if (!ytPlayer || !isApiReady) return;
    try {
      // @ts-ignore
      const states = window.YT.PlayerState;
      const currentPlayerState = ytPlayer.getPlayerState();
      if (isPlayingProp && currentPlayerState !== states.PLAYING) {
        ytPlayer.playVideo();
      } else if (!isPlayingProp && currentPlayerState === states.PLAYING) {
        ytPlayer.pauseVideo();
      }
    } catch (e) {
      console.warn('Failed to sync YT player with prop state', e);
    }
  }, [isPlayingProp, ytPlayer, isApiReady]);

  // Command underlying YT Player when playlistIndexProp changes
  useEffect(() => {
    if (!ytPlayer || !isApiReady) return;
    try {
      const currentIndex = ytPlayer.getPlaylistIndex();
      if (typeof playlistIndexProp === 'number' && playlistIndexProp !== currentIndex && playlistIndexProp >= 0) {
        ytPlayer.playVideoAt(playlistIndexProp);
      }
    } catch (e) {
      console.warn('Failed to sync YT player playlist index with prop state', e);
    }
  }, [playlistIndexProp, ytPlayer, isApiReady]);

  const { playlistId, videoId } = parseYoutubeUrl(playlistUrl);

  const iframeId = `yt-audio-player-iframe`;

  // Dynamic YT Iframe Player API Loader & Binder
  useEffect(() => {
    if (!playlistId && !videoId) return;

    let player: any = null;
    let timer: NodeJS.Timeout;

    const initPlayer = () => {
      const iframeElement = document.getElementById(iframeId);
      if (!iframeElement) return;

      try {
        // @ts-ignore
        player = new window.YT.Player(iframeId, {
          events: {
            onReady: () => {
              setYtPlayer(player);
              setIsApiReady(true);
              try {
                setVolume(player.getVolume() || 100);
                setIsMuted(player.isMuted() || false);
              } catch (err) {
                console.warn('Could not read initial player settings', err);
              }
            },
            onStateChange: (event: any) => {
              // @ts-ignore
              const states = window.YT.PlayerState;
              if (event.data === states.PLAYING) {
                setPlayerState('playing');
                setIsPlaying(true);
                onChangePlaying?.(true);
                try {
                  const idx = event.target.getPlaylistIndex();
                  if (typeof idx === 'number' && idx >= 0) {
                    onChangePlaylistIndex?.(idx);
                  }
                } catch (err) {
                  console.warn('Could not read playlist index on state change', err);
                }
              } else if (event.data === states.PAUSED) {
                setPlayerState('paused');
                setIsPlaying(false);
                onChangePlaying?.(false);
              } else if (event.data === states.BUFFERING) {
                setPlayerState('buffering');
              } else if (event.data === states.ENDED) {
                setPlayerState('ended');
                setIsPlaying(false);
                onChangePlaying?.(false);
              } else if (event.data === states.UNSTARTED) {
                setPlayerState('unstarted');
              }
            },
          },
        });
      } catch (e) {
        console.error('Failed to instantiate YT Player', e);
      }
    };

    // Load API dynamically
    // @ts-ignore
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }

      // @ts-ignore
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      // API already loaded, wait for the DOM to render the iframe then initialize
      timer = setTimeout(() => {
        initPlayer();
      }, 500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (e) {
          console.warn('Error destroying player', e);
        }
      }
      setYtPlayer(null);
      setIsPlaying(false);
      setIsApiReady(false);
      setPlayerState('unknown');
    };
  }, [playlistId, videoId, readOnly]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !onChangePlaylist) return;
    setError('');
    const { playlistId: pId, videoId: vId } = parseYoutubeUrl(inputUrl);
    if (!pId && !vId) {
      setError('Invalid YouTube playlist or video URL. Please enter a valid link.');
      return;
    }
    onChangePlaylist(inputUrl);
  };

  const handleDisconnect = () => {
    if (readOnly || !onChangePlaylist) return;
    setInputUrl('');
    onChangePlaylist('');
    setError('');
  };

  // Playback Control Handlers
  const togglePlay = () => {
    if (!ytPlayer) return;
    if (isPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  };

  const toggleMute = () => {
    if (!ytPlayer) return;
    if (isMuted) {
      ytPlayer.unMute();
      setIsMuted(false);
    } else {
      ytPlayer.mute();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseInt(e.target.value, 10);
    setVolume(nextVolume);
    if (ytPlayer) {
      ytPlayer.setVolume(nextVolume);
      if (nextVolume > 0 && isMuted) {
        ytPlayer.unMute();
        setIsMuted(false);
      }
    }
  };

  const renderScenarios = () => {
    if (readOnly) return null;
    return (
      <div className="space-y-2 rounded-lg border border-rule/60 bg-parchment/40 p-3 shadow-inner">
        <div className="flex items-center justify-between">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep font-semibold">
            Scenario Playlists
          </span>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="text-[9px] px-2 py-0.5 rounded border border-brass-deep/45 bg-brass/10 hover:bg-brass text-brass-deep hover:text-parchment font-display uppercase tracking-wider transition-all"
          >
            + Add Scenario
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSavePlaylist} className="mt-2 space-y-2 border border-rule/50 bg-parchment p-2.5 rounded shadow-sm">
            <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep font-semibold">
              Add Custom Scenario
            </div>
            <div className="space-y-1">
              <input
                type="text"
                required
                placeholder="Scenario Name (e.g. Boss Battle)"
                value={newScenarioName}
                onChange={(e) => setNewScenarioName(e.target.value)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[11px] text-ink focus:border-crimson focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="YouTube Playlist or Video URL"
                value={newScenarioUrl}
                onChange={(e) => setNewScenarioUrl(e.target.value)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[11px] text-ink focus:border-crimson focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-[9px] px-2 py-0.5 rounded border border-rule hover:bg-parchment-deep font-display uppercase tracking-wider text-ink-soft transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-[9px] px-2 py-0.5 rounded border border-crimson/50 bg-crimson/10 hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider text-crimson transition-all"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 gap-2">
          {activePlaylists.map((pl) => {
            const isActive = playlistUrl === pl.url;
            return (
              <div
                key={pl.id}
                className={`group relative flex items-center justify-between rounded border p-2 transition-all text-xs font-serif ${
                  isActive
                    ? 'border-crimson/50 bg-crimson/5 text-crimson font-medium shadow-sm'
                    : 'border-rule bg-parchment/65 hover:bg-parchment text-ink-soft'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (onChangePlaylist) onChangePlaylist(pl.url);
                  }}
                  className="flex-1 text-left truncate pr-5 font-serif"
                  title={pl.name}
                >
                  {pl.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePlaylist(pl.id)}
                  className="absolute right-1 text-ink-mute hover:text-crimson opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete scenario"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (readOnly) {
    if (!playlistId && !videoId) {
      return (
        <div className="flex flex-row items-center justify-between gap-4 bg-parchment-soft border border-rule/70 rounded-lg shadow-sm px-4 py-2.5 text-xs font-serif italic text-ink-mute">
          No session music is playing.
        </div>
      );
    }

    let embedUrl = '';
    if (playlistId) {
      if (videoId) {
        embedUrl = `https://www.youtube.com/embed/${videoId}?list=${playlistId}&enablejsapi=1`;
      } else {
        embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1`;
      }
    } else if (videoId) {
      embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    }

    return (
      <div className="flex flex-row items-center justify-between gap-4 bg-parchment-soft border border-rule/70 rounded-lg shadow-sm px-4 py-2.5 overflow-hidden text-xs">
        {/* Left Side: Status / Music Icon / Small Label */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center justify-center flex-shrink-0">
            <Music className={`${isPlaying ? 'text-crimson animate-pulse' : 'text-ink-mute'}`} size={16} />
            {isPlaying && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson"></span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-semibold tracking-wide text-ink text-xs uppercase">
              Live Music
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-rule/70" />
            <span className={`font-serif italic text-ink-soft text-xs truncate`}>
              {playerState === 'buffering' ? 'Buffering...' : isPlaying ? 'Playing' : 'Paused'}
            </span>
          </div>
        </div>

        {/* Right Side: Volume Controls */}
        <div className="flex items-center gap-2.5 w-32 sm:w-44 flex-shrink-0 justify-end">
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isApiReady}
            className="text-ink-mute hover:text-crimson transition-colors p-1 flex-shrink-0 focus:outline-none"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            disabled={!isApiReady}
            className="w-full accent-crimson h-1 bg-rule/50 rounded-lg appearance-none cursor-pointer disabled:opacity-50 focus:outline-none"
          />
        </div>

        {/* Bulletproof hidden off-screen iframe */}
        <div className="absolute overflow-hidden" style={{ width: '1px', height: '1px', opacity: 0.01, left: '-9999px', top: '-9999px' }}>
          <iframe
            id={iframeId}
            src={embedUrl}
            title="YouTube Music Player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="border-0 w-full h-full"
          />
        </div>
      </div>
    );
  }

  if (playlistId || videoId) {
    let embedUrl = '';
    if (playlistId) {
      if (videoId) {
        embedUrl = `https://www.youtube.com/embed/${videoId}?list=${playlistId}&enablejsapi=1`;
      } else {
        embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1`;
      }
    } else if (videoId) {
      embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    }

    let externalUrl = '';
    if (playlistUrl.startsWith('http')) {
      externalUrl = playlistUrl;
    } else {
      if (playlistId) {
        externalUrl = `https://music.youtube.com/playlist?list=${playlistId}`;
      } else if (videoId) {
        externalUrl = `https://music.youtube.com/watch?v=${videoId}`;
      }
    }

    // --- Unified Audio-Only Premium Player ---
    return (
      <div className="space-y-4">
        <style>{`
          @keyframes yt-soundwave {
            0%, 100% { height: 4px; }
            50% { height: 24px; }
          }
          .yt-wave-bar {
            width: 3px;
            border-radius: 9999px;
            background-color: #b1201e;
            height: 4px;
          }
          .yt-wave-bar.animating {
            animation: yt-soundwave 1.2s ease-in-out infinite;
          }
        `}</style>

        <div className="flex flex-col sm:flex-row items-center gap-4 bg-parchment/65 backdrop-blur-md rounded-lg border border-rule/70 p-4 shadow-inner relative overflow-hidden">
          {/* Spinning Vinyl Record Visual */}
          <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0">
            <div 
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-neutral-900 border-2 border-neutral-700 shadow-lg relative flex items-center justify-center overflow-hidden transition-transform duration-300 ${
                isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''
              }`}
              style={{
                backgroundImage: 'radial-gradient(circle, #333 10%, #111 30%, #222 40%, #111 60%, #333 70%, #111 80%, #000 100%)',
                animationPlayState: isPlaying ? 'running' : 'paused'
              }}
            >
              {/* Concentric Grooves */}
              <div className="absolute inset-2 rounded-full border border-neutral-800 opacity-60" />
              <div className="absolute inset-4 rounded-full border border-neutral-800 opacity-40" />
              <div className="absolute inset-6 rounded-full border border-neutral-800 opacity-30" />
              <div className="absolute inset-8 rounded-full border border-neutral-800 opacity-20" />
              
              {/* Vinyl Label */}
              <div className="w-8 h-8 rounded-full bg-brass/30 border border-brass-deep/45 flex items-center justify-center shadow-inner relative">
                <div className="w-2.5 h-2.5 rounded-full bg-parchment-soft border border-brass/50 flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-neutral-950" />
                </div>
              </div>
            </div>
            
            {/* Audio tone arm / needle overlay */}
            <div className={`absolute top-1 right-2 w-7 h-10 origin-[20%_10%] transition-transform duration-500 pointer-events-none ${
              isPlaying ? 'rotate-[12deg]' : 'rotate-0'
            }`}>
              <svg viewBox="0 0 30 40" fill="none" className="w-full h-full text-brass-deep drop-shadow-sm">
                <path d="M 5 5 Q 15 5 15 15 L 20 30 L 25 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="5" cy="5" r="3.5" fill="currentColor" />
                <rect x="22" y="28" width="5" height="6" rx="1.5" fill="#444" />
              </svg>
            </div>
          </div>

          {/* Custom Control Layout */}
          <div className="flex-1 w-full space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold tracking-wide text-ink truncate">
                  Campaign Atmosphere
                </h3>
                <p className="font-serif text-[11px] text-ink-soft italic truncate">
                  Live Broadcast from GM
                </p>
              </div>
              
              {/* Pulse Glow Light */}
              <div className="flex items-center gap-1.5 flex-shrink-0 bg-parchment border border-rule/50 rounded-full px-2 py-0.5 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75 ${isPlaying ? 'running' : 'paused'}`}></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson"></span>
                </span>
                <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute font-semibold">
                  {playerState === 'buffering' ? 'Buffering' : isPlaying ? 'Live' : 'Paused'}
                </span>
              </div>
            </div>

            {/* sound wave visualizer */}
            <div className="flex items-end gap-1 h-7 px-1 pt-1 bg-parchment-soft/40 border border-rule/30 rounded shadow-inner">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => {
                const delay = `${0.08 * i}s`;
                const duration = `${0.6 + Math.random() * 0.7}s`;
                return (
                  <div 
                    key={i}
                    className={`yt-wave-bar ${isPlaying ? 'animating' : ''}`}
                    style={{
                      animationDelay: isPlaying ? delay : '0s',
                      animationDuration: isPlaying ? duration : '0s'
                    }}
                  />
                );
              })}
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Skip Back (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => ytPlayer?.previousVideo()}
                    disabled={!isApiReady || !ytPlayer}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-rule bg-parchment hover:bg-parchment-deep text-brass-deep transition-all disabled:opacity-50"
                    aria-label="Previous song"
                  >
                    <SkipBack size={14} fill="currentColor" />
                  </button>
                )}

                {/* Play/Pause Button (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!isApiReady}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-crimson text-parchment hover:bg-wine hover:scale-105 active:scale-95 transition-all shadow-md disabled:opacity-50"
                    aria-label={isPlaying ? 'Pause music' : 'Play music'}
                  >
                    {!isApiReady ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : isPlaying ? (
                      <Pause size={16} fill="currentColor" />
                    ) : (
                      <Play size={16} className="ml-0.5" fill="currentColor" />
                    )}
                  </button>
                )}

                {/* Skip Forward (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => ytPlayer?.nextVideo()}
                    disabled={!isApiReady || !ytPlayer}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-rule bg-parchment hover:bg-parchment-deep text-brass-deep transition-all disabled:opacity-50"
                    aria-label="Next song"
                  >
                    <SkipForward size={14} fill="currentColor" />
                  </button>
                )}

                {/* Play on YouTube Music External Link (GM Only) */}
                {!readOnly && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 rounded border border-rule bg-parchment hover:bg-parchment-deep font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors"
                  >
                    <ExternalLink size={10} /> YouTube Music
                  </a>
                )}

                {/* Disconnect Playlist (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="font-display text-[10px] uppercase tracking-wider text-crimson hover:text-wine border border-crimson/30 hover:border-wine/50 rounded px-2 py-1 transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Volume Controls */}
              <div className="flex items-center gap-2 max-w-[130px] flex-1">
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={!isApiReady}
                  className="text-ink-mute hover:text-crimson transition-colors p-1"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  disabled={!isApiReady}
                  className="w-full accent-crimson h-1 bg-rule/50 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Scenarios / Multiple Playlists List */}
        {renderScenarios()}

        {/* Bulletproof hidden off-screen iframe */}
        <div className="absolute overflow-hidden" style={{ width: '1px', height: '1px', opacity: 0.01, left: '-9999px', top: '-9999px' }}>
          <iframe
            id={iframeId}
            src={embedUrl}
            title="YouTube Music Player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="border-0 w-full h-full"
          />
        </div>

        <p className="px-1 font-serif text-[10px] italic leading-normal text-ink-mute">
          <strong>Note:</strong> Some official tracks restrict external embedding. If you click Play and hear no sound, click the button above to play the full playlist directly in a new tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleConnect} className="space-y-2">
        <p className="font-serif text-xs italic text-ink-mute">
          Enter a YouTube playlist or video link to play background ambiance or battle tracks during play.
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => {
              setInputUrl(e.target.value);
              if (error) setError('');
            }}
            placeholder="Paste YouTube playlist URL, video, or ID..."
            className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputUrl.trim()}
            className="rounded border border-brass-deep/60 bg-brass/10 px-3 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        </div>
        {error && <p className="px-1 font-serif text-[10px] italic text-crimson">{error}</p>}
      </form>

      {/* Scenarios / Multiple Playlists List */}
      {renderScenarios()}
    </div>
  );
}
