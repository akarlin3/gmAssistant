// NPC voice synthesis (TTS) shared types.
//
// A VoiceProfile is stored per-NPC under `npc.voiceProfile`. Generated audio is
// cached under `campaign.data.voiceCache` (metadata) with the audio bytes living
// in Firebase Storage at `voice/{uid}/{hash}.mp3`. See lib/voice/hash.ts for the
// cache key and components/voice/VoiceProvider.tsx for the generate-or-fetch
// pipeline.

export type VoiceProvider = 'openai' | 'elevenlabs';

export type VoiceProfile = {
  provider: VoiceProvider;
  voiceId: string; // provider-specific (e.g. 'alloy', or an ElevenLabs voice UUID)
  voiceName: string; // human-readable, shown in the UI
  speed?: number; // 0.5–2.0, OpenAI only
  stability?: number; // 0–1, ElevenLabs only
  similarityBoost?: number; // 0–1, ElevenLabs only
};

export type VoiceCacheEntry = {
  hash: string; // sha256(npcId + voiceProfileSignature + line)
  storagePath: string; // Firebase Storage path
  url: string; // download URL (Firebase Web SDK getDownloadURL — token-based, non-expiring)
  createdAt: number;
  npcId: string; // for invalidation when the NPC's voice profile changes
};

export type VoiceListEntry = {
  id: string;
  name: string;
  description: string;
  previewUrl?: string;
};

// Cap the per-campaign cache; FIFO eviction (oldest dropped first).
export const VOICE_CACHE_CAP = 500;

// Monthly per-Pro-user TTS character budget. Matches the OpenAI tts-1 free-tier
// scale; ElevenLabs usage is additionally bounded by the user's own ElevenLabs
// account quota.
export const MONTHLY_CHAR_LIMIT = 30_000;

// Hard ceiling on a single line sent to the provider.
export const MAX_LINE_CHARS = 2000;

export function isValidVoiceProfile(v: unknown): v is VoiceProfile {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (p.provider !== 'openai' && p.provider !== 'elevenlabs') return false;
  if (typeof p.voiceId !== 'string' || p.voiceId.length === 0) return false;
  if (typeof p.voiceName !== 'string') return false;
  return true;
}
