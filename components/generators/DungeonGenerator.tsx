'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generateDungeon } from '@/lib/generators/dungeon';
import type { DungeonChallengeTier, DungeonSize, DungeonTheme } from '@/lib/generators/tables/dungeon-tables';
import type { DungeonResult } from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';

const SIZE_OPTIONS: { value: DungeonSize; label: string }[] = [
  { value: 'small', label: 'Small (5 rooms)' },
  { value: 'medium', label: 'Medium (10 rooms)' },
  { value: 'large', label: 'Large (20 rooms)' },
  { value: 'sprawling', label: 'Sprawling (40 rooms)' },
];

const THEME_OPTIONS: { value: DungeonTheme; label: string }[] = [
  { value: 'ruin', label: 'Ruin' },
  { value: 'lair', label: 'Lair' },
  { value: 'tomb', label: 'Tomb' },
  { value: 'stronghold', label: 'Stronghold' },
  { value: 'temple', label: 'Temple' },
  { value: 'cave', label: 'Cave' },
  { value: 'sewer', label: 'Sewer' },
];

const TIER_OPTIONS: { value: DungeonChallengeTier; label: string }[] = [
  { value: '0-4', label: 'CR 0–4' },
  { value: '5-10', label: 'CR 5–10' },
  { value: '11-16', label: 'CR 11–16' },
  { value: '17+', label: 'CR 17+' },
];

const INPUTS: InputSpec[] = [
  { kind: 'select', key: 'size', label: 'Size', default: 'medium', options: SIZE_OPTIONS },
  { kind: 'select', key: 'theme', label: 'Theme', default: 'ruin', options: THEME_OPTIONS },
  { kind: 'select', key: 'challengeTier', label: 'Challenge Tier', default: '5-10', options: TIER_OPTIONS },
];

function copyText(r: DungeonResult): string {
  const lines: string[] = [
    r.name,
    `${r.inputs.theme} · ${r.inputs.size} · CR ${r.inputs.challengeTier}`,
  ];
  if (r.hook) lines.push(`\n${r.hook}`);
  if (r.details.hazards.length) lines.push('\nHazards:', ...r.details.hazards.map(h => `  - ${h}`));
  if (r.details.inhabitants.length) lines.push('\nInhabitants:', ...r.details.inhabitants.map(h => `  - ${h}`));
  lines.push(`\nRooms (${r.details.rooms.length}):`);
  for (const rm of r.details.rooms) {
    lines.push(`  ${rm.index}. ${rm.name}`);
    lines.push(`     ${rm.contents}`);
    lines.push(`     ${rm.dressing}`);
  }
  return lines.join('\n');
}

export default function DungeonGenerator({
  entries,
  onEntriesChange,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
}) {
  return (
    <GeneratorPanel<{ size: string; theme: string; challengeTier: string }, DungeonResult>
      title="Dungeon"
      description="Generate a dungeon by size, theme, and challenge tier: rooms with contents and dressing, hazards, and theme-keyed inhabitants."
      inputs={INPUTS}
      generate={(inputs, rng) =>
        generateDungeon({
          size: inputs.size as DungeonSize,
          theme: inputs.theme as DungeonTheme,
          challengeTier: inputs.challengeTier as DungeonChallengeTier,
        }, rng)
      }
      enhance={{ kind: 'dungeon' }}
      log={{
        kind: 'dungeon',
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
              {r.inputs.theme} · {r.inputs.size} · CR {r.inputs.challengeTier}
            </div>
          </div>
          {r.hook && (
            <p className="italic text-ink-soft border-l-2 border-crimson/40 pl-2">{r.hook}</p>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Hazards</div>
            <ul className="list-disc ml-5">
              {r.details.hazards.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Inhabitants</div>
            <ul className="list-disc ml-5">
              {r.details.inhabitants.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-brass-deep font-display">Rooms ({r.details.rooms.length})</div>
            <ol className="space-y-1.5 mt-1 list-decimal ml-5">
              {r.details.rooms.map((rm) => (
                <li key={rm.index}>
                  <div className="font-display tracking-wide">{rm.name}</div>
                  <div>{rm.contents}</div>
                  <div className="text-xs text-ink-soft italic">{rm.dressing}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    />
  );
}
