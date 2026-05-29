'use client';

import { ExternalLink, Loader2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { PlayerState } from './types';

interface GMActivePlayerProps {
  iframeId: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playerState: PlayerState;
  isApiReady: boolean;
  ytPlayer: any;
  externalUrl: string;
  ytNormalUrl: string;
  togglePlay: () => void;
  toggleMute: () => void;
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDisconnect: () => void;
  scenariosSlot?: React.ReactNode;
}

export function GMActivePlayer({
  iframeId,
  isPlaying,
  isMuted,
  volume,
  playerState,
  isApiReady,
  ytPlayer,
  externalUrl,
  ytNormalUrl,
  togglePlay,
  toggleMute,
  handleVolumeChange,
  handleDisconnect,
  scenariosSlot,
}: GMActivePlayerProps) {
  return (
    <div className="space-y-4">
      <style>{`
        @keyframes yt-soundwave {
          0%, 100% { height: 4px; }
          50% { height: 24px; }
        }
        .yt-wave-bar {
          width: 3px;
          border-radius: 9999px;
          background-color: #b1201e;
          height: 4px;
        }
        .yt-wave-bar.animating {
          animation: yt-soundwave 1.2s ease-in-out infinite;
        }
      `}</style>

      <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-lg border border-rule/70 bg-parchment/65 p-4 shadow-inner backdrop-blur-md sm:flex-row">
        {/* Spinning Vinyl Record Visual */}
        <div className="relative flex size-24 flex-shrink-0 items-center justify-center sm:size-28">
          <div
            className={`relative flex size-20 items-center justify-center overflow-hidden rounded-full border-2 border-neutral-700 bg-neutral-900 shadow-lg transition-transform duration-300 sm:size-24 ${
              isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''
            }`}
            style={{
              backgroundImage: 'radial-gradient(circle, #333 10%, #111 30%, #222 40%, #111 60%, #333 70%, #111 80%, #000 100%)',
              animationPlayState: isPlaying ? 'running' : 'paused'
            }}
          >
            {/* Concentric Grooves */}
            <div className="absolute inset-2 rounded-full border border-neutral-800 opacity-60" />
            <div className="absolute inset-4 rounded-full border border-neutral-800 opacity-40" />
            <div className="absolute inset-6 rounded-full border border-neutral-800 opacity-30" />
            <div className="absolute inset-8 rounded-full border border-neutral-800 opacity-20" />

            {/* Vinyl Label */}
            <div className="relative flex size-8 items-center justify-center rounded-full border border-brass-deep/45 bg-brass/30 shadow-inner">
              <div className="flex size-2.5 items-center justify-center rounded-full border border-brass/50 bg-parchment-soft">
                <div className="size-1 rounded-full bg-neutral-950" />
              </div>
            </div>
          </div>

          {/* Audio tone arm / needle overlay */}
          <div className={`pointer-events-none absolute right-2 top-1 h-10 w-7 origin-[20%_10%] transition-transform duration-500 ${
            isPlaying ? 'rotate-12' : 'rotate-0'
          }`}>
            <svg viewBox="0 0 30 40" fill="none" className="size-full text-brass-deep drop-shadow-sm">
              <path d="M 5 5 Q 15 5 15 15 L 20 30 L 25 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="5" cy="5" r="3.5" fill="currentColor" />
              <rect x="22" y="28" width="5" height="6" rx="1.5" fill="#444" />
            </svg>
          </div>
        </div>

        {/* Custom Control Layout */}
        <div className="w-full flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-display text-sm font-semibold tracking-wide text-ink">
                Campaign Atmosphere
              </h3>
              <p className="truncate font-serif text-[11px] italic text-ink-soft">
                Live Broadcast from GM
              </p>
            </div>

            {/* Pulse Glow Light */}
            <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-rule/50 bg-parchment px-2 py-0.5 shadow-sm">
              <span className="relative flex size-2">
                <span className={`absolute inline-flex size-full animate-ping rounded-full bg-crimson opacity-75 ${isPlaying ? 'running' : 'paused'}`}></span>
                <span className="relative inline-flex size-2 rounded-full bg-crimson"></span>
              </span>
              <span className="font-display text-[9px] font-semibold uppercase tracking-wider text-ink-mute">
                {playerState === 'buffering' ? 'Buffering' : isPlaying ? 'Live' : 'Paused'}
              </span>
            </div>
          </div>

          {/* Sound wave visualizer */}
          <div className="flex h-7 items-end gap-1 rounded border border-rule/30 bg-parchment-soft/40 px-1 pt-1 shadow-inner">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => {
              const delay = `${0.08 * i}s`;
              const duration = `${0.6 + Math.random() * 0.7}s`;
              return (
                <div
                  key={i}
                  className={`yt-wave-bar ${isPlaying ? 'animating' : ''}`}
                  style={{
                    animationDelay: isPlaying ? delay : '0s',
                    animationDuration: isPlaying ? duration : '0s'
                  }}
                />
              );
            })}
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Skip Back */}
              <button
                type="button"
                onClick={() => ytPlayer?.previousVideo()}
                disabled={!isApiReady || !ytPlayer}
                className="flex size-8 items-center justify-center rounded-full border border-rule bg-parchment text-brass-deep transition-all hover:bg-parchment-deep disabled:opacity-50"
                aria-label="Previous song"
              >
                <SkipBack size={14} fill="currentColor" />
              </button>

              {/* Play/Pause Button */}
              <button
                type="button"
                onClick={togglePlay}
                disabled={!isApiReady}
                className="flex size-9 items-center justify-center rounded-full bg-crimson text-parchment shadow-md transition-all hover:scale-105 hover:bg-wine active:scale-95 disabled:opacity-50"
                aria-label={isPlaying ? 'Pause music' : 'Play music'}
              >
                {!isApiReady ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} className="ml-0.5" fill="currentColor" />
                )}
              </button>

              {/* Skip Forward */}
              <button
                type="button"
                onClick={() => ytPlayer?.nextVideo()}
                disabled={!isApiReady || !ytPlayer}
                className="flex size-8 items-center justify-center rounded-full border border-rule bg-parchment text-brass-deep transition-all hover:bg-parchment-deep disabled:opacity-50"
                aria-label="Next song"
              >
                <SkipForward size={14} fill="currentColor" />
              </button>

              {/* External Links */}
              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded border border-rule bg-parchment px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors hover:bg-parchment-deep"
                >
                  <ExternalLink size={10} /> YouTube Music
                </a>
                <a
                  href={ytNormalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded border border-rule bg-parchment px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors hover:bg-parchment-deep"
                >
                  <ExternalLink size={10} /> standard YouTube
                </a>
              </div>

              {/* Disconnect Playlist */}
              <button
                type="button"
                onClick={handleDisconnect}
                className="rounded border border-crimson/30 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-crimson transition-colors hover:border-wine/50 hover:text-wine"
              >
                Disconnect
              </button>
            </div>

            {/* Volume Controls */}
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
          </div>
        </div>
      </div>

      {/* Scenarios slot */}
      {scenariosSlot}

      {/* Bulletproof hidden off-screen container */}
      <div className="absolute overflow-hidden" style={{ width: '1px', height: '1px', opacity: 0.01, left: '-9999px', top: '-9999px' }}>
        <div id={iframeId} />
      </div>
    </div>
  );
}
