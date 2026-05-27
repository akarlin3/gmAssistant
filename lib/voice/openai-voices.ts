// OpenAI TTS voice catalog (tts-1 / tts-1-hd). These six voice ids are fixed
// by the provider; the picker renders this list for the OpenAI provider.
export const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral, warm' },
  { id: 'echo', name: 'Echo', description: 'Smooth, lower-pitched' },
  { id: 'fable', name: 'Fable', description: 'Expressive, British-leaning' },
  { id: 'onyx', name: 'Onyx', description: 'Deep, authoritative' },
  { id: 'nova', name: 'Nova', description: 'Bright, energetic' },
  { id: 'shimmer', name: 'Shimmer', description: 'Soft, warm' },
] as const;

export type OpenAIVoiceId = (typeof OPENAI_VOICES)[number]['id'];

export function isOpenAIVoiceId(id: string): id is OpenAIVoiceId {
  return OPENAI_VOICES.some((v) => v.id === id);
}
