import { NextRequest } from 'next/server';
import { validateOrigin } from '@/app/api/middleware';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  processCustomizationDirective,
  type ActiveCustomizationConfig,
  type CustomizationHistoryEntry,
} from '@/lib/customization';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 80_000;

interface CustomizeApiRequestBody {
  /** Free-text user directive (also accepts `prompt` alias). */
  directive?: string;
  prompt?: string;
  /** Current active configuration JSON (never mutated directly). */
  currentConfig?: Partial<ActiveCustomizationConfig>;
  /** Caller workspace role (`gm` or `player`). */
  role?: 'gm' | 'player';
  campaignOwnerUid?: string;
  scopeKey?: string;
  historyEntries?: CustomizationHistoryEntry<ActiveCustomizationConfig>[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!validateOrigin(req)) {
    return jsonResponse({ error: 'Forbidden origin' }, 403);
  }

  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) {
    return jsonResponse({ error: 'Not signed in' }, 401);
  }

  // Mandatory Pro-gating per CLAUDE.md
  const verified = await verifyPro(idToken);
  if (!verified.ok) {
    return jsonResponse({ error: verified.message }, verified.status);
  }

  const rateLimited = enforceRateLimit(verified.uid);
  if (rateLimited) return rateLimited;

  let rawText = '';
  try {
    rawText = await req.text();
  } catch {
    return jsonResponse({ error: 'Failed to read request body' }, 400);
  }
  if (rawText.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request payload too large' }, 413);
  }

  let body: CustomizeApiRequestBody;
  try {
    body = JSON.parse(rawText) as CustomizeApiRequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const rawDirective =
    typeof body.directive === 'string' && body.directive.trim()
      ? body.directive
      : typeof body.prompt === 'string'
        ? body.prompt
        : '';
  const directive = rawDirective.trim().slice(0, 2000);
  if (!directive) {
    return jsonResponse(
      { error: 'Missing natural-language customization directive' },
      400,
    );
  }

  const requestedRole: 'gm' | 'player' = body.role === 'player' ? 'player' : 'gm';
  const isCampaignOwner =
    requestedRole === 'gm' &&
    (!body.campaignOwnerUid || body.campaignOwnerUid === verified.uid);

  const preview = await processCustomizationDirective({
    directive,
    currentConfig:
      body.currentConfig &&
      typeof body.currentConfig === 'object' &&
      !Array.isArray(body.currentConfig)
        ? body.currentConfig
        : undefined,
    role: requestedRole,
    isCampaignOwner,
    scopeKey: typeof body.scopeKey === 'string' ? body.scopeKey.slice(0, 100) : undefined,
    historyEntries: Array.isArray(body.historyEntries)
      ? body.historyEntries.slice(-10)
      : undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  });

  return jsonResponse({
    ok: preview.status !== 'rejected',
    preview,
  });
}
