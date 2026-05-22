import type Anthropic from '@anthropic-ai/sdk';
import { hasCampaignContext, type CampaignContext } from './types';

export type DescribeSceneInput = {
  sceneText: string;
  campaignContext?: CampaignContext;
};

export type DescribeSceneResult = {
  description: string;
};

const SYSTEM_PROMPT = `You are a tabletop RPG gamemaster's evocative-prose assistant. The user will give you a brief bullet-point scene from their session prep (e.g. "They find the hidden cache" or "Ambush in the alley"). Produce a single short read-aloud paragraph (2-4 sentences, under 90 words) the GM can speak at the table.

Style rules:
- Sensory: lead with sight, sound, or smell — not exposition.
- Present tense, second person ("you see / you hear").
- No mechanics, no dice prompts, no meta-talk.
- No "perhaps", "suddenly", or filler adverbs.
- Match the campaign's genre/tone when provided.
- Do not invent named NPCs or monsters not present in the prompt.

Return JSON: { "description": "..." }`;

function contextBlock(c: CampaignContext): string {
  const parts: string[] = [];
  if (c.genre) parts.push(`Genre: ${c.genre}`);
  if (c.tone && c.tone.length) parts.push(`Tone: ${c.tone.join(', ')}`);
  if (c.pitch) parts.push(`Pitch: ${c.pitch}`);
  if (c.worldFacts && c.worldFacts.length) parts.push(`World: ${c.worldFacts.join('; ')}`);
  if (c.settingFacts && c.settingFacts.length) parts.push(`Setting: ${c.settingFacts.join('; ')}`);
  if (c.partyLevel) parts.push(`Party level: ${c.partyLevel}`);
  return parts.join('\n');
}

export async function callDescribeScene(
  client: Anthropic,
  input: DescribeSceneInput,
): Promise<DescribeSceneResult> {
  const ctx = hasCampaignContext(input.campaignContext) ? contextBlock(input.campaignContext) : '';
  const userText = ctx
    ? `Campaign context:\n${ctx}\n\nScene bullet: ${input.sceneText}`
    : `Scene bullet: ${input.sceneText}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { description: { type: 'string' } },
          required: ['description'],
        },
      },
    },
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let parsed: { description?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Model did not return valid JSON');
  }
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
  if (!description) throw new Error('Model returned an empty description');
  return { description };
}
