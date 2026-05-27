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
import { getFirebaseAuth, getStorageClient } from '@/lib/firebase/client';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { voiceHash } from '@/lib/voice/hash';
import {
  VOICE_CACHE_CAP,
  type VoiceCacheEntry,
  type VoiceProfile,
} from '@/lib/voice/types';

const MUTE_KEY = 'voiceMuted';
const SEQUENCE_GAP_MS = 200;

type LooseNpc = Record<string, unknown> & {
  id?: string;
  name?: string;
  voiceProfile?: VoiceProfile;
};

export type VoiceContextValue = {
  isPro: boolean;
  /** Voice generation is available (Pro + a signed-in user). */
  enabled: boolean;
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** True while any clip is playing. */
  playing: boolean;
  /** Most recent quota snapshot from the speak endpoint, if any. */
  usage: { used: number; limit: number } | null;
  /** Resolve an NPC's voice profile, or null when it has none. */
  npcVoiceProfile: (npcId: string) => VoiceProfile | null;
  npcName: (npcId: string) => string;
  /** How many of this NPC's lines are currently cached. */
  cachedCount: (npcId: string) => number;
  /** Whether a line is already cached (no network call needed to speak it). */
  isCached: (npcId: string, line: string) => Promise<boolean>;
  /** Generate-or-fetch then play a single line. Resolves when playback ends. */
  speak: (npcId: string, line: string) => Promise<void>;
  /** Play several lines in order with a short gap; respects skip/stop. */
  speakSequence: (lines: { npcId: string; line: string }[]) => Promise<void>;
  /** Skip the currently-playing clip (sequence advances to the next line). */
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

type Props = {
  campaignId: string;
  uid: string | null;
  isPro: boolean;
  npcs: LooseNpc[];
  voiceCache: VoiceCacheEntry[];
  onVoiceCacheChange: (next: VoiceCacheEntry[]) => void;
  children: React.ReactNode;
};

export function VoiceProvider({
  uid,
  isPro,
  npcs,
  voiceCache,
  onVoiceCacheChange,
  children,
}: Props) {
  const [muted, setMutedState] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  // Refs to dodge stale closures during async/sequential playback.
  const cacheRef = useRef(voiceCache);
  cacheRef.current = voiceCache;
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolveCurrentRef = useRef<(() => void) | null>(null);
  const sequenceTokenRef = useRef(0);

  useEffect(() => {
    try {
      setMutedState(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (m) {
      // Silence session-wide immediately.
      sequenceTokenRef.current += 1;
      const a = audioRef.current;
      if (a) a.pause();
      resolveCurrentRef.current?.();
    }
  }, []);

  const npcName = useCallback(
    (npcId: string) =>
      (npcsRef.current.find((n) => n.id === npcId)?.name as string) || 'Unknown NPC',
    [],
  );

  const npcVoiceProfile = useCallback((npcId: string): VoiceProfile | null => {
    const p = npcsRef.current.find((n) => n.id === npcId)?.voiceProfile;
    return p && p.provider && p.voiceId ? p : null;
  }, []);

  const cachedCount = useCallback(
    (npcId: string) => voiceCache.filter((e) => e.npcId === npcId).length,
    [voiceCache],
  );

  const isCached = useCallback(async (npcId: string, line: string) => {
    const profile = npcsRef.current.find((n) => n.id === npcId)?.voiceProfile;
    if (!profile) return false;
    const hash = await voiceHash(npcId, profile, line);
    return cacheRef.current.some((e) => e.hash === hash);
  }, []);

  // Play a URL; resolves when the clip ends, errors, or is skipped/stopped.
  const playClip = useCallback((url: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const prev = audioRef.current;
      if (prev) prev.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        if (resolveCurrentRef.current === done) resolveCurrentRef.current = null;
        resolve();
      };
      resolveCurrentRef.current = done;
      audio.addEventListener('ended', done);
      audio.addEventListener('error', done);
      audio.play().catch(() => done());
    });
  }, []);

  // Core generate-or-fetch for one line. Returns the playable URL or throws.
  const resolveUrl = useCallback(
    async (npcId: string, line: string): Promise<string> => {
      const profile = npcsRef.current.find((n) => n.id === npcId)?.voiceProfile;
      if (!profile || !profile.provider || !profile.voiceId) {
        throw new Error('No voice profile set for this NPC.');
      }
      const hash = await voiceHash(npcId, profile, line);
      const hit = cacheRef.current.find((e) => e.hash === hash);
      if (hit) return hit.url;

      if (!uid) throw new Error('Not signed in.');
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in.');

      const res = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ voiceProfile: profile, line }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(error || `HTTP ${res.status}`);
      }
      const used = Number(res.headers.get('X-Voice-Chars-Used'));
      const limit = Number(res.headers.get('X-Voice-Chars-Limit'));
      if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
        setUsage({ used, limit });
      }
      const blob = await res.blob();

      // Persist: upload to Storage, then record the metadata on the campaign.
      const path = `voice/${uid}/${hash}.mp3`;
      const fileRef = storageRef(getStorageClient(), path);
      await uploadBytes(fileRef, blob, { contentType: 'audio/mpeg' });
      const url = await getDownloadURL(fileRef);

      const entry: VoiceCacheEntry = { hash, storagePath: path, url, createdAt: Date.now(), npcId };
      const next = [...cacheRef.current.filter((e) => e.hash !== hash), entry];
      while (next.length > VOICE_CACHE_CAP) {
        const evicted = next.shift();
        if (evicted) {
          deleteObject(storageRef(getStorageClient(), evicted.storagePath)).catch(() => {});
        }
      }
      cacheRef.current = next;
      onVoiceCacheChange(next);
      return url;
    },
    [uid, onVoiceCacheChange],
  );

  const speak = useCallback(
    async (npcId: string, line: string) => {
      if (!line.trim()) return;
      setPlaying(true);
      try {
        const url = await resolveUrl(npcId, line);
        await playClip(url);
      } finally {
        setPlaying(false);
      }
    },
    [resolveUrl, playClip],
  );

  const skip = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    resolveCurrentRef.current?.();
  }, []);

  const stopAll = useCallback(() => {
    sequenceTokenRef.current += 1;
    const a = audioRef.current;
    if (a) a.pause();
    resolveCurrentRef.current?.();
    setPlaying(false);
  }, []);

  const speakSequence = useCallback(
    async (lines: { npcId: string; line: string }[]) => {
      if (mutedRef.current) return;
      const token = ++sequenceTokenRef.current;
      setPlaying(true);
      try {
        for (let i = 0; i < lines.length; i++) {
          if (token !== sequenceTokenRef.current || mutedRef.current) break;
          const { npcId, line } = lines[i];
          if (!line.trim() || !npcsRef.current.find((n) => n.id === npcId)?.voiceProfile) continue;
          try {
            const url = await resolveUrl(npcId, line);
            if (token !== sequenceTokenRef.current || mutedRef.current) break;
            await playClip(url);
          } catch {
            // Skip a line that fails to generate; keep the sequence going.
          }
          if (i < lines.length - 1 && token === sequenceTokenRef.current && !mutedRef.current) {
            await new Promise((r) => setTimeout(r, SEQUENCE_GAP_MS));
          }
        }
      } finally {
        if (token === sequenceTokenRef.current) setPlaying(false);
      }
    },
    [resolveUrl, playClip],
  );

  useEffect(() => () => stopAll(), [stopAll]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      isPro,
      enabled: isPro && !!uid,
      muted,
      setMuted,
      playing,
      usage,
      npcVoiceProfile,
      npcName,
      cachedCount,
      isCached,
      speak,
      speakSequence,
      skip,
      stopAll,
    }),
    [
      isPro,
      uid,
      muted,
      setMuted,
      playing,
      usage,
      npcVoiceProfile,
      npcName,
      cachedCount,
      isCached,
      speak,
      speakSequence,
      skip,
      stopAll,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
