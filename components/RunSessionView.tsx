'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Eye, EyeOff, Check, Swords, NotebookPen, Users, Wrench,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { normalizePcs } from '@/lib/pc/factory';
import type { HomebrewMonster } from './MonstersTab';
import { makeEvent, type ChangeEvent } from '@/lib/sessionEvents';
import type { CampaignContext } from '@/lib/generators/types';
import { normalizeItem } from '@/lib/playerMode/types';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import {
  type Get, type SetVal, type PinKind, type PinRef, type SectionKey, SECTION_KEYS,
} from './runSession/types';
import { SectionShell, PanelShell, Empty, PinToggle, NPCRow } from './runSession/sections';
import { SceneRow } from './runSession/SceneRow';
import { StageBar } from './runSession/StageBar';
import { NoteSeed } from './runSession/widgets';
import { SessionHeader } from './runSession/view/SessionHeader';
import { SectionNav } from './runSession/view/SectionNav';
import { StrongStart } from './runSession/view/StrongStart';
import { MagicItemsSection } from './runSession/view/MagicItemsSection';
import { ToolsPanel } from './runSession/view/ToolsPanel';
import { Overlays } from './runSession/view/Overlays';
import { useAutoPublish, useShareActions } from './runSession/view/useAutoPublish';
import { SECTION_META } from './runSession/view/constants';
import type { Props } from './runSession/view/types';

// Re-exported to preserve the existing import contract used by
// CampaignEditor.tsx and PlayerCampaignView.tsx.
export { SectionShell, PanelShell } from './runSession/sections';
export { QuickDice, QuickInspire } from './runSession/widgets';
export { MusicPlayer } from './runSession/MusicPlayer';

export default function RunSessionView({
  get, setVal, characters, onEndSession, onExitWithoutEnding, onOpenLibrary, campaignContext, campaignId, campaignName,
  sessionPlaylistAnchor, setSessionPlaylistAnchor,
}: Props) {
  const [section, setSection] = useState<Record<SectionKey, boolean>>({
    scenes: true, secrets: true, npcs: true, locations: true,
    monsters: true, magicItems: true, goals: true, clocks: true,
  });
  const party = useMemo(() => normalizePcs(get('pcs', [])), [get]);
  const strongStartDone = !!get('__sessionStrongStartDelivered', false);
  const [toast, setToast] = useState<string | null>(null);

  const playerConfig = useMemo(() => (get('player', {}) as PlayerConfig) || {}, [get]);
  const playerLog = useMemo(() => (get('playerLog', []) as PlayerLogEntry[]) || [], [get]);

  const { publishState } = useAutoPublish({
    get, setVal, playerConfig, playerLog, campaignId, campaignName, sessionPlaylistAnchor,
  });

  const { shareToPlayerLog, toggleEntityShare } = useShareActions({
    playerLog, playerConfig, setVal, setToast,
  });

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
      const pc = (get('player', {}) as any) || {};
      const roster = pc.roster || [];
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
    if (hours > 4) setLongSessionPrompt(true);
  }, [get]);

  const [mobileToolsExpanded, setMobileToolsExpanded] = useState(true);

  const toolsPanel = (
    <ToolsPanel
      get={get}
      setVal={setVal}
      party={party}
      campaignContext={campaignContext}
      initiativeOpen={initiativeOpen}
      setInitiativeOpen={setInitiativeOpen}
      musicOpen={musicOpen}
      setMusicOpen={setMusicOpen}
      homebrewMonsters={homebrewMonsters}
      sessionPlaylistAnchor={sessionPlaylistAnchor}
      setSessionPlaylistAnchor={setSessionPlaylistAnchor}
      pushEvent={pushEvent}
    />
  );

  return (
    <main className="min-h-screen p-3 pb-32 sm:p-5 md:p-6">
      <div className="mx-auto max-w-7xl space-y-3">
        <SessionHeader
          sessionStartedAt={get('__sessionStartedAt', Date.now()) as number}
          shareToken={playerConfig?.shareToken}
          publishState={publishState}
          onExitWithoutEnding={onExitWithoutEnding}
          onOpenLibrary={onOpenLibrary}
          onEndSession={onEndSession}
        />

        <SectionNav
          onNavigate={(k) => {
            setSection(s => ({ ...s, [k]: true }));
            setTimeout(() => {
              document.getElementById(`section-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 0);
          }}
        />

        <StrongStart
          strongStart={strongStart}
          strongStartDone={strongStartDone}
          playerLog={playerLog}
          get={get}
          setVal={setVal}
          pushEvent={pushEvent}
          onShare={shareToPlayerLog}
        />

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
                          onClick={() => { if (isShared) return; shareToPlayerLog(`Clue: ${s}`); }}
                          disabled={isShared}
                          className={`mt-0.5 p-0.5 transition-colors ${isShared ? 'cursor-default text-moss' : 'rounded text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
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
                          className={`mt-0.5 p-1 transition-colors ${isShared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
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
                          onClick={() => { if (isShared) return; shareToPlayerLog(`Encountered: ${m}${hb?.challenge_rating ? ` — CR ${hb.challenge_rating}` : ''}`); }}
                          disabled={isShared}
                          className={`p-1 transition-colors ${isShared ? 'cursor-default text-moss' : 'rounded text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
                          title={isShared ? 'Shared with Players' : 'Share with Players'}
                        >
                          <Eye size={12} />
                        </button>
                        <span className="flex-1 truncate">{m}</span>
                        {hb && (
                          <button
                            onClick={() => setStatBlockSlug(hb.slug)}
                            className="font-display text-[10px] uppercase tracking-wider text-brass-deep underline decoration-dotted underline-offset-2 hover:text-crimson"
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

            <MagicItemsSection
              open={section.magicItems}
              onToggle={() => toggleSection('magicItems')}
              normalizedItems={normalizedItems}
              magicItemsList={magicItemsList}
              givenItems={givenItems}
              playerLog={playerLog}
              roster={roster}
              isPinned={isPinned}
              togglePin={togglePin}
              toggleItemGiven={toggleItemGiven}
              setVal={setVal}
              get={get}
              shareToPlayerLog={shareToPlayerLog}
              pushEvent={pushEvent}
            />

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
                            onClick={() => { if (isShared) return; shareToPlayerLog(`Quest Update: "${g.text}" is currently ${g.status || 'Active'}.`); }}
                            disabled={isShared}
                            className={`p-1 transition-colors ${isShared ? 'cursor-default text-moss' : 'rounded text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
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
                              className={`p-1 transition-colors ${isShared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
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

          <div className="hidden space-y-3 pr-1 lg:sticky lg:top-3 lg:block lg:max-h-[calc(100vh-1.5rem)] lg:self-start lg:overflow-y-auto">
            {toolsPanel}
          </div>
        </div>

        <NoteSeed pushEvent={pushEvent} />
      </div>

      {/* Mobile Tools Drawer */}
      <div className={`fixed inset-x-0 z-30 flex flex-col border-t border-rule bg-parchment/95 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] backdrop-blur transition-transform duration-300 lg:hidden ${mobileToolsExpanded ? 'bottom-[56px] translate-y-0' : 'bottom-[56px] translate-y-full'}`}>
        <button
          onClick={() => setMobileToolsExpanded(!mobileToolsExpanded)}
          className="absolute -top-8 right-4 flex items-center gap-1.5 rounded-t border border-b-0 border-rule bg-parchment px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep shadow-[0_-2px_4px_rgba(0,0,0,0.05)]"
        >
          <Wrench size={12} /> Tools {mobileToolsExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto p-3">
          {toolsPanel}
        </div>
      </div>

      <Overlays
        toast={toast}
        longSessionPrompt={longSessionPrompt}
        sessionDurationHours={sessionDurationHours}
        statBlockMonster={statBlockMonster ?? null}
        onDismissLongSession={() => setLongSessionPrompt(false)}
        onEndSession={onEndSession}
        onCloseStatBlock={() => setStatBlockSlug(null)}
      />

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
