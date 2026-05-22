'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTrinkets } from '@/lib/generators/trinket';
import type { CampaignContext, TrinketResult } from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const INPUTS: InputSpec[] = [
  { kind: 'number', key: 'count', label: 'How many', min: 1, max: 10, default: 1 },
];

function copyText(r: TrinketResult): string {
  return r.trinkets
    .map((t, i) => `${i + 1}. ${t.description}${t.hook ? `\n   Hook: ${t.hook}` : ''}`)
    .join('\n');
}

export default function TrinketGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  saveToCampaign,
  onAddToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  saveToCampaign?: { label?: string; onSave: (result: TrinketResult) => void };
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  return (
    <GeneratorPanel<{ count: number }, TrinketResult>
      title="Trinkets"
      description="Roll one to ten odd, evocative trinkets from a hundred-entry original table."
      inputs={INPUTS}
      generate={(inputs, rng) => generateTrinkets({ count: inputs.count }, rng)}
      enhance={{ kind: 'trinket' }}
      campaignContext={campaignContext}
      saveToCampaign={saveToCampaign}
      onAddToCampaign={onAddToCampaign}
      log={{
        kind: 'trinket',
        entries,
        onEntriesChange,
        titleFor: (r) => `${r.trinkets.length} trinket${r.trinkets.length === 1 ? '' : 's'}`,
        copyText,
      }}
      renderResult={(r) => (
        <ol className="ml-5 list-decimal space-y-2 font-serif text-sm text-ink">
          {r.trinkets.map((t, i) => (
            <li key={i}>
              <div>{t.description}</div>
              {t.hook && <div className="mt-0.5 text-xs italic text-ink-soft">Hook: {t.hook}</div>}
            </li>
          ))}
        </ol>
      )}
    />
  );
}
