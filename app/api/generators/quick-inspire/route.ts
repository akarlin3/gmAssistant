import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { callQuickInspire } from '@/lib/generators/quick-inspire-prompt';
import type { CampaignContext } from '@/lib/generators/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });

  let body: { tableTitle?: string; campaignContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.tableTitle || typeof body.tableTitle !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid tableTitle' }, { status: 400 });
  }

  const campaignContext = body.campaignContext && typeof body.campaignContext === 'object'
    ? (body.campaignContext as CampaignContext)
    : undefined;

  const client = new Anthropic({ apiKey });
  try {
    const result = await callQuickInspire(client, body.tableTitle, campaignContext);
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${err.status}): ${err.message}` }, { status: 502 });
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
