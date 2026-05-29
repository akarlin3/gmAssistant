'use client';

import { Music, Play, Volume2, VolumeX } from 'lucide-react';
import type { PlayerState } from './types';

interface PlayerReadOnlyViewProps {
  iframeId: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playerState: PlayerState;
  isApiReady: boolean;
  isPlayingProp?: boolean;
  togglePlay: () => void;
  toggleMute: () => void;
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PlayerReadOnlyView({
  iframeId,
  isPlaying,
  isMuted,
  volume,
  playerState,
  isApiReady,
  isPlayingProp,
  togglePlay,
  toggleMute,
  handleVolumeChange,
}: PlayerReadOnlyViewProps) {
  const autoplayBlocked = isApiReady && !!isPlayingProp && !isPlaying && playerState !== 'buffering';

  return (
    <div className="flex flex-row items-center justify-between gap-4 overflow-hidden rounded-lg border border-rule/70 bg-parchment-soft px-4 py-2.5 text-xs shadow-sm">
      {/* Left Side: Status / Music Icon / Small Label */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex flex-shrink-0 items-center justify-center">
          {autoplayBlocked ? (
            <button
              type="button"
              onClick={togglePlay}
              className="flex size-6 items-center justify-center rounded-full bg-crimson text-parchment shadow-sm transition-all hover:bg-wine active:scale-95"
              title="Your browser blocked autoplay — tap to start music"
              aria-label="Start music"
            >
              <Play size={11} fill="currentColor" className="ml-0.5" />
            </button>
          ) : (
            <>
              <Music className={`${isPlaying ? 'animate-pulse text-crimson' : 'text-ink-mute'}`} size={16} />
              {isPlaying && (
                <span className="absolute -right-0.5 -top-0.5 flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-crimson opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-crimson"></span>
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-ink">
            Live Music
          </span>
          <span className="size-1.5 rounded-full bg-rule/70" />
          <span className={`truncate font-serif text-xs italic text-ink-soft`}>
            {playerState === 'buffering'
              ? 'Buffering...'
              : isPlaying
                ? 'Playing'
                : autoplayBlocked
                  ? 'Tap ▶ to play'
                  : 'Paused'}
          </span>
        </div>
      </div>

      {/* Right Side: Volume Controls */}
      <div className="flex w-32 flex-shrink-0 items-center justify-end gap-2.5 sm:w-44">
        <button
          type="button"
          onClick={toggleMute}
          className="flex-shrink-0 p-1 text-ink-mute transition-colors hover:text-crimson focus:outline-none"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-rule/50 accent-crimson focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Bulletproof hidden off-screen container */}
      <div className="absolute overflow-hidden" style={{ width: '1px', height: '1px', opacity: 0.01, left: '-9999px', top: '-9999px' }}>
        <div id={iframeId} />
      </div>
    </div>
  );
}
