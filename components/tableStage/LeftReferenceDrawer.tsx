'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BookOpen,
  Library,
  Sparkles,
  Dices,
  Footprints,
  Crown,
  PanelLeftClose,
  RefreshCw,
} from 'lucide-react';
import { TABLES, sampleTable } from '@/lib/inspirationTables';
import { DOWNTIME_TYPES, renownRank } from '@/components/campaignEditor/cards';
import WellsOracle from '@/components/WellsOracle';
import type { OracleRoll } from '@/lib/oracle/wells';

const SpellsTab = dynamic(() => import('@/components/SpellsTab'));
const DMRefTab = dynamic(() => import('@/components/DMRefTab'));
const ChaseTracker = dynamic(() => import('@/components/ChaseTracker'));
const CompendiumDrawer = dynamic(() =>
  import('@/components/CompendiumDrawer').then((m) => m.CompendiumDrawer),
);

export type ReferenceTabId =
  | 'compendium'
  | 'spells'
  | 'library'
  | 'oracle'
  | 'inspire'
  | 'chase'
  | 'renown';

export const REFERENCE_TABS: ReadonlyArray<{
  id: ReferenceTabId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'compendium',
    label: '5e SRD Compendium',
    shortLabel: 'SRD 5e',
    icon: <BookOpen size={12} />,
  },
  {
    id: 'spells',
    label: 'Spell Lookup',
    shortLabel: 'Spells',
    icon: <BookOpen size={12} />,
  },
  {
    id: 'library',
    label: 'Library & Rules',
    shortLabel: 'Library',
    icon: <Library size={12} />,
  },
  {
    id: 'oracle',
    label: 'Wells Oracle',
    shortLabel: 'Oracle',
    icon: <Sparkles size={12} />,
  },
  {
    id: 'inspire',
    label: 'Inspire Deck',
    shortLabel: 'Inspire',
    icon: <Dices size={12} />,
  },
  {
    id: 'chase',
    label: 'Chase Rules',
    shortLabel: 'Chase',
    icon: <Footprints size={12} />,
  },
  {
    id: 'renown',
    label: 'Renown / Downtime',
    shortLabel: 'Renown',
    icon: <Crown size={12} />,
  },
];

export interface LeftReferenceDrawerProps {
  onCollapse?: () => void;
  campaignData?: Record<string, any>;
  onUpdateCampaignKey?: (key: string, value: any) => void;
}

export function LeftReferenceDrawer({
  onCollapse,
  campaignData,
  onUpdateCampaignKey,
}: LeftReferenceDrawerProps) {
  const [activeTab, setActiveTab] = useState<ReferenceTabId>('compendium');
  const [selectedTableId, setSelectedTableId] = useState<string>(
    Object.keys(TABLES)[0] || 'introductions',
  );
  const [drawnCards, setDrawnCards] = useState<string[]>(() =>
    sampleTable(Object.keys(TABLES)[0] || 'introductions', 4),
  );
  const [localOracleLog, setLocalOracleLog] = useState<OracleRoll[]>([]);
  const [localChaos, setLocalChaos] = useState<number>(5);

  const oracleLog =
    (campaignData?.oracleLog as OracleRoll[] | undefined) ?? localOracleLog;
  const oracleChaos =
    (campaignData?.__oracleChaos as number | undefined) ?? localChaos;

  const customSpells = (campaignData?.spells as any[] | undefined) ?? [];
  const chases = (campaignData?.chases as any[] | undefined) ?? [];
  const factions = (campaignData?.factions as any[] | undefined) ?? [];

  const handleDrawInspire = (tableId: string) => {
    setSelectedTableId(tableId);
    setDrawnCards(sampleTable(tableId, 4));
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)] text-[var(--text-primary)]">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <BookOpen size={13} className="text-[var(--accent-primary)]" />
          <span className="font-display text-sm font-semibold tracking-wide">
            Quick Reference
          </span>
          <kbd
            title="Press [ to toggle Left Reference Drawer"
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1 py-0.2 font-mono text-[10px] text-[var(--text-muted)]"
          >
            [
          </kbd>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse reference drawer ([)"
            title="Collapse Reference Drawer ([)"
            className="rounded p-1 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
          >
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {/* Quick-Switch Reference Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 p-1.5">
        {REFERENCE_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 font-sans text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Tool Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'compendium' && (
          <CompendiumDrawer
            role="gm"
            campaignData={campaignData}
            onUpdateCampaignKey={onUpdateCampaignKey}
            compact
          />
        )}

        {activeTab === 'spells' && (
          <SpellsTab
            favorites={(campaignData?.__spellFavorites as string[]) ?? []}
            onFavoritesChange={(next: string[]) => onUpdateCampaignKey?.('__spellFavorites', next)}
            homebrewSpells={customSpells}
            onHomebrewSpellsChange={(next) => onUpdateCampaignKey?.('spells', next)}
          />
        )}

        {activeTab === 'library' && <DMRefTab />}

        {activeTab === 'oracle' && (
          <WellsOracle
            log={oracleLog}
            onLog={(next) => {
              setLocalOracleLog(next);
              onUpdateCampaignKey?.('oracleLog', next);
            }}
            chaos={oracleChaos}
            onChaosChange={(c) => {
              setLocalChaos(c);
              onUpdateCampaignKey?.('__oracleChaos', c);
            }}
            inline
          />
        )}

        {activeTab === 'inspire' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="inspire-deck-select"
                className="font-sans text-xs font-semibold text-[var(--text-muted)]"
              >
                Inspiration Deck
              </label>
              <button
                type="button"
                onClick={() => handleDrawInspire(selectedTableId)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 font-sans text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
              >
                <RefreshCw size={11} />
                <span>Redraw 4</span>
              </button>
            </div>
            <select
              id="inspire-deck-select"
              value={selectedTableId}
              onChange={(e) => handleDrawInspire(e.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)]"
            >
              {Object.entries(TABLES).map(([id, tbl]) => (
                <option key={id} value={id}>
                  {tbl.title}
                </option>
              ))}
            </select>
            <div className="space-y-2">
              {drawnCards.map((card, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 font-sans text-xs leading-relaxed text-[var(--text-primary)] shadow-card"
                >
                  {card}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'chase' && (
          <ChaseTracker
            chases={chases}
            onChange={(next) => onUpdateCampaignKey?.('chases', next)}
          />
        )}

        {activeTab === 'renown' && (
          <div className="space-y-4">
            {/* Active Campaign Faction Renown */}
            <div className="space-y-2">
              <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Faction Renown &amp; Heat
              </h4>
              {factions.length === 0 ? (
                <p className="font-sans text-xs text-[var(--text-muted)]">
                  No factions registered yet. Standard rank thresholds: Initiate (1), Trusted (3), Established (10), Honored (25), Legend (50).
                </p>
              ) : (
                <div className="space-y-1.5">
                  {factions.map((f: any, idx: number) => {
                    const r = Number(f.renown) || 0;
                    const rank = renownRank(r, f.rankLabels);
                    return (
                      <div
                        key={f.id || idx}
                        className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-sm font-semibold text-[var(--text-primary)]">
                            {f.name || `Faction ${idx + 1}`}
                          </div>
                          <div className="font-sans text-[11px] text-[var(--text-muted)]">
                            Rank: {rank}
                          </div>
                        </div>
                        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-[var(--text-primary)]">
                          {r >= 0 ? `+${r}` : r}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Downtime Reference Cards */}
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Downtime Activity Reference
              </h4>
              <div className="space-y-2">
                {DOWNTIME_TYPES.map((dt) => (
                  <div
                    key={dt.id}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5"
                  >
                    <div className="font-display text-xs font-semibold text-[var(--text-primary)]">
                      {dt.label}
                    </div>
                    {dt.reference ? (
                      <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--text-muted)]">
                        {dt.reference}
                      </p>
                    ) : (
                      <p className="mt-1 font-sans text-[11px] text-[var(--text-muted)]">
                        Fields: {dt.fields.map((f) => f.label).join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
