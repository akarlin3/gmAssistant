'use client';

import { GeneratorPanel, type InputSpec } from './GeneratorPanel';
import { generatePlotSegues } from '@/lib/generators/plot-segue';
import {
  SEGUE_ARC_LABELS,
  SEGUE_DELIVERY_LABELS,
  SEGUE_MODE_LABELS,
  SEGUE_URGENCY_LABELS,
} from '@/lib/generators/tables/plot-segue-tables';
import type {
  CampaignContext,
  PlotSegueResult,
  SegueArcFlavor,
  SegueDelivery,
  SegueMode,
  SegueUrgency,
} from '@/lib/generators/types';
import type { LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const AUTO_OPT = { label: 'Auto (mix)', value: 'auto' };

const INPUTS: InputSpec[] = [
  { kind: 'number', key: 'count', label: 'How many', min: 1, max: 3, default: 1 },
  {
    kind: 'select', key: 'mode', label: 'Mode',
    options: [
      AUTO_OPT,
      { label: SEGUE_MODE_LABELS.pivot, value: 'pivot' },
      { label: SEGUE_MODE_LABELS.aftermath, value: 'aftermath' },
    ],
    default: 'auto',
  },
  {
    kind: 'select', key: 'arcFlavor', label: 'Arc flavor',
    options: [
      AUTO_OPT,
      { label: SEGUE_ARC_LABELS.mystery, value: 'mystery' },
      { label: SEGUE_ARC_LABELS.threat, value: 'threat' },
      { label: SEGUE_ARC_LABELS.faction, value: 'faction' },
      { label: SEGUE_ARC_LABELS.personal, value: 'personal' },
      { label: SEGUE_ARC_LABELS.wonder, value: 'wonder' },
    ],
    default: 'auto',
  },
  {
    kind: 'select', key: 'delivery', label: 'Delivery',
    options: [
      AUTO_OPT,
      { label: SEGUE_DELIVERY_LABELS.messenger, value: 'messenger' },
      { label: SEGUE_DELIVERY_LABELS.rumor, value: 'rumor' },
      { label: SEGUE_DELIVERY_LABELS.discovery, value: 'discovery' },
      { label: SEGUE_DELIVERY_LABELS.environmental, value: 'environmental' },
      { label: SEGUE_DELIVERY_LABELS['npc-interrupt'], value: 'npc-interrupt' },
    ],
    default: 'auto',
  },
  {
    kind: 'select', key: 'urgency', label: 'Urgency',
    options: [
      AUTO_OPT,
      { label: SEGUE_URGENCY_LABELS['slow-burn'], value: 'slow-burn' },
      { label: SEGUE_URGENCY_LABELS.pressing, value: 'pressing' },
      { label: SEGUE_URGENCY_LABELS.now, value: 'now' },
    ],
    default: 'auto',
  },
];

type Inputs = {
  count: number;
  mode: 'auto' | SegueMode;
  arcFlavor: 'auto' | SegueArcFlavor;
  delivery: 'auto' | SegueDelivery;
  urgency: 'auto' | SegueUrgency;
};

function copyText(r: PlotSegueResult): string {
  return r.segues
    .map((s, i) => `${r.segues.length > 1 ? `${i + 1}. ` : ''}[${SEGUE_MODE_LABELS[s.mode]} · ${SEGUE_ARC_LABELS[s.arcFlavor]} · ${SEGUE_URGENCY_LABELS[s.urgency]}]
Trigger: ${s.trigger}
${s.hook}
Arc seed: ${s.arcSeed}`)
    .join('\n\n');
}

export default function PlotSegueGenerator({
  entries,
  onEntriesChange,
  campaignContext,
  onAddToCampaign,
}: {
  entries: LogEntry[];
  onEntriesChange: (next: LogEntry[]) => void;
  campaignContext?: CampaignContext;
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  return (
    <GeneratorPanel<Inputs, PlotSegueResult>
      title="Plot Segues"
      description="Drop a bridging moment that dangles a new plot arc — a pivot mid-scene, or an aftermath ripple from what the party just did. Each segue gives you the trigger to deliver, a few sentences of read-aloud, and a one-line arc seed to develop later."
      inputs={INPUTS}
      generate={(inputs, rng) => generatePlotSegues({
        count: Number(inputs.count),
        mode: inputs.mode as Inputs['mode'],
        arcFlavor: inputs.arcFlavor as Inputs['arcFlavor'],
        delivery: inputs.delivery as Inputs['delivery'],
        urgency: inputs.urgency as Inputs['urgency'],
      }, rng)}
      enhance={{ kind: 'plot-segue' }}
      campaignContext={campaignContext}
      onAddToCampaign={onAddToCampaign}
      log={{
        kind: 'plot-segue',
        entries,
        onEntriesChange,
        titleFor: (r) => {
          if (r.segues.length === 1) {
            const s = r.segues[0];
            return `${SEGUE_ARC_LABELS[s.arcFlavor]} · ${SEGUE_MODE_LABELS[s.mode]}`;
          }
          return `${r.segues.length} segues`;
        },
        copyText,
      }}
      renderResult={(r) => (
        <ol className="space-y-4 list-decimal ml-5 font-serif text-sm text-ink marker:text-brass-deep">
          {r.segues.map((s, i) => (
            <li key={i} className="space-y-1.5">
              <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wider font-display">
                <span className="px-1.5 py-0.5 rounded border border-crimson/40 bg-crimson/10 text-crimson">
                  {SEGUE_MODE_LABELS[s.mode]}
                </span>
                <span className="px-1.5 py-0.5 rounded border border-brass-deep/40 bg-brass/10 text-brass-deep">
                  {SEGUE_ARC_LABELS[s.arcFlavor]}
                </span>
                <span className="px-1.5 py-0.5 rounded border border-rule text-ink-soft">
                  {SEGUE_DELIVERY_LABELS[s.delivery]}
                </span>
                <span className="px-1.5 py-0.5 rounded border border-rule text-ink-soft">
                  {SEGUE_URGENCY_LABELS[s.urgency]}
                </span>
              </div>
              <div className="text-xs text-ink-soft italic">Trigger: {s.trigger}</div>
              <div>{s.hook}</div>
              <div className="text-xs text-brass-deep font-display tracking-wide">
                Arc seed: <span className="font-serif text-ink not-italic">{s.arcSeed}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    />
  );
}
