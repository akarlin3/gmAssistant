import type Anthropic from '@anthropic-ai/sdk';
import type { CampaignContext } from './types';
import { hasCampaignContext } from './types';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 100;

const SYSTEM = `You are a TTRPG game master. You must generate a single, evocative random table entry for a given category.

You receive: { tableTitle, campaignContext? }.
Generate exactly 1 entry.
It must be extremely short, punchy, and quick to read: a single short phrase or one brief sentence (ideally under 15 words). Avoid multiple sentences, wordy descriptions, or preamble.
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
  if (typeof ctx.partyLevel === 'number' && ctx.partyLevel > 0) out.partyLevel = ctx.partyLevel;
  return out;
}

function getTierInfo(level?: number): { name: string; description: string } | null {
  if (level === undefined || level <= 0) return null;
  if (level <= 4) {
    return {
      name: 'Tier 1 (Local / Apprentice, levels 1–4)',
      description: 'Generate details with intimate, gritty, localized, and personal scale. Focus on basic/mundane threats, local village rumors, simple magic, and immediate personal stakes suitable for local heroes.',
    };
  } else if (level <= 10) {
    return {
      name: 'Tier 2 (Regional / Heroic, levels 5–10)',
      description: 'Generate details with regional, larger-scale, and heroic scale. Focus on regional threats, kingdom-level importance, moderately dangerous/mysterious magic, and significant local renown.',
    };
  } else if (level <= 16) {
    return {
      name: 'Tier 3 (National / Planar, levels 11–16)',
      description: 'Generate details with spectacular, epic, and planar scale. Focus on continent-level significance, extraplanar influence, spectacular reality-bending magic, and legendary artifacts/threats.',
    };
  } else {
    return {
      name: 'Tier 4 (Cosmic / Mythic, levels 17–20+)',
      description: 'Generate details with mythic, cosmic, and apocalyptic scale. Focus on world-ending/apocalyptic threats, interactions with deities/demigods, reality-warping events, legendary artifacts that shape space and time, and multiversal consequences.',
    };
  }
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

  let systemPrompt = SYSTEM;
  if (ctx?.partyLevel) {
    const tierInfo = getTierInfo(ctx.partyLevel);
    if (tierInfo) {
      systemPrompt += `\n\nCRITICAL: The current player/party level is ${ctx.partyLevel}, which corresponds to ${tierInfo.name}. You MUST scale the drama, stakes, and epicness of the generated detail to match this tier: ${tierInfo.description}`;
    }
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
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
