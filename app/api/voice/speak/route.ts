import { NextRequest, NextResponse } from 'next/server';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isValidVoiceProfile, MAX_LINE_CHARS } from '@/lib/voice/types';
import { checkAndIncrementVoiceChars } from '@/lib/voice/usage';
import { generateSpeech, VoiceProviderError } from '@/lib/voice/providers';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Generates TTS audio for a single line and returns the raw MP3 bytes. Caching
// (Storage upload + campaign.data.voiceCache) is handled client-side, so this
// endpoint is only hit on a cache miss: the client checks its cache first and
// skips the network call on a hit. Quota is checked and incremented here.
export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const line = typeof b.line === 'string' ? b.line : '';
  if (line.length === 0 || line.length > MAX_LINE_CHARS) {
    return NextResponse.json({ error: 'Invalid line' }, { status: 400 });
  }
  if (!isValidVoiceProfile(b.voiceProfile)) {
    return NextResponse.json({ error: 'Invalid or missing voice profile' }, { status: 400 });
  }
  const profile = b.voiceProfile;

  const quota = await checkAndIncrementVoiceChars(verified.uid, idToken, line.length);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: `Monthly TTS limit reached (${quota.limit.toLocaleString()} characters). Resets ${quota.resetDate}.`,
        resetDate: quota.resetDate,
      },
      { status: 429 },
    );
  }

  let audio: Buffer;
  try {
    audio = await generateSpeech(line, profile);
  } catch (err) {
    if (err instanceof VoiceProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'TTS generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Voice-Chars-Used': String(quota.used),
      'X-Voice-Chars-Limit': String(quota.limit),
    },
  });
}
