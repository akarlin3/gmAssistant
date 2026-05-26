import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { enhanceResult, type EnhanceableKind } from '@/lib/generators/enhance';
import type { CampaignContext } from '@/lib/generators/types';
import { contextTooLarge } from '@/lib/api/validate';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Single AI-enhance endpoint shared by all seven generators in the suite.
// Dispatches on `kind` to per-generator prompts in lib/generators/enhance.ts.
// Always Pro-gated: the deterministic generator runs entirely client-side and
// remains free; only this enhance step calls Claude.

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });

  let body: { kind?: unknown; result?: unknown; campaignContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const kind = typeof body.kind === 'string' ? (body.kind as EnhanceableKind) : null;
  if (!kind) return NextResponse.json({ error: 'Missing kind' }, { status: 400 });
  if (contextTooLarge(body.campaignContext)) {
    return NextResponse.json({ error: 'Campaign context too large' }, { status: 400 });
  }
  const campaignContext = body.campaignContext && typeof body.campaignContext === 'object'
    ? (body.campaignContext as CampaignContext)
    : undefined;

  const client = new Anthropic({ apiKey });
  try {
    const enhanced = await enhanceResult(client, kind, body.result, campaignContext);
    return NextResponse.json({ result: enhanced });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${err.status}): ${err.message}` }, { status: 502 });
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
