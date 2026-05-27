'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { useVoiceOptional } from './VoiceProvider';

type Props = {
  npcId: string;
  line: string;
  /** Fire once on mount (used by Scene Mode auto-play). Respects the mute toggle. */
  autoPlay?: boolean;
  className?: string;
  size?: number;
};

// Inline 🔊 control. Renders nothing unless voice is enabled (Pro + signed in)
// and the target NPC actually has a voice profile.
export function SpeakButton({ npcId, line, autoPlay, className, size = 14 }: Props) {
  const voice = useVoiceOptional();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fired, setFired] = useState(false);
  const didAuto = useRef(false);

  const enabled = !!voice?.enabled;
  const hasProfile = !!voice?.npcVoiceProfile(npcId);

  async function speak() {
    if (!voice) return;
    setLoading(true);
    setError(null);
    try {
      await voice.speak(npcId, line);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (didAuto.current) return;
    didAuto.current = true;
    if (autoPlay && enabled && hasProfile && voice && !voice.muted && line.trim()) {
      setFired(true);
      void speak();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled || !hasProfile || !line.trim()) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <button
        type="button"
        onClick={speak}
        disabled={loading}
        aria-label="Speak This Line"
        title="Speak This Line"
        className="rounded p-0.5 text-ink-mute transition-colors hover:text-crimson disabled:opacity-50"
      >
        {loading ? <Loader2 size={size} className="animate-spin" /> : <Volume2 size={size} />}
      </button>
      {error && <span className="font-serif text-[10px] text-crimson">{error}</span>}
      {fired && <span data-voice-autoplay-fired hidden />}
    </span>
  );
}
