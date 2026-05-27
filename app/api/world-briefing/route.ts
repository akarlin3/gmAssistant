import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import type { BriefingChange } from '@/lib/world/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Pro-only "While You Were Away" narration. The client sends the deterministic
// list of changes the tick produced; the model never decides what happened, it
// only narrates the supplied facts. Building the prompt server-side keeps this
// endpoint from being usable as a general-purpose Claude proxy.
type BriefingRequest = {
  daysElapsed: number;
  changes: BriefingChange[];
  campaignName?: string;
};

const MAX_CHANGES = 100;

function buildSystemPrompt(campaignName: string): string {
  const setting = campaignName.trim() || 'this campaign';
  return `You are writing a "While You Were Away" briefing for a solo tabletop roleplaying campaign called "${setting}".

The player character has been away from the action for some in-world days. During their absence, the world advanced on its own. The user message contains the list of changes that happened.

Write a single paragraph briefing (4-6 sentences) summarizing what the player would have heard about or noticed when returning.

Tone:
- Grounded, sensory, oral-tradition style — like a rumor passed at an inn, not a news report
- Lead with the most consequential change
- Reference NPCs and factions by name when they're involved
- Acknowledge that the player may not have witnessed events directly — use phrases like "word reaches you that...", "you hear that...", "in your absence..."

Strict rules:
- Do NOT take actions for the player character
- Do NOT introduce new entities not in the changes list
- Do NOT invent events not present in the changes list
- Do NOT use the words "meanwhile" or "elsewhere" — they break solo-play immersion

Reply with just the paragraph. No preamble, no headers, no markdown.`;
}

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok)
    return NextResponse.json({ error: verified.message }, { status: verified.status });

  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });

  let body: BriefingRequest;
  try {
    body = (await req.json()) as BriefingRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const changes = Array.isArray(body.changes) ? body.changes.slice(0, MAX_CHANGES) : [];
  if (changes.length === 0) {
    return NextResponse.json({ error: 'No changes to narrate.' }, { status: 400 });
  }
  const daysElapsed =
    typeof body.daysElapsed === 'number' && body.daysElapsed > 0 ? body.daysElapsed : 0;

  const systemPrompt = buildSystemPrompt(
    typeof body.campaignName === 'string' ? body.campaignName : '',
  );
  const userMessage = `Days elapsed: ${daysElapsed}\n\nChanges:\n${JSON.stringify(changes, null, 2)}`;

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API error (${err.status}): ${err.message}` },
        { status: 502 },
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const narrative = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return NextResponse.json({ narrative });
}
