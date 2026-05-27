import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { callPlotSegue, type PlotSegueInputs } from '@/lib/generators/plot-segue-prompt';
import type { CampaignContext, PlotSegueTone, PlotSegueType } from '@/lib/generators/types';
import { contextTooLarge } from '@/lib/api/validate';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Pure-AI generator endpoint for plot segues. Unlike /api/generators/enhance,
// the request carries inputs (no deterministic seed payload) and the response
// is a freshly-generated PlotSegueResult. Pro-gated.

const SEGUE_TYPES: PlotSegueType[] = ['bridge', 'complication', 'cliffhanger'];
const TONES: PlotSegueTone[] = ['gentle', 'escalating', 'dire'];

function validateInputs(raw: unknown): PlotSegueInputs | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const segueType = SEGUE_TYPES.includes(r.segueType as PlotSegueType) ? (r.segueType as PlotSegueType) : null;
  const tone = TONES.includes(r.tone as PlotSegueTone) ? (r.tone as PlotSegueTone) : null;
  const count = Math.max(1, Math.min(5, Math.floor(Number(r.count))));
  const currentScene = typeof r.currentScene === 'string' ? r.currentScene.slice(0, 500) : '';
  if (!segueType || !tone || !Number.isFinite(count)) return null;
  return { segueType, tone, count, currentScene };
}

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });

  let body: { inputs?: unknown; campaignContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const inputs = validateInputs(body.inputs);
  if (!inputs) return NextResponse.json({ error: 'Missing or invalid inputs' }, { status: 400 });
  if (contextTooLarge(body.campaignContext)) {
    return NextResponse.json({ error: 'Campaign context too large' }, { status: 400 });
  }
  const campaignContext = body.campaignContext && typeof body.campaignContext === 'object'
    ? (body.campaignContext as CampaignContext)
    : undefined;

  const client = new Anthropic({ apiKey });
  try {
    const result = await callPlotSegue(client, inputs, campaignContext);
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${err.status}): ${err.message}` }, { status: 502 });
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
