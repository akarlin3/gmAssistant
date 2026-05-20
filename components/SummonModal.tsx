'use client';

import { useEffect } from 'react';
import { X, Wand2 } from 'lucide-react';
import TavernGenerator from './generators/TavernGenerator';
import DungeonGenerator from './generators/DungeonGenerator';
import SettlementGenerator from './generators/SettlementGenerator';
import MundaneShopGenerator from './generators/MundaneShopGenerator';
import MagicShopGenerator from './generators/MagicShopGenerator';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import type {
  CampaignContext,
  DungeonResult,
  GeneratorResult,
  MagicShopResult,
  MundaneShopResult,
  SettlementResult,
  TavernResult,
} from '@/lib/generators/types';
import type { GeneratorMeta, PrepSection, SummonableKind } from '@/lib/generators/sectionMap';

type Props = {
  section: PrepSection;
  generator: GeneratorMeta;
  onClose: () => void;
  onSave: (result: GeneratorResult) => void;
  campaignContext?: CampaignContext;
  logs: GeneratorLogs;
  setLogEntries: (kind: LogKind) => (next: LogEntry[]) => void;
};

const SECTION_LABEL: Record<PrepSection, string> = {
  locations: 'Fantastic Locations',
  npcs: 'Important NPCs',
  magicItems: 'Magic Item Rewards',
  monsters: 'Relevant Monsters',
};

export default function SummonModal({
  section,
  generator,
  onClose,
  onSave,
  campaignContext,
  logs,
  setLogEntries,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const entriesFor = (k: LogKind): LogEntry[] => logs[k] ?? [];

  // The Save-to-Campaign click triggers onSave then we close the modal —
  // letting the parent commit data, scroll, and surface a toast.
  const wrap = <R extends GeneratorResult>(handler: (r: R) => void) => ({
    onSave: (r: R) => {
      handler(r);
      onClose();
    },
  });

  const inner = renderGenerator(
    generator.kind,
    entriesFor,
    setLogEntries,
    campaignContext,
    wrap(onSave),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Summon ${generator.label}`}
    >
      <div
        className="bg-parchment border border-rule shadow-page rounded-none sm:rounded w-full sm:max-w-2xl max-h-full sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 p-3 border-b border-rule bg-parchment-deep/40">
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 size={14} className="text-crimson flex-shrink-0" />
            <h2 className="font-display tracking-wide text-ink text-sm truncate">
              Summon — {generator.label}
            </h2>
            <span className="hidden sm:inline text-[10px] text-ink-mute italic font-serif truncate">
              into {SECTION_LABEL[section]}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-mute hover:text-crimson p-1"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">{inner}</div>
      </div>
    </div>
  );
}

function renderGenerator(
  kind: SummonableKind,
  entriesFor: (k: LogKind) => LogEntry[],
  setLogEntries: (k: LogKind) => (next: LogEntry[]) => void,
  campaignContext: CampaignContext | undefined,
  save: { onSave: (r: GeneratorResult) => void },
): React.ReactNode {
  switch (kind) {
    case 'tavern':
      return (
        <TavernGenerator
          entries={entriesFor('tavern')}
          onEntriesChange={setLogEntries('tavern')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: TavernResult) => save.onSave(r) }}
        />
      );
    case 'dungeon':
      return (
        <DungeonGenerator
          entries={entriesFor('dungeon')}
          onEntriesChange={setLogEntries('dungeon')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: DungeonResult) => save.onSave(r) }}
        />
      );
    case 'settlement':
      return (
        <SettlementGenerator
          entries={entriesFor('settlement')}
          onEntriesChange={setLogEntries('settlement')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: SettlementResult) => save.onSave(r) }}
        />
      );
    case 'mundane-shop':
      return (
        <MundaneShopGenerator
          entries={entriesFor('mundane-shop')}
          onEntriesChange={setLogEntries('mundane-shop')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: MundaneShopResult) => save.onSave(r) }}
        />
      );
    case 'magic-shop':
      return (
        <MagicShopGenerator
          entries={entriesFor('magic-shop')}
          onEntriesChange={setLogEntries('magic-shop')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: MagicShopResult) => save.onSave(r) }}
        />
      );
    // Treasure/Trinket would be wired here once items prep rendering is reworked.
    case 'treasure-hoard':
    case 'trinket':
      return (
        <div className="text-sm text-ink-soft italic font-serif">
          This generator isn&apos;t wired into Summon yet.
        </div>
      );
  }
}
