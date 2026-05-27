'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Play, Loader2, Sparkles, X } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { OPENAI_VOICES } from '@/lib/voice/openai-voices';
import type { VoiceListEntry, VoiceProfile, VoiceProvider } from '@/lib/voice/types';

const PAGE_SIZE = 8;

const DEFAULT_PROFILE: VoiceProfile = {
  provider: 'openai',
  voiceId: 'alloy',
  voiceName: 'Alloy',
  speed: 1.0,
};

async function idToken(): Promise<string> {
  const t = await getFirebaseAuth().currentUser?.getIdToken();
  if (!t) throw new Error('Not signed in.');
  return t;
}

type Props = {
  npcName: string;
  value: VoiceProfile | undefined;
  onChange: (profile: VoiceProfile | undefined) => void;
};

export function VoiceProfilePicker({ npcName, value, onChange }: Props) {
  const [draft, setDraft] = useState<VoiceProfile>(value ?? DEFAULT_PROFILE);
  const [voices, setVoices] = useState<VoiceListEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [elevenAvailable, setElevenAvailable] = useState(false);
  const [page, setPage] = useState(0);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPlayed, setPreviewPlayed] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Probe ElevenLabs availability once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/voice/list?provider=elevenlabs', {
          headers: { Authorization: `Bearer ${await idToken()}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setElevenAvailable(!!json.available);
      } catch {
        if (!cancelled) setElevenAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the voice catalog for the current provider.
  const loadVoices = useCallback(async (provider: VoiceProvider) => {
    setListLoading(true);
    setListError(null);
    setPage(0);
    try {
      const res = await fetch(`/api/voice/list?provider=${provider}`, {
        headers: { Authorization: `Bearer ${await idToken()}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        voices?: VoiceListEntry[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setVoices(json.voices ?? []);
      if (json.error && (json.voices ?? []).length === 0) setListError(json.error);
    } catch (err) {
      // Fall back to the static OpenAI catalog so the picker still works offline.
      if (provider === 'openai') {
        setVoices(OPENAI_VOICES.map((v) => ({ id: v.id, name: v.name, description: v.description })));
      } else {
        setVoices([]);
        setListError(err instanceof Error ? err.message : 'Could not load voices');
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVoices(draft.provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.provider, loadVoices]);

  function update(patch: Partial<VoiceProfile>) {
    setDraft((d) => ({ ...d, ...patch }));
    setPreviewPlayed(false);
  }

  function selectProvider(provider: VoiceProvider) {
    if (provider === 'openai') {
      update({ provider, voiceId: 'alloy', voiceName: 'Alloy', speed: 1.0, stability: undefined, similarityBoost: undefined });
    } else {
      update({ provider, voiceId: '', voiceName: '', speed: undefined, stability: 0.5, similarityBoost: 0.75 });
    }
  }

  function selectVoice(id: string) {
    const v = voices.find((x) => x.id === id);
    update({ voiceId: id, voiceName: v?.name ?? id });
  }

  // Preview the given profile (defaults to the current draft).
  const preview = useCallback(
    async (profile: VoiceProfile = draft) => {
      if (!profile.voiceId) {
        setPreviewError('Pick a voice first.');
        return;
      }
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch('/api/voice/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
          body: JSON.stringify({ voiceProfile: profile, line: `Hello, I am ${npcName || 'your NPC'}.` }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(error || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        previewAudioRef.current?.pause();
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.addEventListener('ended', () => URL.revokeObjectURL(url));
        await audio.play();
        setPreviewPlayed(true);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setPreviewLoading(false);
      }
    },
    [draft, npcName],
  );

  const totalPages = Math.max(1, Math.ceil(voices.length / PAGE_SIZE));
  const pagedVoices =
    draft.provider === 'elevenlabs' ? voices.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : voices;

  const labelCls = 'font-display text-[10px] uppercase tracking-wider text-brass-deep';

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

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelCls}>Provider</div>
          <select
            name="provider"
            value={draft.provider}
            onChange={(e) => selectProvider(e.target.value as VoiceProvider)}
            className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
          >
            <option value="openai">OpenAI (Default)</option>
            <option value="elevenlabs" disabled={!elevenAvailable}>
              ElevenLabs{elevenAvailable ? '' : ' (Needs API Key)'}
            </option>
          </select>
        </div>
        <div>
          <div className={labelCls}>Voice</div>
          <div className="flex items-center gap-1">
            <select
              name="voiceId"
              value={draft.voiceId}
              onChange={(e) => selectVoice(e.target.value)}
              disabled={listLoading}
              className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
            >
              {draft.provider === 'elevenlabs' && <option value="">— Choose —</option>}
              {pagedVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.description ? ` — ${v.description}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => preview(draft)}
              disabled={previewLoading || !draft.voiceId}
              aria-label="Play Sample"
              title="Play Sample"
              className="flex-shrink-0 rounded border border-rule p-1 text-brass-deep hover:border-crimson hover:text-crimson disabled:opacity-50"
            >
              {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            </button>
          </div>
        </div>
      </div>

      {draft.provider === 'elevenlabs' && totalPages > 1 && (
        <div className="flex items-center justify-between font-display text-[10px] uppercase tracking-wider text-ink-mute">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="hover:text-crimson disabled:opacity-40"
          >
            ‹ Prev
          </button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="hover:text-crimson disabled:opacity-40"
          >
            Next ›
          </button>
        </div>
      )}

      {listError && <p className="font-serif text-[11px] italic text-crimson">{listError}</p>}

      {draft.provider === 'openai' ? (
        <div>
          <div className={labelCls}>Speed — {(draft.speed ?? 1).toFixed(2)}×</div>
          <input
            type="range"
            name="speed"
            min={0.5}
            max={2}
            step={0.05}
            value={draft.speed ?? 1}
            onChange={(e) => update({ speed: Number(e.target.value) })}
            className="w-full accent-crimson"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className={labelCls}>Stability — {(draft.stability ?? 0.5).toFixed(2)}</div>
            <input
              type="range"
              name="stability"
              min={0}
              max={1}
              step={0.05}
              value={draft.stability ?? 0.5}
              onChange={(e) => update({ stability: Number(e.target.value) })}
              className="w-full accent-crimson"
            />
          </div>
          <div>
            <div className={labelCls}>Similarity — {(draft.similarityBoost ?? 0.75).toFixed(2)}</div>
            <input
              type="range"
              name="similarityBoost"
              min={0}
              max={1}
              step={0.05}
              value={draft.similarityBoost ?? 0.75}
              onChange={(e) => update({ similarityBoost: Number(e.target.value) })}
              className="w-full accent-crimson"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => preview(draft)}
          disabled={previewLoading || !draft.voiceId}
          className="flex items-center gap-1.5 rounded border border-brass/60 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:border-crimson hover:text-crimson disabled:opacity-50"
        >
          {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
          Preview
        </button>
        <button
          type="button"
          onClick={() => onChange(draft)}
          disabled={!draft.voiceId}
          className="flex items-center gap-1.5 rounded bg-crimson px-2.5 py-1 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
        >
          <Sparkles size={12} /> Save Voice
        </button>
        {value?.voiceId === draft.voiceId && value?.provider === draft.provider && (
          <span className="font-serif text-[11px] italic text-moss">Saved</span>
        )}
      </div>

      {previewError && <p className="font-serif text-[11px] italic text-crimson">{previewError}</p>}
      {previewPlayed && <span data-voice-preview-played hidden />}
    </div>
  );
}
