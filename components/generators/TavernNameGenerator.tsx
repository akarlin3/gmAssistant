'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTavernNames } from '@/lib/generators/tavern-name';
import type { TavernNameResult } from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const INPUTS: InputSpec[] = [
  { kind: 'number', key: 'count', label: 'How many', min: 1, max: 20, default: 6 },
];

function copyText(r: TavernNameResult): string {
  return r.names.map((n, i) => `${i + 1}. ${n}`).join('\n');
}

export default function TavernNameGenerator({
  entries,
  onEntriesChange,
  onAddToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  return (
    <GeneratorPanel<{ count: number }, TavernNameResult>
      title="Tavern Names"
      description="Pull up to twenty tavern, inn, and alehouse names from a curated list of 300+ originals — no recombination, no AI, just hand-picked signage."
      inputs={INPUTS}
      generate={(inputs, rng) => generateTavernNames({ count: inputs.count }, rng)}
      onAddToCampaign={onAddToCampaign}
      log={{
        kind: 'tavern-name',
        entries,
        onEntriesChange,
        titleFor: (r) => `${r.names.length} tavern name${r.names.length === 1 ? '' : 's'}`,
        copyText,
      }}
      renderResult={(r) => (
        <ol className="ml-5 list-decimal space-y-1 font-serif text-sm text-ink">
          {r.names.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ol>
      )}
    />
  );
}
