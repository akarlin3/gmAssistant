// NPC voice synthesis (TTS) shared types.
//
// Voices are produced entirely in the browser via the Web Speech API
// (window.speechSynthesis) — no API key, no server route, no per-character cost.
// A VoiceProfile is stored per-NPC under `npc.voiceProfile` and references one
// of the user's locally-installed system voices by its voiceURI.

export type VoiceProfile = {
  voiceURI: string; // SpeechSynthesisVoice.voiceURI
  voiceName: string; // human-readable, shown in the UI
  lang?: string; // BCP-47 tag of the chosen voice
  rate?: number; // 0.5–2 (SpeechSynthesisUtterance.rate)
  pitch?: number; // 0–2 (SpeechSynthesisUtterance.pitch)
};

export function isValidVoiceProfile(v: unknown): v is VoiceProfile {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.voiceURI === 'string' && p.voiceURI.length > 0 && typeof p.voiceName === 'string'
  );
}
