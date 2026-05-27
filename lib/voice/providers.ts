import type { VoiceProfile } from './types';

// Provider-agnostic TTS generation. Both providers return raw MP3 bytes; the
// /api/voice/speak route streams them back to the client, which handles caching
// (upload to Storage + record in campaign.data.voiceCache).

export class VoiceProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'VoiceProviderError';
    this.status = status;
  }
}

export async function generateSpeech(line: string, profile: VoiceProfile): Promise<Buffer> {
  if (profile.provider === 'openai') return generateOpenAI(line, profile);
  if (profile.provider === 'elevenlabs') return generateElevenLabs(line, profile);
  throw new VoiceProviderError('Unknown voice provider', 400);
}

async function generateOpenAI(line: string, profile: VoiceProfile): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new VoiceProviderError('Server missing OPENAI_API_KEY', 500);

  const speed = clamp(profile.speed ?? 1.0, 0.5, 2.0);
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: profile.voiceId,
      input: line,
      speed,
      response_format: 'mp3',
    }),
  });
  if (!r.ok) {
    throw new VoiceProviderError(`OpenAI TTS failed (${r.status})`, 502);
  }
  return Buffer.from(await r.arrayBuffer());
}

async function generateElevenLabs(line: string, profile: VoiceProfile): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new VoiceProviderError('Server missing ELEVENLABS_API_KEY', 500);

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(profile.voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: line,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: clamp(profile.stability ?? 0.5, 0, 1),
          similarity_boost: clamp(profile.similarityBoost ?? 0.75, 0, 1),
        },
      }),
    },
  );
  if (!r.ok) {
    throw new VoiceProviderError(`ElevenLabs TTS failed (${r.status})`, 502);
  }
  return Buffer.from(await r.arrayBuffer());
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
