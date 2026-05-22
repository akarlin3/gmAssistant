import type Anthropic from '@anthropic-ai/sdk';
import type { CampaignContext } from './types';
import { hasCampaignContext } from './types';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

const SYSTEM = `You are a TTRPG game master. You must generate a single, evocative random table entry for a given category.

You receive: { tableTitle, campaignContext? }.
Generate exactly 1 entry.
It should be 1-3 sentences, imaginative, and fit the category.
Do not include trailing punctuation if it is a short phrase, but full sentences are fine.

Lean into campaignContext (genre, tone, pitch, world facts, setting facts) when present — but never invent named NPCs, factions, or locations the campaign does not already mention.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entry: { type: 'string' },
  },
  required: ['entry'],
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
  return out;
}

export async function callQuickInspire(
  client: Anthropic,
  tableTitle: string,
  campaignContext?: CampaignContext,
): Promise<{ entry: string }> {
  const ctx = trimContext(campaignContext);
  const user = JSON.stringify({
    tableTitle,
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
  const parsed = JSON.parse(text) as { entry: string };

  return parsed;
}
