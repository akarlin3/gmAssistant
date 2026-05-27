import type { VoiceProfile } from './types';

// Only the fields that change the rendered audio go into the signature, so a
// cosmetic rename of `voiceName` doesn't needlessly bust the cache.
export function voiceProfileSignature(p: VoiceProfile): string {
  return JSON.stringify({
    provider: p.provider,
    voiceId: p.voiceId,
    speed: p.speed ?? null,
    stability: p.stability ?? null,
    similarityBoost: p.similarityBoost ?? null,
  });
}

// Cache key: sha256(npcId + voiceProfileSignature + line). Uses Web Crypto,
// available in both the browser and the Node runtime used by the API routes.
export async function voiceHash(
  npcId: string,
  profile: VoiceProfile,
  line: string,
): Promise<string> {
  const input = `${npcId}|${voiceProfileSignature(profile)}|${line}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
