// Server-only prompt module for the Plot Segues generator.
//
// Unlike enhance.ts (which layers narrative onto deterministic results), this
// is the entire generator: every call produces a new PlotSegueResult from
// scratch. Lives outside enhance.ts so the discriminated union there does not
// need a special-case branch for a pure-AI kind.

import type Anthropic from '@anthropic-ai/sdk';
import type {
  CampaignContext,
  PlotSegue,
  PlotSegueResult,
  PlotSegueTone,
  PlotSegueType,
} from './types';
import { hasCampaignContext } from './types';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

const SYSTEM = `You generate "plot segues" for a TTRPG game master mid-session. A segue is one of three things, depending on segueType:
  - bridge: a 1-2 sentence narrative transition that moves the table from one scene to another (travel, time-skip, scene-cut).
  - complication: a 1-2 sentence interruption that twists the current scene without resolving it (a stranger arrives, weather turns, something the party assumed is wrong).
  - cliffhanger: a 1-2 sentence beat that ends the session on tension and primes the next one.

Tone shapes pacing:
  - gentle: slow the table down, breathe, create space.
  - escalating: nudge tension upward, hint at consequence.
  - dire: name a present threat, raise stakes immediately.

You receive: { segueType, count, tone, currentScene?, campaignContext? }.
Generate exactly \`count\` segues. Each one:
  - title: 3-6 words, evocative, no trailing punctuation.
  - readAloud: 1-2 short, punchy sentences (≤30 words), second-person plural, in the register of a quick at-the-table read-aloud.
  - gmNote: optional, ≤18 words, a mechanics or pacing cue (e.g. "calls for a Wisdom (Insight) check", "burn this if the party stalls").

If currentScene is provided, bridge from it; otherwise write segues that stand alone. Lean into campaignContext (genre, tone, pitch, world facts, setting facts) when present — but never invent named NPCs, factions, or locations the campaign does not already mention.`;

export type PlotSegueInputs = {
  segueType: PlotSegueType;
  count: number;
  tone: PlotSegueTone;
  currentScene: string;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    segues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          readAloud: { type: 'string' },
          gmNote: { type: 'string' },
        },
        required: ['title', 'readAloud'],
      },
    },
  },
  required: ['segues'],
} as const;

function trimContext(ctx?: CampaignContext): CampaignContext | undefined {
  if (!hasCampaignContext(ctx)) return undefined;
  const out: CampaignContext = {};
  if (ctx.genre && ctx.genre.trim()) out.genre = ctx.genre.trim();
  const tone = ctx.tone?.filter((t) => t && t.trim());
  if (tone && tone.length) out.tone = tone;
  if (ctx.pitch && ctx.pitch.trim()) out.pitch = ctx.pitch.trim();
  const world = ctx.worldFacts?.filter((t) => t && t.trim());
  if (world && world.length) out.worldFacts = world;
  const setting = ctx.settingFacts?.filter((t) => t && t.trim());
  if (setting && setting.length) out.settingFacts = setting;
  if (typeof ctx.partyLevel === 'number' && ctx.partyLevel > 0) out.partyLevel = ctx.partyLevel;
  return out;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `plot-segue_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `plot-segue_${Math.random().toString(36).slice(2, 10)}`;
}

export async function callPlotSegue(
  client: Anthropic,
  inputs: PlotSegueInputs,
  campaignContext?: CampaignContext,
): Promise<PlotSegueResult> {
  const ctx = trimContext(campaignContext);
  const user = JSON.stringify({
    segueType: inputs.segueType,
    count: inputs.count,
    tone: inputs.tone,
    currentScene: inputs.currentScene || undefined,
    campaignContext: ctx,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = JSON.parse(text) as { segues: PlotSegue[] };

  return {
    kind: 'plot-segue',
    id: newId(),
    inputs,
    segues: parsed.segues,
    enhanced: true,
  };
}
