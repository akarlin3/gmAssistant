'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateTrinkets } from '@/lib/generators/trinket';
import type { TrinketResult } from '@/lib/generators/types';

const INPUTS: InputSpec[] = [
  { kind: 'number', key: 'count', label: 'How many', min: 1, max: 10, default: 1 },
];

export default function TrinketGenerator({
  onSave,
}: {
  onSave?: (result: TrinketResult) => Promise<void>;
}) {
  return (
    <GeneratorPanel<{ count: number }, TrinketResult>
      title="Trinkets"
      description="Roll one to ten odd, evocative trinkets from a hundred-entry original table. Save each as an Item (category: trinket)."
      inputs={INPUTS}
      generate={(inputs, rng) => generateTrinkets({ count: inputs.count }, rng)}
      enhance={{ kind: 'trinket' }}
      onSave={onSave}
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
