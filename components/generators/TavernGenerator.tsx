'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTavern } from '@/lib/generators/tavern';
import type { TavernVibe } from '@/lib/generators/tables/tavern-tables';
import type { CampaignContext, SettlementSizeClass, TavernResult } from '@/lib/generators/types';
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

const VIBE_OPTIONS: { value: TavernVibe; label: string }[] = [
  { value: 'rough', label: 'Rough' },
  { value: 'cozy', label: 'Cozy' },
  { value: 'upscale', label: 'Upscale' },
  { value: 'seedy', label: 'Seedy' },
  { value: 'themed', label: 'Themed (use keyword below)' },
];

const INPUTS: InputSpec[] = [
  { kind: 'select', key: 'vibe', label: 'Vibe', default: 'cozy', options: VIBE_OPTIONS },
  { kind: 'select', key: 'settlementSize', label: 'Settlement Size', default: 'town', options: SETTLEMENT_OPTIONS },
  { kind: 'text', key: 'themeKeyword', label: 'Theme Keyword (optional)', default: '', placeholder: 'e.g. "Mended"' },
];

function copyText(r: TavernResult): string {
  const lines: string[] = [
    r.name,
    `${r.inputs.vibe} · ${r.inputs.settlementSize}`,
    r.details.atmosphere,
    `Owner: ${r.details.owner.name} — ${r.details.owner.descriptor}`,
    'Menu:',
    ...r.details.menu.map(m => `  - ${m.name} (${m.kind}) — ${m.price}`),
    'Patrons:',
    ...r.details.patrons.map(p => `  - ${p.name} — ${p.descriptor}`),
    'Rumors:',
    ...r.details.rumors.map(rm => `  - ${rm}`),
  ];
  return lines.join('\n');
}

export default function TavernGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  saveToCampaign,
  onAddToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  saveToCampaign?: { label?: string; onSave: (result: TavernResult) => void };
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  return (
    <GeneratorPanel<{ vibe: string; settlementSize: string; themeKeyword: string }, TavernResult>
      title="Tavern"
      description="Generate a full tavern: name, atmosphere, menu priced to settlement size and vibe, patrons, rumors, and an owner."
      inputs={INPUTS}
      generate={(inputs, rng) =>
        generateTavern(
          {
            settlementSize: inputs.settlementSize as SettlementSizeClass,
            vibe: inputs.vibe as TavernVibe,
            themeKeyword: inputs.themeKeyword || undefined,
          },
          rng,
        )
      }
      enhance={{ kind: 'tavern' }}
      campaignContext={campaignContext}
      saveToCampaign={saveToCampaign}
      onAddToCampaign={onAddToCampaign}
      log={{
        kind: 'tavern',
        entries,
        onEntriesChange,
        titleFor: (r) => r.name,
        copyText,
      }}
      renderResult={(r) => (
        <div className="space-y-3 font-serif text-sm text-ink">
          <div>
            <div className="font-display text-base tracking-wide">{r.name}</div>
            <div className="text-xs italic text-ink-mute">{r.inputs.vibe} · {r.inputs.settlementSize}</div>
          </div>
          <div className="italic text-ink-soft">{r.details.atmosphere}</div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Owner</div>
            <div>{r.details.owner.name} — <span className="italic text-ink-soft">{r.details.owner.descriptor}</span></div>
          </div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Menu</div>
            <ul className="mt-1 space-y-1">
              {r.details.menu.map((m, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b border-rule/40 pb-1">
                  <span>{m.name}<span className="ml-1 text-[10px] uppercase text-ink-mute">({m.kind})</span></span>
                  <span className="font-display text-xs tracking-wider text-brass-deep">{m.price}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Patrons</div>
            <ul className="mt-1 space-y-1.5">
              {r.details.patrons.map((p, i) => (
                <li key={i}>
                  <span className="font-display tracking-wide">{p.name}</span> — <span className="italic text-ink-soft">{p.descriptor}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Rumors</div>
            <ul className="ml-5 list-disc space-y-1">
              {r.details.rumors.map((rm, i) => <li key={i}>{rm}</li>)}
            </ul>
          </div>
        </div>
      )}
    />
  );
}
