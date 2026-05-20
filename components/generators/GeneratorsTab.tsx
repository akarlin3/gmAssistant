'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Coins, Gem, Shirt, Sparkles, Beer, MountainSnow, MapPinned, Map, ScrollText, Wand2 } from 'lucide-react';
import type { CampaignContext, GeneratorKind } from '@/lib/generators/types';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import TreasureHoardGenerator from './TreasureHoardGenerator';
import TrinketGenerator from './TrinketGenerator';
import MundaneShopGenerator from './MundaneShopGenerator';
import MagicShopGenerator from './MagicShopGenerator';
import TavernGenerator from './TavernGenerator';
import DungeonGenerator from './DungeonGenerator';
import SettlementGenerator from './SettlementGenerator';

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
      { slug: 'dungeon', label: 'Dungeons', icon: MountainSnow },
      { slug: 'settlement', label: 'Settlements', icon: MapPinned },
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
}: {
  logs: GeneratorLogs;
  onLogsChange: (next: GeneratorLogs) => void;
  campaignContext?: CampaignContext;
  renderNames: () => React.ReactNode;
  renderLocations: () => React.ReactNode;
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

  const ActiveComponent = useMemo(() => {
    switch (active) {
      case 'treasure-hoard':
        return <TreasureHoardGenerator entries={entriesFor('treasure-hoard')} onEntriesChange={setEntriesFor('treasure-hoard')} campaignContext={campaignContext} />;
      case 'trinket':
        return <TrinketGenerator entries={entriesFor('trinket')} onEntriesChange={setEntriesFor('trinket')} campaignContext={campaignContext} />;
      case 'mundane-shop':
        return <MundaneShopGenerator entries={entriesFor('mundane-shop')} onEntriesChange={setEntriesFor('mundane-shop')} campaignContext={campaignContext} />;
      case 'magic-shop':
        return <MagicShopGenerator entries={entriesFor('magic-shop')} onEntriesChange={setEntriesFor('magic-shop')} campaignContext={campaignContext} />;
      case 'tavern':
        return <TavernGenerator entries={entriesFor('tavern')} onEntriesChange={setEntriesFor('tavern')} campaignContext={campaignContext} />;
      case 'dungeon':
        return <DungeonGenerator entries={entriesFor('dungeon')} onEntriesChange={setEntriesFor('dungeon')} campaignContext={campaignContext} />;
      case 'settlement':
        return <SettlementGenerator entries={entriesFor('settlement')} onEntriesChange={setEntriesFor('settlement')} campaignContext={campaignContext} />;
      case 'names': return renderNames();
      case 'locations': return renderLocations();
      default: return null;
    }
  }, [active, entriesFor, setEntriesFor, renderNames, renderLocations, campaignContext]);

  return (
    <div className="space-y-3">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card flex items-center gap-2 flex-wrap">
        <Sparkles size={14} className="text-crimson" />
        <h3 className="font-display tracking-wide text-ink">Generators</h3>
        <span className="text-[10px] text-ink-mute italic ml-1">G focuses · R reroll · E enhance (Pro)</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)] gap-3">
        <aside data-generators-sidebar tabIndex={-1} className="rounded border border-rule bg-parchment p-2 shadow-card outline-none">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display px-2 py-1">{group.label}</div>
              <div className="flex flex-col">
                {group.entries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.slug}
                      onClick={() => setActive(entry.slug)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm font-serif transition-colors ${active === entry.slug ? 'bg-crimson text-parchment' : 'text-ink hover:bg-parchment-deep'}`}
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

        <div className="space-y-3 min-w-0">
          {ActiveComponent}
        </div>
      </div>
    </div>
  );
}
