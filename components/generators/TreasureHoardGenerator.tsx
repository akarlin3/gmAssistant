'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTreasureHoard } from '@/lib/generators/treasure-hoard';
import type { CampaignContext, TreasureHoardResult } from '@/lib/generators/types';
import type { CrTier, HoardType } from '@/lib/generators/tables/treasure-hoard-tables';
import type { LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const INPUTS: InputSpec[] = [
  {
    kind: 'select', key: 'crTier', label: 'Challenge Tier', default: '5-10',
    options: [
      { value: '0-4', label: 'CR 0–4 (apprentice)' },
      { value: '5-10', label: 'CR 5–10 (journeyman)' },
      { value: '11-16', label: 'CR 11–16 (master)' },
      { value: '17+', label: 'CR 17+ (legendary)' },
    ],
  },
  {
    kind: 'select', key: 'hoardType', label: 'Hoard Type', default: 'Treasure Hoard',
    options: [
      { value: 'Individual Treasure', label: 'Individual Treasure (coins only)' },
      { value: 'Treasure Hoard', label: 'Treasure Hoard (coins + gems + magic)' },
    ],
  },
];

function formatCoins(c: TreasureHoardResult['coins']): string {
  const parts = (['pp', 'gp', 'ep', 'sp', 'cp'] as const)
    .map((k) => (c[k] > 0 ? `${c[k].toLocaleString()} ${k}` : ''))
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : 'no coin';
}

function copyText(r: TreasureHoardResult): string {
  const lines = [`Treasure Hoard (CR ${r.inputs.crTier})`, `Coins: ${formatCoins(r.coins)}`];
  if (r.gems.length) lines.push(`Gems: ${r.gems.map(g => `${g.name} (${g.value} gp)`).join('; ')}`);
  if (r.artObjects.length) lines.push(`Art: ${r.artObjects.map(a => `${a.name} (${a.value} gp)`).join('; ')}`);
  if (r.magicItems.length) lines.push(`Magic Items:\n${r.magicItems.map(mi => `  - ${mi.name} (${mi.rarity})${mi.note ? ` — ${mi.note}` : ''}`).join('\n')}`);
  if (r.enhancementNote) lines.push(`\n${r.enhancementNote}`);
  return lines.join('\n');
}

export default function TreasureHoardGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  saveToCampaign,
  onAddToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  saveToCampaign?: { label?: string; onSave: (result: TreasureHoardResult) => void };
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  return (
    <GeneratorPanel<{ crTier: string; hoardType: string }, TreasureHoardResult>
      title="Treasure Hoard"
      description="Roll a tiered hoard of coins, gems, art objects, and (for full hoards) magic items."
      inputs={INPUTS}
      generate={(inputs, rng) => generateTreasureHoard({ crTier: inputs.crTier as CrTier, hoardType: inputs.hoardType as HoardType }, rng)}
      enhance={{ kind: 'treasure-hoard' }}
      campaignContext={campaignContext}
      saveToCampaign={saveToCampaign}
      onAddToCampaign={onAddToCampaign}
      log={{
        kind: 'treasure-hoard',
        entries,
        onEntriesChange,
        titleFor: (r) => `${r.inputs.hoardType} (CR ${r.inputs.crTier})`,
        copyText,
      }}
      renderResult={(r) => (
        <div className="space-y-3 font-serif text-sm text-ink">
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Coins</div>
            <div>{formatCoins(r.coins)}</div>
          </div>
          {r.gems.length > 0 && (
            <div>
              <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Gems</div>
              <ul className="ml-5 list-disc">
                {r.gems.map((g, i) => <li key={i}>{g.name} <span className="italic text-ink-mute">— {g.value} gp</span></li>)}
              </ul>
            </div>
          )}
          {r.artObjects.length > 0 && (
            <div>
              <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Art Objects</div>
              <ul className="ml-5 list-disc">
                {r.artObjects.map((a, i) => <li key={i}>{a.name} <span className="italic text-ink-mute">— {a.value} gp</span></li>)}
              </ul>
            </div>
          )}
          {r.magicItems.length > 0 && (
            <div>
              <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Magic Items</div>
              <ul className="mt-1 space-y-1.5">
                {r.magicItems.map((mi, i) => (
                  <li key={i} className="border-l-2 border-crimson/40 pl-2">
                    <div><span className="font-display tracking-wide">{mi.name}</span> <span className="text-[10px] uppercase text-ink-mute">{mi.rarity}</span></div>
                    {mi.note && <div className="text-xs italic text-ink-soft">{mi.note}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.enhancementNote && (
            <p className="border-t border-rule pt-2 text-xs italic text-ink-soft">{r.enhancementNote}</p>
          )}
        </div>
      )}
    />
  );
}
