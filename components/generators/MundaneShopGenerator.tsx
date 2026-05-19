'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateMundaneShop } from '@/lib/generators/mundane-shop';
import { SHOP_TYPES, type ShopType } from '@/lib/generators/tables/shop-tables';
import type { MundaneShopResult, SettlementSizeClass } from '@/lib/generators/types';

const SETTLEMENT_OPTIONS: { value: SettlementSizeClass; label: string }[] = [
  { value: 'thorp', label: 'Thorp (≤20)' },
  { value: 'hamlet', label: 'Hamlet (21–60)' },
  { value: 'village', label: 'Village (61–200)' },
  { value: 'town', label: 'Town (201–2,000)' },
  { value: 'small city', label: 'Small City (2,001–10,000)' },
  { value: 'large city', label: 'Large City (10,001–25,000)' },
  { value: 'metropolis', label: 'Metropolis (>25,000)' },
];

const INPUTS: InputSpec[] = [
  {
    kind: 'select', key: 'shopType', label: 'Shop Type', default: 'general store',
    options: SHOP_TYPES.map((s) => ({ value: s, label: s.replace(/^./, (c) => c.toUpperCase()) })),
  },
  {
    kind: 'select', key: 'settlementSize', label: 'Settlement Size', default: 'town',
    options: SETTLEMENT_OPTIONS,
  },
];

export default function MundaneShopGenerator({
  onSave,
}: {
  onSave?: (result: MundaneShopResult) => Promise<void>;
}) {
  return (
    <GeneratorPanel<{ shopType: string; settlementSize: string }, MundaneShopResult>
      title="Mundane Shop"
      description="Roll a small-town shop: name, owner, inventory keyed to settlement size, with price markup for scarcity. Save creates a Location (subtype: shop) and a minor NPC for the owner."
      inputs={INPUTS}
      generate={(inputs, rng) =>
        generateMundaneShop({
          shopType: inputs.shopType as ShopType,
          settlementSize: inputs.settlementSize as SettlementSizeClass,
        }, rng)
      }
      enhance={{ kind: 'mundane-shop' }}
      onSave={onSave}
      renderResult={(r) => (
        <div className="space-y-3 font-serif text-sm text-ink">
          <div>
            <div className="font-display tracking-wide text-base">{r.shopName}</div>
            <div className="text-xs text-ink-mute italic">
              {r.inputs.shopType} · {r.inputs.settlementSize} · {r.hours}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Owner</div>
            <div>{r.owner.name} — <span className="italic text-ink-soft">{r.owner.descriptor}</span></div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Inventory</div>
            <ul className="space-y-1 mt-1">
              {r.inventory.map((it, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b border-rule/40 pb-1">
                  <span>{it.name}{it.note ? <span className="italic text-ink-soft"> — {it.note}</span> : null}</span>
                  <span className="text-xs text-brass-deep font-display tracking-wider">{it.price}</span>
                </li>
              ))}
            </ul>
          </div>
          {r.rumor && (
            <div className="border-t border-rule pt-2 text-xs italic text-ink-soft">Rumor: {r.rumor}</div>
          )}
        </div>
      )}
    />
  );
}
