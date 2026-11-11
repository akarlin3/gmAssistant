import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { validateOrigin } from '@/app/api/middleware';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  buildArchitectRelayPrompt,
  buildArchitectSystemPrompt,
  compileNaturalLanguageArchitectTurn,
  parseArchitectRelayResponse,
  WORKSPACE_ARCHITECT_JSON_SCHEMA,
  type ArchitectChatMessage,
  type HudLayoutPrefs,
  type WorkspaceAuthorityContext,
} from '@/lib/workspaceConfigCompiler';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface WorkspaceArchitectApiRequest {
  prompt: string;
  history?: ArchitectChatMessage[];
  campaignName?: string;
  role?: 'gm' | 'player';
  campaignOwnerUid?: string;
  activeSlotId?: string;
  ownedPcIds?: string[];
  currentHudPrefs?: HudLayoutPrefs | null;
  safeContextData?: Record<string, any>;
}

const MAX_BODY_BYTES = 80_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  if (!validateOrigin(req)) {
    return jsonResponse({ error: 'Forbidden origin' }, 403);
  }

  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) {
    return jsonResponse({ error: 'Not signed in' }, 401);
  }

  // Strict Pro-gating per CLAUDE.md
  const verified = await verifyPro(idToken);
  if (!verified.ok) {
    return jsonResponse({ error: verified.message }, verified.status);
  }

  const rateLimited = enforceRateLimit(verified.uid);
  if (rateLimited) return rateLimited;

  let rawBodyText = '';
  try {
    rawBodyText = await req.text();
  } catch {
    return jsonResponse({ error: 'Failed to read request body' }, 400);
  }
  if (rawBodyText.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request payload too large' }, 413);
  }

  let body: WorkspaceArchitectApiRequest;
  try {
    body = JSON.parse(rawBodyText) as WorkspaceArchitectApiRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  if (!prompt) {
    return jsonResponse({ error: 'Missing customization prompt' }, 400);
  }

  const requestedRole: 'gm' | 'player' = body.role === 'gm' ? 'gm' : 'player';
  // Verify campaign ownership: if campaignOwnerUid is supplied, it MUST match verified.uid
  const isCampaignOwner =
    requestedRole === 'gm' &&
    (!body.campaignOwnerUid || body.campaignOwnerUid === verified.uid);

  const authority: WorkspaceAuthorityContext = {
    role: requestedRole,
    isCampaignOwner,
    activeSlotId:
      typeof body.activeSlotId === 'string' ? body.activeSlotId.slice(0, 80) : undefined,
    ownedPcIds: Array.isArray(body.ownedPcIds)
      ? body.ownedPcIds
          .filter((id): id is string => typeof id === 'string')
          .slice(0, 12)
      : undefined,
  };

  const history: ArchitectChatMessage[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (m): m is ArchitectChatMessage =>
            Boolean(m) &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string',
        )
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }))
    : [];

  const campaignName =
    typeof body.campaignName === 'string' && body.campaignName.trim()
      ? body.campaignName.trim().slice(0, 120)
      : 'Campaign';

  const safeData =
    body.safeContextData &&
    typeof body.safeContextData === 'object' &&
    !Array.isArray(body.safeContextData)
      ? body.safeContextData
      : undefined;

  const userMessageContent = buildArchitectRelayPrompt(
    prompt,
    history,
    campaignName,
    safeData,
    authority,
    body.currentHudPrefs ?? null,
  );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      temperature: 0.2,
      system: buildArchitectSystemPrompt(authority),
      output_config: {
        format: {
          type: 'json_schema',
          schema: WORKSPACE_ARCHITECT_JSON_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: userMessageContent }],
    });

    const text = Array.isArray(msg?.content)
      ? msg.content
          .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
          .map((b: any) => b.text)
          .join('\n')
      : '';

    const parsed = parseArchitectRelayResponse(text, authority);
    if (parsed.ok && parsed.turn) {
      return jsonResponse({
        turn: parsed.turn,
        provider: 'cloud_pro',
      });
    }

    // Graceful deterministic fallback if upstream mock/model returned non-JSON prose
    const fallback = compileNaturalLanguageArchitectTurn(prompt, authority);
    return jsonResponse({
      turn: fallback.turn,
      provider: 'deterministic_fallback',
    });
  } catch (err: any) {
    console.warn('[workspace-architect] Cloud model error, using deterministic compiler:', err);
    const fallback = compileNaturalLanguageArchitectTurn(prompt, authority);
    return jsonResponse({
      turn: fallback.turn,
      provider: 'deterministic_fallback',
    });
  }
}
