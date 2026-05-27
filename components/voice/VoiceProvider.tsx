'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { VoiceProfile } from '@/lib/voice/types';

const MUTE_KEY = 'voiceMuted';
const SEQUENCE_GAP_MS = 200;

type LooseNpc = Record<string, unknown> & {
  id?: string;
  name?: string;
  voiceProfile?: VoiceProfile;
};

export type VoiceContextValue = {
  isPro: boolean;
  /** Voice playback is available (Pro + the browser supports speechSynthesis). */
  enabled: boolean;
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** True while a line is being spoken. */
  playing: boolean;
  /** Resolve an NPC's voice profile, or null when it has none. */
  npcVoiceProfile: (npcId: string) => VoiceProfile | null;
  npcName: (npcId: string) => string;
  /** Speak a single line in the NPC's voice. Resolves when speech ends. */
  speak: (npcId: string, line: string) => Promise<void>;
  /** Speak several lines in order with a short gap; respects skip/stop. */
  speakSequence: (lines: { npcId: string; line: string }[]) => Promise<void>;
  /** Skip the line currently being spoken (a sequence advances to the next). */
  skip: () => void;
  /** Stop everything, including any running sequence. */
  stopAll: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within a VoiceProvider');
  return ctx;
}

/** Optional variant — returns null outside a provider instead of throwing. */
export function useVoiceOptional(): VoiceContextValue | null {
  return useContext(VoiceContext);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return (min + max) / 2;
  return Math.min(max, Math.max(min, n));
}

type Props = {
  isPro: boolean;
  npcs: LooseNpc[];
  children: React.ReactNode;
};

export function VoiceProvider({ isPro, npcs, children }: Props) {
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const [muted, setMutedState] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Refs to dodge stale closures during async/sequential playback.
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const resolveCurrentRef = useRef<(() => void) | null>(null);
  const sequenceTokenRef = useRef(0);

  // The available system voices populate asynchronously in some browsers.
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      voicesRef.current = synth.getVoices();
    };
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, [supported]);

  useEffect(() => {
    try {
      setMutedState(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    resolveCurrentRef.current?.();
  }, [supported]);

  const setMuted = useCallback(
    (m: boolean) => {
      setMutedState(m);
      try {
        localStorage.setItem(MUTE_KEY, m ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (m) {
        // Silence session-wide immediately.
        sequenceTokenRef.current += 1;
        cancelSpeech();
      }
    },
    [cancelSpeech],
  );

  const npcName = useCallback(
    (npcId: string) =>
      (npcsRef.current.find((n) => n.id === npcId)?.name as string) || 'Unknown NPC',
    [],
  );

  const npcVoiceProfile = useCallback((npcId: string): VoiceProfile | null => {
    const p = npcsRef.current.find((n) => n.id === npcId)?.voiceProfile;
    return p && p.voiceURI ? p : null;
  }, []);

  // Speak one profile/line; resolves when speech ends, errors, or is skipped.
  const playUtterance = useCallback(
    (profile: VoiceProfile, line: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (!supported) {
          resolve();
          return;
        }
        const synth = window.speechSynthesis;
        synth.cancel(); // clear anything still queued/speaking
        const utter = new SpeechSynthesisUtterance(line);
        const match = voicesRef.current.find((v) => v.voiceURI === profile.voiceURI);
        if (match) utter.voice = match;
        if (profile.lang) utter.lang = profile.lang;
        utter.rate = clamp(profile.rate ?? 1, 0.5, 2);
        utter.pitch = clamp(profile.pitch ?? 1, 0, 2);

        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          if (resolveCurrentRef.current === done) resolveCurrentRef.current = null;
          resolve();
        };
        resolveCurrentRef.current = done;
        utter.onend = done;
        utter.onerror = done;
        synth.speak(utter);
      });
    },
    [supported],
  );

  const speak = useCallback(
    async (npcId: string, line: string) => {
      if (!line.trim() || !supported) return;
      const profile = npcsRef.current.find((n) => n.id === npcId)?.voiceProfile;
      if (!profile || !profile.voiceURI) throw new Error('No voice profile set for this NPC.');
      sequenceTokenRef.current += 1; // a manual speak supersedes any sequence
      setPlaying(true);
      try {
        await playUtterance(profile, line);
      } finally {
        setPlaying(false);
      }
    },
    [supported, playUtterance],
  );

  const skip = useCallback(() => {
    cancelSpeech();
  }, [cancelSpeech]);

  const stopAll = useCallback(() => {
    sequenceTokenRef.current += 1;
    cancelSpeech();
    setPlaying(false);
  }, [cancelSpeech]);

  const speakSequence = useCallback(
    async (lines: { npcId: string; line: string }[]) => {
      if (mutedRef.current || !supported) return;
      const token = ++sequenceTokenRef.current;
      setPlaying(true);
      try {
        for (let i = 0; i < lines.length; i++) {
          if (token !== sequenceTokenRef.current || mutedRef.current) break;
          const { npcId, line } = lines[i];
          const profile = npcsRef.current.find((n) => n.id === npcId)?.voiceProfile;
          if (!line.trim() || !profile?.voiceURI) continue;
          await playUtterance(profile, line);
          if (token !== sequenceTokenRef.current || mutedRef.current) break;
          if (i < lines.length - 1) {
            await new Promise((r) => setTimeout(r, SEQUENCE_GAP_MS));
          }
        }
      } finally {
        if (token === sequenceTokenRef.current) setPlaying(false);
      }
    },
    [supported, playUtterance],
  );

  useEffect(() => () => stopAll(), [stopAll]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      isPro,
      enabled: isPro && supported,
      muted,
      setMuted,
      playing,
      npcVoiceProfile,
      npcName,
      speak,
      speakSequence,
      skip,
      stopAll,
    }),
    [
      isPro,
      supported,
      muted,
      setMuted,
      playing,
      npcVoiceProfile,
      npcName,
      speak,
      speakSequence,
      skip,
      stopAll,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
