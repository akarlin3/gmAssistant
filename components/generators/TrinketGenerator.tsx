'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTrinkets } from '@/lib/generators/trinket';
import type { CampaignContext, TrinketResult } from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';

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
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
}) {
  return (
    <GeneratorPanel<{ count: number }, TrinketResult>
      title="Trinkets"
      description="Roll one to ten odd, evocative trinkets from a hundred-entry original table."
      inputs={INPUTS}
      generate={(inputs, rng) => generateTrinkets({ count: inputs.count }, rng)}
      enhance={{ kind: 'trinket' }}
      campaignContext={campaignContext}
      log={{
        kind: 'trinket',
        entries,
        onEntriesChange,
        titleFor: (r) => `${r.trinkets.length} trinket${r.trinkets.length === 1 ? '' : 's'}`,
        copyText,
      }}
      renderResult={(r) => (
        <ol className="space-y-2 list-decimal ml-5 font-serif text-sm text-ink">
          {r.trinkets.map((t, i) => (
            <li key={i}>
              <div>{t.description}</div>
              {t.hook && <div className="text-xs text-ink-soft italic mt-0.5">Hook: {t.hook}</div>}
            </li>
          ))}
        </ol>
      )}
    />
  );
}
