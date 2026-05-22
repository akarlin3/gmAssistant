'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateMagicShop } from '@/lib/generators/magic-shop';
import type { MagicShopArchetype } from '@/lib/generators/tables/shop-tables';
import type { CampaignContext, ItemRarity, MagicShopResult, SettlementSizeClass } from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const SETTLEMENT_OPTIONS: { value: SettlementSizeClass; label: string }[] = [
  { value: 'thorp', label: 'Thorp' },
  { value: 'hamlet', label: 'Hamlet' },
  { value: 'village', label: 'Village' },
  { value: 'town', label: 'Town' },
  { value: 'small city', label: 'Small City' },
  { value: 'large city', label: 'Large City' },
  { value: 'metropolis', label: 'Metropolis' },
];

const RARITY_OPTIONS: { value: Exclude<ItemRarity, 'mundane'>; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'very rare', label: 'Very Rare' },
  { value: 'legendary', label: 'Legendary' },
];

const ARCHETYPE_OPTIONS: { value: MagicShopArchetype; label: string }[] = [
  { value: 'curio shop', label: 'Curio Shop (markup +20%)' },
  { value: 'hedge wizard', label: 'Hedge Wizard (markup +50%)' },
  { value: 'black market', label: 'Black Market (discount, no questions)' },
  { value: 'temple', label: 'Temple (fair-market offerings)' },
];

const INPUTS: InputSpec[] = [
  { kind: 'select', key: 'archetype', label: 'Shop Archetype', default: 'curio shop', options: ARCHETYPE_OPTIONS },
  { kind: 'select', key: 'maxRarity', label: 'Max Rarity', default: 'rare', options: RARITY_OPTIONS },
  { kind: 'select', key: 'settlementSize', label: 'Settlement Size', default: 'small city', options: SETTLEMENT_OPTIONS },
];

function copyText(r: MagicShopResult): string {
  return [
    r.shopName,
    `${r.inputs.archetype} · ${r.inputs.settlementSize}`,
    `Proprietor: ${r.owner.name} — ${r.owner.descriptor}`,
    'Inventory:',
    ...r.inventory.map(it => `  - ${it.name} [${it.rarity}] — ${it.price}${it.note ? ` (${it.note})` : ''}`),
  ].join('\n');
}

export default function MagicShopGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  saveToCampaign,
  onAddToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  saveToCampaign?: { label?: string; onSave: (result: MagicShopResult) => void };
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  return (
    <GeneratorPanel<{ archetype: string; maxRarity: string; settlementSize: string }, MagicShopResult>
      title="Magic Item Shop"
      description="Generate a shop trading in magic items, filtered by settlement scarcity and tier cap."
      inputs={INPUTS}
      generate={(inputs, rng) =>
        generateMagicShop(
          {
            archetype: inputs.archetype as MagicShopArchetype,
            maxRarity: inputs.maxRarity as Exclude<ItemRarity, 'mundane'>,
            settlementSize: inputs.settlementSize as SettlementSizeClass,
          },
          rng,
        )
      }
      enhance={{ kind: 'magic-shop' }}
      campaignContext={campaignContext}
      saveToCampaign={saveToCampaign}
      onAddToCampaign={onAddToCampaign}
      log={{
        kind: 'magic-shop',
        entries,
        onEntriesChange,
        titleFor: (r) => r.shopName,
        copyText,
      }}
      renderResult={(r) => (
        <div className="space-y-3 font-serif text-sm text-ink">
          <div>
            <div className="font-display text-base tracking-wide">{r.shopName}</div>
            <div className="text-xs italic text-ink-mute">{r.inputs.archetype} · {r.inputs.settlementSize}</div>
          </div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Proprietor</div>
            <div>{r.owner.name} — <span className="italic text-ink-soft">{r.owner.descriptor}</span></div>
          </div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Inventory</div>
            <ul className="mt-1 space-y-2">
              {r.inventory.map((it, i) => (
                <li key={i} className="border-l-2 border-crimson/40 pl-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display tracking-wide">{it.name}</span>
                    <span className="font-display text-xs tracking-wider text-brass-deep">{it.price}</span>
                  </div>
                  <div className="text-[10px] uppercase text-ink-mute">{it.rarity}</div>
                  {it.note && <div className="mt-0.5 text-xs italic text-ink-soft">{it.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    />
  );
}
