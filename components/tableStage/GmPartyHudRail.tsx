'use client';

import React, { useState } from 'react';
import {
  Heart,
  Shield,
  Eye,
  Plus,
  Sparkles,
  Users,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { passivePerception } from '@/lib/pc/skills';
import { pcTotalLevel } from '@/lib/pc/derived';
import { CONDITIONS } from '@/lib/initiative';
import type { PlayerCharacter } from '@/lib/pc/types';
import { PartyRunTrackerSection } from '@/components/CharacterSheetLifecycleControls';
import { GuidedEmptyState } from '@/components/ui/GuidedEmptyState';
import { PlayerPrivacyPill } from '@/components/ui/VisibilityBadge';

export interface GmPartyHudRailProps {
  pcs: PlayerCharacter[];
  onUpdatePcs: (next: PlayerCharacter[]) => void;
  onAddPc?: () => void;
}

export function GmPartyHudRail({
  pcs,
  onUpdatePcs,
  onAddPc,
}: GmPartyHudRailProps) {
  const [expandedPcId, setExpandedPcId] = useState<string | null>(null);
  const [showLifecycle, setShowLifecycle] = useState(false);

  const adjustPcHp = (pcId: string, delta: number) => {
    const next = pcs.map((pc) => {
      if (pc.id !== pcId) return pc;
      const cur = Number(pc.hp?.current) || 0;
      const max = Math.max(1, Number(pc.hp?.max) || 1);
      const nextHp = Math.max(0, Math.min(max, cur + delta));
      return {
        ...pc,
        hp: {
          ...pc.hp,
          current: nextHp,
        },
      };
    });
    onUpdatePcs(next);
  };

  const togglePcCondition = (pcId: string, cond: string) => {
    const next = pcs.map((pc) => {
      if (pc.id !== pcId) return pc;
      const has = (pc.conditions || []).includes(cond);
      return {
        ...pc,
        conditions: has
          ? pc.conditions.filter((c) => c !== cond)
          : [...(pc.conditions || []), cond],
      };
    });
    onUpdatePcs(next);
  };

  const avgPassivePerception =
    pcs.length > 0
      ? Math.round(
          pcs.reduce((sum, p) => sum + passivePerception(p), 0) / pcs.length,
        )
      : 10;

  return (
    <div className="space-y-3">
      {/* Rail Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-[var(--accent-primary)]" />
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
            Party HUD ({pcs.length})
          </h3>
        </div>
        {pcs.length > 0 && (
          <span
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]"
            title="Average Party Passive Perception"
          >
            Avg PP {avgPassivePerception}
          </span>
        )}
      </div>

      {pcs.length === 0 ? (
        <GuidedEmptyState
          icon={<Users size={18} />}
          title="No Party Roster Loaded"
          description="Drop party PDFs or JSON sheets to populate the live GM HUD with HP bars, AC, Passive Perception, and shared hooks."
          actions={
            onAddPc
              ? [
                  {
                    label: 'Create Character',
                    onClick: onAddPc,
                    variant: 'primary',
                    icon: <Plus size={13} />,
                  },
                ]
              : []
          }
        >
          <PartyRunTrackerSection pcs={pcs} onUpdatePcs={onUpdatePcs} />
        </GuidedEmptyState>
      ) : (
        <div className="space-y-2.5">
          {pcs.map((pc) => {
            const hpCur = Number(pc.hp?.current) || 0;
            const hpMax = Math.max(1, Number(pc.hp?.max) || 1);
            const hpPct = Math.max(0, Math.min(100, Math.round((hpCur / hpMax) * 100)));
            const pp = passivePerception(pc);
            const lvl = pcTotalLevel(pc);
            const classLabel =
              pc.classes?.map((c) => `${c.name} ${c.level}`).join('/') ||
              `Lvl ${lvl}`;
            const sharedQuests = (pc.sharedQuests || []).filter(
              (q) => q.sharedWithGm !== false,
            );
            const sharedNotes = (pc.sharedAnnotations || []).filter(
              (a) => a.sharedWithGm !== false,
            );
            const isExpanded = expandedPcId === pc.id;

            const hpBarColor =
              hpPct <= 25
                ? 'bg-rose-500'
                : hpPct <= 50
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';

            return (
              <div
                key={pc.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-card transition-all"
              >
                {/* Top Row: Name + Class Chip + AC & Passive Perception */}
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPcId(isExpanded ? null : pc.id)
                    }
                    className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                  >
                    <span className="mt-0.5 text-[var(--text-muted)]">
                      {isExpanded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-base font-semibold text-[var(--text-primary)]">
                        {pc.name || 'Unnamed PC'}
                      </div>
                      <div className="font-sans text-[11px] text-[var(--text-muted)]">
                        {[pc.race, classLabel].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </button>

                  {/* Strictly 2 compact stat badges: Effective AC & Passive Perception */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--text-primary)]"
                      title="Effective Armor Class"
                    >
                      <Shield size={11} className="text-sky-400" />
                      <span>{pc.ac}</span>
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-[var(--text-muted)]"
                      title="Passive Perception"
                    >
                      <Eye size={11} />
                      <span>{pp}</span>
                    </span>
                  </div>
                </div>

                {/* Scannable HP Bar + Quick +/- Controls */}
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                      <Heart size={11} className="text-rose-500" />
                      <span>
                        {hpCur}/{hpMax}
                      </span>
                      {(pc.hp?.temp ?? 0) > 0 && (
                        <span className="text-sky-400">+{pc.hp.temp} THP</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {[-5, -1, 1, 5].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => adjustPcHp(pc.id, d)}
                          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.2 font-mono text-[10px] tabular-nums text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-canvas)]">
                    <div
                      className={`h-full transition-all ${hpBarColor}`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                </div>

                {/* Active Conditions Row */}
                {(pc.conditions?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {pc.conditions.map((cond) => (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => togglePcCondition(pc.id, cond)}
                        className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-amber-400 hover:bg-amber-500/25"
                        title="Click to remove condition"
                      >
                        {cond} ×
                      </button>
                    ))}
                  </div>
                )}

                {/* Player-Shared Quests / Hooks Summary */}
                {(sharedQuests.length > 0 || sharedNotes.length > 0) && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
                    <span className="flex items-center gap-1 font-sans text-[11px] text-emerald-400">
                      <Sparkles size={11} />
                      <span>
                        {sharedQuests.length} quest
                        {sharedQuests.length === 1 ? '' : 's'} ·{' '}
                        {sharedNotes.length} note
                        {sharedNotes.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <PlayerPrivacyPill sharedWithGm compact />
                  </div>
                )}

                {/* Expandable Condition Picker & Player-Shared Hooks Detail */}
                {isExpanded && (
                  <div className="mt-2.5 space-y-2.5 border-t border-[var(--border-subtle)] pt-2.5">
                    <div>
                      <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Toggle Conditions
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {CONDITIONS.map((cond) => {
                          const active = (pc.conditions || []).includes(cond);
                          return (
                            <button
                              key={cond}
                              type="button"
                              onClick={() => togglePcCondition(pc.id, cond)}
                              className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-medium transition-colors ${
                                active
                                  ? 'bg-amber-500 text-black'
                                  : 'border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {cond}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {sharedQuests.length > 0 && (
                      <div>
                        <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                          👁️ Player-Shared Quests
                        </div>
                        <ul className="space-y-1">
                          {sharedQuests.map((q) => (
                            <li
                              key={q.id}
                              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 font-sans text-xs text-[var(--text-primary)]"
                            >
                              {q.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Collapsible Sheet Upload & Batch PDF Export Footer */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowLifecycle((s) => !s)}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 font-sans text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <span>Sheet Upload &amp; Batch Party PDF Export</span>
              {showLifecycle ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
            </button>
            {showLifecycle && (
              <div className="mt-2">
                <PartyRunTrackerSection pcs={pcs} onUpdatePcs={onUpdatePcs} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
