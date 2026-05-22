import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { callDescribeScene } from '@/lib/generators/describe-scene-prompt';
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

  let body: { sceneText?: unknown; campaignContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sceneText = typeof body.sceneText === 'string' ? body.sceneText.trim() : '';
  if (!sceneText) return NextResponse.json({ error: 'Missing or empty sceneText' }, { status: 400 });
  if (sceneText.length > 600) {
    return NextResponse.json({ error: 'sceneText too long (max 600 chars)' }, { status: 400 });
  }

  const campaignContext = body.campaignContext && typeof body.campaignContext === 'object'
    ? (body.campaignContext as CampaignContext)
    : undefined;

  const client = new Anthropic({ apiKey });
  try {
    const result = await callDescribeScene(client, { sceneText, campaignContext });
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${err.status}): ${err.message}` }, { status: 502 });
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
