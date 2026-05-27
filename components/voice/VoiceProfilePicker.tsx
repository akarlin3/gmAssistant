'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Loader2, Sparkles, X } from 'lucide-react';
import type { VoiceProfile } from '@/lib/voice/types';

const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

type Props = {
  npcName: string;
  value: VoiceProfile | undefined;
  onChange: (profile: VoiceProfile | undefined) => void;
};

export function VoiceProfilePicker({ npcName, value, onChange }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [draft, setDraft] = useState<VoiceProfile | null>(value ?? null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPlayed, setPreviewPlayed] = useState(false);

  // System voices populate asynchronously in some browsers.
  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);

  // Once voices are known, default the draft to the first one (English first).
  useEffect(() => {
    if (draft || voices.length === 0) return;
    const preferred =
      voices.find((v) => v.default) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
      voices[0];
    setDraft({
      voiceURI: preferred.voiceURI,
      voiceName: preferred.name,
      lang: preferred.lang,
      rate: 1,
      pitch: 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices]);

  function update(patch: Partial<VoiceProfile>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setPreviewPlayed(false);
  }

  function selectVoice(voiceURI: string) {
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v) update({ voiceURI: v.voiceURI, voiceName: v.name, lang: v.lang });
  }

  const preview = useCallback(() => {
    if (!draft || !speechSupported()) return;
    setPreviewError(null);
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(`Hello, I am ${npcName || 'your NPC'}.`);
      const match = synth.getVoices().find((v) => v.voiceURI === draft.voiceURI);
      if (match) utter.voice = match;
      if (draft.lang) utter.lang = draft.lang;
      utter.rate = draft.rate ?? 1;
      utter.pitch = draft.pitch ?? 1;
      synth.speak(utter);
      setPreviewPlayed(true);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    }
  }, [draft, npcName]);

  const labelCls = 'font-display text-[10px] uppercase tracking-wider text-brass-deep';

  if (!speechSupported()) {
    return (
      <div className="rounded border border-rule bg-parchment-soft p-2.5 font-serif text-[11px] italic text-ink-mute">
        This browser doesn't support speech synthesis, so NPC voices are unavailable here.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded border border-rule bg-parchment-soft p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-ink">
          <Volume2 size={12} /> Voice
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-mute hover:text-crimson"
            title="Clear Voice"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {voices.length === 0 ? (
        <p className="flex items-center gap-1.5 font-serif text-[11px] italic text-ink-mute">
          <Loader2 size={12} className="animate-spin" /> Loading system voices…
        </p>
      ) : (
        <>
          <div>
            <div className={labelCls}>Voice</div>
            <div className="flex items-center gap-1">
              <select
                name="voiceId"
                value={draft?.voiceURI ?? ''}
                onChange={(e) => selectVoice(e.target.value)}
                className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 font-serif text-[10px] italic text-ink-mute">
              Voices come from your device/browser; the list differs per machine.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={labelCls}>Rate — {(draft?.rate ?? 1).toFixed(2)}×</div>
              <input
                type="range"
                name="rate"
                min={0.5}
                max={2}
                step={0.05}
                value={draft?.rate ?? 1}
                onChange={(e) => update({ rate: Number(e.target.value) })}
                className="w-full accent-crimson"
              />
            </div>
            <div>
              <div className={labelCls}>Pitch — {(draft?.pitch ?? 1).toFixed(2)}</div>
              <input
                type="range"
                name="pitch"
                min={0}
                max={2}
                step={0.05}
                value={draft?.pitch ?? 1}
                onChange={(e) => update({ pitch: Number(e.target.value) })}
                className="w-full accent-crimson"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={preview}
              disabled={!draft}
              className="flex items-center gap-1.5 rounded border border-brass/60 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:border-crimson hover:text-crimson disabled:opacity-50"
            >
              <Volume2 size={12} /> Preview
            </button>
            <button
              type="button"
              onClick={() => draft && onChange(draft)}
              disabled={!draft}
              className="flex items-center gap-1.5 rounded bg-crimson px-2.5 py-1 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
            >
              <Sparkles size={12} /> Save Voice
            </button>
            {value?.voiceURI === draft?.voiceURI && (
              <span className="font-serif text-[11px] italic text-moss">Saved</span>
            )}
          </div>
        </>
      )}

      {previewError && <p className="font-serif text-[11px] italic text-crimson">{previewError}</p>}
      {previewPlayed && <span data-voice-preview-played hidden />}
    </div>
  );
}
