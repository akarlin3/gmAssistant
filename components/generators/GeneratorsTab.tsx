'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Coins, Gem, Shirt, Sparkles, Beer, MountainSnow, MapPinned, Map, ScrollText, Wand2, Signpost, Waypoints } from 'lucide-react';
import type { CampaignContext, GeneratorKind } from '@/lib/generators/types';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';
import TreasureHoardGenerator from './TreasureHoardGenerator';
import TrinketGenerator from './TrinketGenerator';
import MundaneShopGenerator from './MundaneShopGenerator';
import MagicShopGenerator from './MagicShopGenerator';
import TavernGenerator from './TavernGenerator';
import TavernNameGenerator from './TavernNameGenerator';
import DungeonGenerator from './DungeonGenerator';
import SettlementGenerator from './SettlementGenerator';
import PlotSegueGenerator from './PlotSegueGenerator';

type GenSlug = GeneratorKind | 'names' | 'locations';

const GROUPS: { label: string; entries: { slug: GenSlug; label: string; icon: typeof Coins; gated?: boolean }[] }[] = [
  {
    label: 'Treasure',
    entries: [
      { slug: 'treasure-hoard', label: 'Treasure Hoards', icon: Coins },
      { slug: 'trinket', label: 'Trinkets', icon: Gem },
      { slug: 'mundane-shop', label: 'Mundane Shops', icon: Shirt },
      { slug: 'magic-shop', label: 'Magic Item Shops', icon: Wand2 },
    ],
  },
  {
    label: 'World',
    entries: [
      { slug: 'tavern', label: 'Taverns', icon: Beer },
      { slug: 'tavern-name', label: 'Tavern Names', icon: Signpost },
      { slug: 'dungeon', label: 'Dungeons', icon: MountainSnow },
      { slug: 'settlement', label: 'Settlements', icon: MapPinned },
    ],
  },
  {
    label: 'Narrative',
    entries: [
      { slug: 'plot-segue', label: 'Plot Segues', icon: Waypoints },
    ],
  },
  {
    label: 'People & Places (existing)',
    entries: [
      { slug: 'names', label: 'Names', icon: ScrollText, gated: true },
      { slug: 'locations', label: 'Locations', icon: Map, gated: true },
    ],
  },
];

export default function GeneratorsTab({
  logs,
  onLogsChange,
  campaignContext,
  renderNames,
  renderLocations,
  onAddToCampaign,
  disabledDestsByKind,
}: {
  logs: GeneratorLogs;
  onLogsChange: (next: GeneratorLogs) => void;
  campaignContext?: CampaignContext;
  renderNames: () => React.ReactNode;
  renderLocations: () => React.ReactNode;
  onAddToCampaign?: (kind: LogKind) => (dest: CampaignDestKey, items: SelectableItem[]) => void;
  // Map of LogKind → destinations that should appear disabled in the picker.
  // Plot segues use this for the 'session-log' dest when no session is open.
  disabledDestsByKind?: Partial<Record<LogKind, readonly CampaignDestKey[]>>;
}) {
  const [active, setActive] = useState<GenSlug>('treasure-hoard');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'g') {
        document.querySelector<HTMLElement>('[data-generators-sidebar]')?.focus();
      } else if (key === 'r') {
        const b = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(btn => /Reroll|Generate/.test(btn.textContent ?? ''));
        b?.click();
      } else if (key === 'e') {
        const b = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(btn => /Enhance with AI|Enhancing/.test(btn.textContent ?? ''));
        b?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const entriesFor = useCallback(
    (kind: LogKind): LogEntry[] => logs[kind] ?? [],
    [logs],
  );

  const setEntriesFor = useCallback(
    (kind: LogKind) => (next: LogEntry[]) => {
      onLogsChange({ ...logs, [kind]: next });
    },
    [logs, onLogsChange],
  );

  const addFor = useCallback(
    (kind: LogKind) => (onAddToCampaign ? onAddToCampaign(kind) : undefined),
    [onAddToCampaign],
  );

  const ActiveComponent = useMemo(() => {
    switch (active) {
      case 'treasure-hoard':
        return <TreasureHoardGenerator entries={entriesFor('treasure-hoard')} onEntriesChange={setEntriesFor('treasure-hoard')} campaignContext={campaignContext} onAddToCampaign={addFor('treasure-hoard')} />;
      case 'trinket':
        return <TrinketGenerator entries={entriesFor('trinket')} onEntriesChange={setEntriesFor('trinket')} campaignContext={campaignContext} onAddToCampaign={addFor('trinket')} />;
      case 'mundane-shop':
        return <MundaneShopGenerator entries={entriesFor('mundane-shop')} onEntriesChange={setEntriesFor('mundane-shop')} campaignContext={campaignContext} onAddToCampaign={addFor('mundane-shop')} />;
      case 'magic-shop':
        return <MagicShopGenerator entries={entriesFor('magic-shop')} onEntriesChange={setEntriesFor('magic-shop')} campaignContext={campaignContext} onAddToCampaign={addFor('magic-shop')} />;
      case 'tavern':
        return <TavernGenerator entries={entriesFor('tavern')} onEntriesChange={setEntriesFor('tavern')} campaignContext={campaignContext} onAddToCampaign={addFor('tavern')} />;
      case 'tavern-name':
        return <TavernNameGenerator entries={entriesFor('tavern-name')} onEntriesChange={setEntriesFor('tavern-name')} onAddToCampaign={addFor('tavern-name')} />;
      case 'dungeon':
        return <DungeonGenerator entries={entriesFor('dungeon')} onEntriesChange={setEntriesFor('dungeon')} campaignContext={campaignContext} onAddToCampaign={addFor('dungeon')} />;
      case 'settlement':
        return <SettlementGenerator entries={entriesFor('settlement')} onEntriesChange={setEntriesFor('settlement')} campaignContext={campaignContext} onAddToCampaign={addFor('settlement')} />;
      case 'plot-segue':
        return <PlotSegueGenerator entries={entriesFor('plot-segue')} onEntriesChange={setEntriesFor('plot-segue')} campaignContext={campaignContext} onAddToCampaign={addFor('plot-segue')} disabledDests={disabledDestsByKind?.['plot-segue']} />;
      case 'names': return renderNames();
      case 'locations': return renderLocations();
      default: return null;
    }
  }, [active, entriesFor, setEntriesFor, renderNames, renderLocations, campaignContext, addFor, disabledDestsByKind]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded border border-rule bg-parchment p-3 shadow-card">
        <Sparkles size={14} className="text-crimson" />
        <h3 className="font-display tracking-wide text-ink">Generators</h3>
        <span className="ml-1 text-[10px] italic text-ink-mute">G focuses · R reroll · E enhance (Pro)</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <aside data-generators-sidebar tabIndex={-1} className="rounded border border-rule bg-parchment p-2 shadow-card outline-none">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <div className="px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">{group.label}</div>
              <div className="flex flex-col">
                {group.entries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.slug}
                      onClick={() => setActive(entry.slug)}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 font-serif text-sm transition-colors ${active === entry.slug ? 'bg-crimson text-parchment' : 'text-ink hover:bg-parchment-deep'}`}
                    >
                      <Icon size={14} /> {entry.label}
                      {entry.gated && <span className="ml-auto text-[9px] uppercase tracking-wider opacity-70">Pro</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <div className="min-w-0 space-y-3">
          {ActiveComponent}
        </div>
      </div>
    </div>
  );
}
