'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateSettlement } from '@/lib/generators/settlement';
import type { CampaignContext, SettlementResult, SettlementSizeClass } from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';

const SIZE_OPTIONS: { value: SettlementSizeClass; label: string }[] = [
  { value: 'thorp', label: 'Thorp (≤20)' },
  { value: 'hamlet', label: 'Hamlet (21–60)' },
  { value: 'village', label: 'Village (61–200)' },
  { value: 'town', label: 'Town (201–2,000)' },
  { value: 'small city', label: 'Small City (2,001–10,000)' },
  { value: 'large city', label: 'Large City (10,001–25,000)' },
  { value: 'metropolis', label: 'Metropolis (>25,000)' },
];

const GOVERNMENT_OPTIONS = [
  { value: 'random', label: 'Roll randomly' },
  { value: 'monarchy', label: 'Monarchy' },
  { value: 'council', label: 'Council' },
  { value: 'theocracy', label: 'Theocracy' },
  { value: 'oligarchy', label: 'Oligarchy' },
];

const INPUTS: InputSpec[] = [
  { kind: 'select', key: 'sizeClass', label: 'Size Class', default: 'town', options: SIZE_OPTIONS },
  { kind: 'text', key: 'region', label: 'Region (optional)', default: '', placeholder: 'e.g. "Whetstone Coast"' },
  { kind: 'select', key: 'government', label: 'Government', default: 'random', options: GOVERNMENT_OPTIONS },
];

function copyText(r: SettlementResult): string {
  const lines: string[] = [
    r.name,
    `${r.details.sizeClass} · pop. ${r.details.population.toLocaleString()}${r.details.region ? ` · ${r.details.region}` : ''}`,
    `Government: ${r.details.government}`,
    `Economy: ${r.details.economy}`,
    'Notables:',
    ...r.details.notables.map(n => `  - ${n.name} — ${n.role}`),
    'Hooks:',
    ...r.details.hooks.map(h => `  - ${h}`),
  ];
  if (r.currentSituation) lines.push(`\n${r.currentSituation}`);
  return lines.join('\n');
}

export default function SettlementGenerator({
  entries,
  onEntriesChange,
  campaignContext,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
}) {
  return (
    <GeneratorPanel<{ sizeClass: string; region: string; government: string }, SettlementResult>
      title="Settlement"
      description="Generate a settlement with population, government, economy, notable NPCs, and 2–3 hooks."
      inputs={INPUTS}
      generate={(inputs, rng) =>
        generateSettlement(
          {
            sizeClass: inputs.sizeClass as SettlementSizeClass,
            region: inputs.region as string,
            government: inputs.government as string,
          },
          rng,
        )
      }
      enhance={{ kind: 'settlement' }}
      campaignContext={campaignContext}
      log={{
        kind: 'settlement',
        entries,
        onEntriesChange,
        titleFor: (r) => r.name,
        copyText,
      }}
      renderResult={(r) => (
        <div className="space-y-3 font-serif text-sm text-ink">
          <div>
            <div className="font-display tracking-wide text-base">{r.name}</div>
            <div className="text-xs text-ink-mute italic">
              {r.details.sizeClass} · pop. {r.details.population.toLocaleString()}{r.details.region ? ` · ${r.details.region}` : ''}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Government</div>
              <div>{r.details.government}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Economy</div>
              <div>{r.details.economy}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Notables</div>
            <ul className="space-y-1 mt-1">
              {r.details.notables.map((n, i) => (
                <li key={i}>
                  <span className="font-display tracking-wide">{n.name}</span> — <span className="italic text-ink-soft">{n.role}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Hooks</div>
            <ul className="list-disc ml-5 space-y-1">
              {r.details.hooks.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
          {r.currentSituation && (
            <div className="border-t border-rule pt-2 italic text-ink-soft">{r.currentSituation}</div>
          )}
        </div>
      )}
    />
  );
}
