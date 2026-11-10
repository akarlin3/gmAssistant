'use client';

import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ClipboardList,
  Play,
  Sparkles,
  Users,
  Map,
  KeyRound,
  Swords,
  Gift,
  Clock,
  BookOpen,
  Compass,
  FolderKanban,
  Network,
  ScrollText,
  Printer,
  Bot,
} from 'lucide-react';
import { countFilled } from '@/lib/prepTargets';
import { PlanPrepView } from './PlanPrepView';
import { EditorSubviews } from './EditorSubviews';
import {
  SessionPrepPhase,
  type SessionPrepStepId,
} from './planPrepView/SessionPrepPhase';
import { PrepScaleInlinePill, type GmPrimaryTab, type PrepScale } from '../TopHeaderBar';
import type { CampaignEditorModel } from './useCampaignEditor';
import type { Mode } from '@/lib/modes';

export interface MasterDetailWorkspaceProps {
  ed: CampaignEditorModel;
  primaryTab: GmPrimaryTab;
  prepScale: PrepScale;
  onPrepScaleChange: (scale: PrepScale) => void;
}

export function MasterDetailWorkspace({
  ed,
  primaryTab,
  prepScale,
  onPrepScaleChange,
}: MasterDetailWorkspaceProps) {
  const {
    PREP_GROUPS,
    completedCount,
    done,
    get,
    getFilteredPrepArray,
    handleModeChange,
    handleSubviewChange,
    mode,
    nextUp,
    pcs,
    progressMenuRef,
    progressOpen,
    setProgressOpen,
    setState,
    setVal,
    subview,
    tgt,
    totalPrepSteps,
  } = ed;

  const [focusedPrepStep, setFocusedPrepStep] = useState<SessionPrepStepId>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'party' | 'private'>('all');

  // Compute live entity & prep progress counts (tabular-nums)
  const secretsCount = countFilled(
    'secrets',
    getFilteredPrepArray('secrets', get('secrets', [])),
  );
  const secretsTarget = tgt('secrets') || 10;

  const scenesCount = countFilled(
    'scenes',
    getFilteredPrepArray('scenes', get('scenes', [])),
  );
  const scenesTarget = tgt('scenes') || 5;

  const locationsArr = (get('locations', []) as any[]) || [];
  const locationsCount = countFilled(
    'locations',
    getFilteredPrepArray('locations', locationsArr),
    get('player', {}),
  );
  const locationsTarget = tgt('locations') || 3;

  const npcsArr = (get('npcs', []) as any[]) || [];
  const npcsCount = countFilled(
    'npcs',
    getFilteredPrepArray('npcs', npcsArr),
    get('player', {}),
  );
  const npcsTarget = tgt('npcs') || 5;

  const monstersArr = (get('monsters', []) as any[]) || [];
  const monstersCount = monstersArr.filter((m) =>
    typeof m === 'string' ? m.trim().length > 0 : Boolean(m?.name),
  ).length;

  const itemsArr = (get('items', []) as any[]) || [];
  const itemsCount = itemsArr.filter((it) =>
    typeof it === 'string' ? it.trim().length > 0 : Boolean(it?.name),
  ).length;

  const factionsArr = (get('factions', []) as any[]) || [];
  const clocksArr = (get('clocks', []) as any[]) || [];
  const pcGoalsArr = (get('pcGoals', []) as any[]) || [];
  const sessionLogsArr = (get('sessionLogV2', []) as any[]) || [];
  const rosterArr = (get('player', {}) as any)?.roster || [];

  const selectModeAndSubview = (
    targetMode: Mode,
    targetSubview: string,
    prepStep: SessionPrepStepId = 'all',
  ) => {
    setFocusedPrepStep(prepStep);
    if (mode !== targetMode) {
      handleModeChange(targetMode);
    }
    handleSubviewChange(targetSubview);
  };

  return (
    <div className="grid min-h-[calc(100vh-3rem)] w-full max-w-none grid-cols-1 lg:grid-cols-[240px_1fr]">
      {/* LEFT SIDEBAR INDEX (240px on Desktop) */}
      <aside
        aria-label="Workspace section index"
        className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-3 lg:border-b-0 lg:border-r lg:p-4"
      >
        {primaryTab === 'prep' && (
          <div className="space-y-4">
            {/* Quick Visibility Filter Chips */}
            <div>
              <div className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Quick Filter
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'party', label: '👁️ Party' },
                    { id: 'private', label: '🔒 Private' },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setVisibilityFilter(chip.id)}
                    className={`rounded-md px-2 py-1 font-sans text-[11px] font-medium transition-colors ${
                      visibilityFilter === chip.id
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Group 1: Campaign Foundation (Plan) */}
            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Campaign Foundation
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'plan' && subview === 'pitch'}
                  onClick={() => selectModeAndSubview('plan', 'pitch')}
                  label="Premise & Pitch"
                  pill={done.pitch ? 'Done' : undefined}
                />
                <SidebarItem
                  active={mode === 'plan' && subview === 'worldbuild'}
                  onClick={() => selectModeAndSubview('plan', 'worldbuild')}
                  label="World & Factions"
                  pill={`Factions ${factionsArr.length}`}
                />
                <SidebarItem
                  active={mode === 'plan' && subview === 'party'}
                  onClick={() => selectModeAndSubview('plan', 'party')}
                  label="Party & PC Goals"
                  pill={`PCs ${pcs.length} · Goals ${pcGoalsArr.length}`}
                />
              </div>
            </div>

            {/* Group 2: Lazy DM 8-Step Session Prep */}
            <div>
              <div className="mb-1 flex items-center justify-between px-1.5">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Session Prep (8-Step)
                </span>
                <button
                  type="button"
                  onClick={() => selectModeAndSubview('prep', 'flow', 'all')}
                  className={`font-sans text-[10px] font-medium ${
                    mode === 'prep' && subview === 'flow' && focusedPrepStep === 'all'
                      ? 'text-[var(--accent-primary)] underline'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  View All
                </button>
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's1-review'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's1-review')}
                  label="1 · Review PCs"
                  done={done['s1-review']}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's2-start'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's2-start')}
                  label="2 · Strong Start"
                  done={done['s2-start']}
                  pill={`${countFilled('strongStart', get('strongStart', ''))}/${tgt('strongStart') || 1}`}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's3-scenes'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's3-scenes')}
                  label="3 · Scenes"
                  done={done['s3-scenes']}
                  pill={`Scenes ${scenesCount}/${scenesTarget}`}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's4-secrets'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's4-secrets')}
                  icon={<KeyRound size={12} />}
                  label="4 · Secrets & Clues"
                  done={done['s4-secrets']}
                  pill={`Secrets ${secretsCount}/${secretsTarget}`}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's5-loc'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's5-loc')}
                  icon={<Map size={12} />}
                  label="5 · Locations"
                  done={done['s5-loc']}
                  pill={`Locations ${locationsCount}/${locationsTarget}`}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's6-npc'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's6-npc')}
                  icon={<Users size={12} />}
                  label="6 · NPCs"
                  done={done['s6-npc']}
                  pill={`NPCs ${npcsCount}/${npcsTarget}`}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's7-mon'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's7-mon')}
                  icon={<Swords size={12} />}
                  label="7 · Monsters"
                  done={done['s7-mon']}
                  pill={`Monsters ${monstersCount}`}
                />
                <SidebarItem
                  active={
                    mode === 'prep' &&
                    subview === 'flow' &&
                    focusedPrepStep === 's8-rew'
                  }
                  onClick={() => selectModeAndSubview('prep', 'flow', 's8-rew')}
                  icon={<Gift size={12} />}
                  label="8 · Rewards"
                  done={done['s8-rew']}
                  pill={`Items ${itemsCount}`}
                />
              </div>
            </div>

            {/* Group 3: Clocks, Arc & Tools */}
            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Arc &amp; Prep Suite
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'prep' && subview === 'clocks'}
                  onClick={() => selectModeAndSubview('prep', 'clocks')}
                  icon={<Clock size={12} />}
                  label="Clocks & Downtime"
                  pill={`Clocks ${clocksArr.length}`}
                />
                <SidebarItem
                  active={mode === 'prep' && subview === 'arc'}
                  onClick={() => selectModeAndSubview('prep', 'arc')}
                  label="Campaign Arc"
                />
                <SidebarItem
                  active={mode === 'prep' && subview === 'ending'}
                  onClick={() => selectModeAndSubview('prep', 'ending')}
                  label="Campaign Ending"
                />
                <SidebarItem
                  active={mode === 'prep' && subview === 'wizard'}
                  onClick={() => selectModeAndSubview('prep', 'wizard')}
                  label="Guided Prep Wizard"
                />
                <SidebarItem
                  active={mode === 'prep' && subview === 'lorerag'}
                  onClick={() => selectModeAndSubview('prep', 'lorerag')}
                  icon={<Bot size={12} />}
                  label="Lore RAG Assistant"
                />
                <SidebarItem
                  active={mode === 'prep' && subview === 'printqueue'}
                  onClick={() => selectModeAndSubview('prep', 'printqueue')}
                  icon={<Printer size={12} />}
                  label="K1C Print Queue"
                />
              </div>
            </div>
          </div>
        )}

        {primaryTab === 'world_roster' && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Roster &amp; Player View
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'organize' && subview === 'party'}
                  onClick={() => selectModeAndSubview('organize', 'party')}
                  icon={<Users size={12} />}
                  label="Party & PC Sheets"
                  pill={`PCs ${pcs.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'players'}
                  onClick={() => selectModeAndSubview('organize', 'players')}
                  label="Player Mode & Slots"
                  pill={`Slots ${rosterArr.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'playerview'}
                  onClick={() => selectModeAndSubview('organize', 'playerview')}
                  label="Player-Safe Lore View"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                World &amp; Conspiracy
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'organize' && subview === 'wiki'}
                  onClick={() => selectModeAndSubview('organize', 'wiki')}
                  icon={<Network size={12} />}
                  label="Wiki & Lore Graph"
                  pill={`${npcsArr.length + locationsArr.length + factionsArr.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'livingworld'}
                  onClick={() => selectModeAndSubview('organize', 'livingworld')}
                  icon={<Compass size={12} />}
                  label="Living World Deltas"
                  pill={`Clocks ${clocksArr.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'factions'}
                  onClick={() => selectModeAndSubview('organize', 'factions')}
                  label="Faction Engine"
                  pill={`Factions ${factionsArr.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'web'}
                  onClick={() => selectModeAndSubview('organize', 'web')}
                  label="NPC Relationship Web"
                  pill={`NPCs ${npcsArr.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'logistics'}
                  onClick={() => selectModeAndSubview('organize', 'logistics')}
                  icon={<FolderKanban size={12} />}
                  label="Logistics & Strongholds"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Chronicle &amp; History
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'organize' && subview === 'log'}
                  onClick={() => selectModeAndSubview('organize', 'log')}
                  icon={<ScrollText size={12} />}
                  label="Session Log"
                  pill={`Logs ${sessionLogsArr.length}`}
                />
                <SidebarItem
                  active={mode === 'organize' && subview === 'logged'}
                  onClick={() => selectModeAndSubview('organize', 'logged')}
                  label="Logged Generator History"
                />
              </div>
            </div>
          </div>
        )}

        {primaryTab === 'reference' && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Table Reference &amp; SRD
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'library' && subview === 'generators'}
                  onClick={() => selectModeAndSubview('library', 'generators')}
                  icon={<Sparkles size={12} />}
                  label="Generators"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'spells'}
                  onClick={() => selectModeAndSubview('library', 'spells')}
                  icon={<BookOpen size={12} />}
                  label="Spells Lookup"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'monsters'}
                  onClick={() => selectModeAndSubview('library', 'monsters')}
                  icon={<Swords size={12} />}
                  label="Monsters & Bestiary"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'locations'}
                  onClick={() => selectModeAndSubview('library', 'locations')}
                  icon={<Map size={12} />}
                  label="Locations Reference"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'names'}
                  onClick={() => selectModeAndSubview('library', 'names')}
                  label="Names Directory"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'traps'}
                  onClick={() => selectModeAndSubview('library', 'traps')}
                  label="Trap Builder"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'chases'}
                  onClick={() => selectModeAndSubview('library', 'chases')}
                  label="Chase Tracker"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'hazards'}
                  onClick={() => selectModeAndSubview('library', 'hazards')}
                  label="Hazard Calculator"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'dmref'}
                  onClick={() => selectModeAndSubview('library', 'dmref')}
                  label="DM Reference Screen"
                />
                <SidebarItem
                  active={mode === 'library' && subview === 'tools'}
                  onClick={() => selectModeAndSubview('library', 'tools')}
                  label="Table Tools"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 px-1.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Oracle &amp; Improv
              </div>
              <div className="space-y-0.5">
                <SidebarItem
                  active={mode === 'oracle' && subview === 'dice'}
                  onClick={() => selectModeAndSubview('oracle', 'dice')}
                  label="Dice Roller & Macros"
                />
                <SidebarItem
                  active={mode === 'oracle' && subview === 'wells'}
                  onClick={() => selectModeAndSubview('oracle', 'wells')}
                  label="Wells Oracle"
                />
                <SidebarItem
                  active={mode === 'oracle' && subview === 'vivify'}
                  onClick={() => selectModeAndSubview('oracle', 'vivify')}
                  label="Vivify Sensory AI"
                />
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* RIGHT FOCUSED CANVAS (1fr) */}
      <section className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-5xl space-y-5">
          {/* Contextual Prep Header Bar (with Solo | Duet | Standard inline pill + Target Progress Counts) */}
          {primaryTab === 'prep' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 shadow-card">
              <div className="flex flex-wrap items-center gap-3">
                <PrepScaleInlinePill
                  scale={prepScale}
                  onChange={onPrepScaleChange}
                />

                <div className="relative" ref={progressMenuRef}>
                  <button
                    type="button"
                    onClick={() => setProgressOpen(!progressOpen)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-medium tabular-nums text-emerald-500 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <span>
                      {completedCount}/{totalPrepSteps} Prep Targets
                    </span>
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${
                        progressOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {progressOpen && (
                    <div className="absolute left-0 top-full z-30 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
                      <div className="mb-2 border-b border-[var(--border-subtle)] pb-1.5 font-display text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                        Remaining Prep Steps
                      </div>
                      <div className="space-y-2.5">
                        {PREP_GROUPS.map((g) => {
                          const uncompleted = g.keys
                            .map((k, i) => ({ k, label: g.labels[i] }))
                            .filter((x) => !done?.[x.k]);
                          if (uncompleted.length === 0) return null;
                          return (
                            <div key={g.name}>
                              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
                                {g.name}
                              </div>
                              <ul className="space-y-1">
                                {uncompleted.map((u) => (
                                  <li
                                    key={u.k}
                                    className="flex items-start gap-1.5 font-sans text-xs text-[var(--text-muted)]"
                                  >
                                    <span>•</span>
                                    <span>{u.label}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVal('__prepWizardOpen', true);
                    setVal('__prepWizardStep', 1);
                  }}
                  disabled={!!get('__activeSessionId', '')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 font-sans text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-40"
                >
                  <ClipboardList size={13} />
                  <span>Prep Wizard</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (nextUp) {
                      if (
                        !window.confirm(
                          `You have unfinished prep targets (e.g. ${nextUp.label}). Start the session anyway?`,
                        )
                      ) {
                        return;
                      }
                    }
                    const sessionId = `session_${Date.now()}_${Math.random()
                      .toString(36)
                      .slice(2, 8)}`;
                    setState((s) => ({
                      ...s,
                      __activeSessionId: sessionId,
                      __sessionStartedAt: Date.now(),
                      __sessionChangeEvents: [],
                      __sessionUsedScenes: [],
                      __mode: 'run',
                      __subview: 'cockpit',
                    }));
                    handleModeChange('run');
                    handleSubviewChange('cockpit');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 font-sans text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <Play size={13} />
                  <span>Run Session</span>
                </button>
              </div>
            </div>
          )}

          {/* Focused Canvas Content */}
          {mode === 'prep' && subview === 'flow' && focusedPrepStep !== 'all' ? (
            <SessionPrepPhase
              ed={ed}
              focusedStepId={focusedPrepStep}
              visibilityFilter={visibilityFilter}
            />
          ) : (
            <>
              <PlanPrepView ed={ed} visibilityFilter={visibilityFilter} />
              <EditorSubviews ed={ed} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function SidebarItem({
  active,
  onClick,
  label,
  pill,
  done,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  pill?: string;
  done?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs transition-all ${
        active
          ? 'bg-[var(--accent-primary)] font-semibold text-white shadow-sm'
          : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {done ? (
          <Check
            size={12}
            className={active ? 'text-white' : 'text-emerald-400'}
          />
        ) : (
          icon
        )}
        <span className="truncate">{label}</span>
      </span>
      {pill && (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.2 font-mono text-[10px] tabular-nums ${
            active
              ? 'bg-white/20 text-white'
              : 'border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)]'
          }`}
        >
          {pill}
        </span>
      )}
    </button>
  );
}
