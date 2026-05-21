'use client';

import { AIGeneratorPanel } from './AIGeneratorPanel';
import type { InputSpec } from './GeneratorPanel';
import { generatePlotSegues } from '@/lib/generators/plot-segue';
import type {
  CampaignContext,
  PlotSegueResult,
  PlotSegueTone,
  PlotSegueType,
} from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const INPUTS: InputSpec[] = [
  {
    kind: 'select', key: 'segueType', label: 'Segue type',
    options: [
      { label: 'Bridge — move between scenes', value: 'bridge' },
      { label: 'Complication — twist this scene', value: 'complication' },
      { label: 'Cliffhanger — end the session', value: 'cliffhanger' },
    ],
    default: 'bridge',
  },
  { kind: 'number', key: 'count', label: 'How many', min: 1, max: 5, default: 3 },
  {
    kind: 'select', key: 'tone', label: 'Tone',
    options: [
      { label: 'Gentle — slow down, breathe', value: 'gentle' },
      { label: 'Escalating — nudge tension up', value: 'escalating' },
      { label: 'Dire — name the threat now', value: 'dire' },
    ],
    default: 'escalating',
  },
  { kind: 'text', key: 'currentScene', label: 'Current scene (optional)', default: '', placeholder: 'The party is…' },
];

type Inputs = {
  segueType: PlotSegueType;
  count: number;
  tone: PlotSegueTone;
  currentScene: string;
};

function copyText(r: PlotSegueResult): string {
  return r.segues
    .map((s, i) => {
      const head = r.segues.length > 1 ? `${i + 1}. ${s.title}` : s.title;
      const note = s.gmNote ? `\nGM: ${s.gmNote}` : '';
      return `${head}\n${s.readAloud}${note}`;
    })
    .join('\n\n');
}

export default function PlotSegueGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  onAddToCampaign,
  disabledDests,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
  disabledDests?: readonly CampaignDestKey[];
}) {
  return (
    <AIGeneratorPanel<Inputs, PlotSegueResult>
      title="Plot Segues"
      description="Mid-session narrative beats — bridges between scenes, complications that twist the current one, or cliffhangers that end the night. Every roll calls Claude (Pro only)."
      inputs={INPUTS}
      generate={(inputs, idToken, ctx) => generatePlotSegues(
        {
          segueType: inputs.segueType,
          count: Number(inputs.count),
          tone: inputs.tone,
          currentScene: String(inputs.currentScene || ''),
        },
        idToken,
        ctx,
      )}
      campaignContext={campaignContext}
      onAddToCampaign={onAddToCampaign}
      disabledDests={disabledDests}
      log={{
        kind: 'plot-segue',
        entries,
        onEntriesChange,
        titleFor: (r) => {
          if (r.segues.length === 1) return `Segue · ${r.inputs.segueType}`;
          return `${r.segues.length} segues · ${r.inputs.segueType}`;
        },
        copyText,
      }}
      renderResult={(r) => (
        <ol className="space-y-4 list-decimal ml-5 font-serif text-sm text-ink marker:text-brass-deep">
          {r.segues.map((s, i) => (
            <li key={i} className="space-y-1.5">
              <div className="font-display tracking-wide text-ink uppercase text-[11px]">{s.title}</div>
              <div className="leading-snug">{s.readAloud}</div>
              {s.gmNote && (
                <div className="text-xs text-brass-deep font-display tracking-wide">
                  GM: <span className="font-serif text-ink-soft italic not-italic">{s.gmNote}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    />
  );
}
