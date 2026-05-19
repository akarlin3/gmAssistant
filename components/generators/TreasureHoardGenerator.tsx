'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTreasureHoard } from '@/lib/generators/treasure-hoard';
import type { TreasureHoardResult } from '@/lib/generators/types';
import type { CrTier, HoardType } from '@/lib/generators/tables/treasure-hoard-tables';
import type { LogEntry } from '@/lib/generators/log';

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
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
}) {
  return (
    <GeneratorPanel<{ crTier: string; hoardType: string }, TreasureHoardResult>
      title="Treasure Hoard"
      description="Roll a tiered hoard of coins, gems, art objects, and (for full hoards) magic items."
      inputs={INPUTS}
      generate={(inputs, rng) => generateTreasureHoard({ crTier: inputs.crTier as CrTier, hoardType: inputs.hoardType as HoardType }, rng)}
      enhance={{ kind: 'treasure-hoard' }}
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
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Coins</div>
            <div>{formatCoins(r.coins)}</div>
          </div>
          {r.gems.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Gems</div>
              <ul className="list-disc ml-5">
                {r.gems.map((g, i) => <li key={i}>{g.name} <span className="text-ink-mute italic">— {g.value} gp</span></li>)}
              </ul>
            </div>
          )}
          {r.artObjects.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Art Objects</div>
              <ul className="list-disc ml-5">
                {r.artObjects.map((a, i) => <li key={i}>{a.name} <span className="text-ink-mute italic">— {a.value} gp</span></li>)}
              </ul>
            </div>
          )}
          {r.magicItems.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Magic Items</div>
              <ul className="space-y-1.5 mt-1">
                {r.magicItems.map((mi, i) => (
                  <li key={i} className="border-l-2 border-crimson/40 pl-2">
                    <div><span className="font-display tracking-wide">{mi.name}</span> <span className="text-[10px] uppercase text-ink-mute">{mi.rarity}</span></div>
                    {mi.note && <div className="text-xs text-ink-soft italic">{mi.note}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.enhancementNote && (
            <p className="text-xs text-ink-soft italic border-t border-rule pt-2">{r.enhancementNote}</p>
          )}
        </div>
      )}
    />
  );
}
