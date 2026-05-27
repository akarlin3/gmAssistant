import { NextRequest, NextResponse } from 'next/server';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { OPENAI_VOICES } from '@/lib/voice/openai-voices';
import type { VoiceListEntry } from '@/lib/voice/types';

export const runtime = 'nodejs';

// Lists the voices available for a provider. OpenAI is a fixed catalog;
// ElevenLabs is fetched live and only when the server has an API key.
export async function GET(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const provider = new URL(req.url).searchParams.get('provider') ?? 'openai';

  if (provider === 'openai') {
    const voices: VoiceListEntry[] = OPENAI_VOICES.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
    }));
    return NextResponse.json({ voices, available: true });
  }

  if (provider === 'elevenlabs') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        voices: [],
        available: false,
        error: 'ELEVENLABS_API_KEY not configured',
      });
    }
    let r: Response;
    try {
      r = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });
    } catch {
      return NextResponse.json({ voices: [], available: true, error: 'Provider unreachable' }, { status: 502 });
    }
    if (!r.ok) {
      return NextResponse.json({ voices: [], available: true, error: 'Provider error' }, { status: 502 });
    }
    const json = (await r.json()) as { voices?: Array<Record<string, unknown>> };
    const voices: VoiceListEntry[] = (json.voices ?? []).map((v) => ({
      id: String(v.voice_id ?? ''),
      name: String(v.name ?? ''),
      description:
        (v.labels && typeof v.labels === 'object'
          ? String((v.labels as Record<string, unknown>).description ?? '')
          : '') || '',
      previewUrl: typeof v.preview_url === 'string' ? v.preview_url : undefined,
    }));
    return NextResponse.json({ voices, available: true });
  }

  return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
}
