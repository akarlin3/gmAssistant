'use client';

import { ArrowLeft, Flag, Swords, BookOpen } from 'lucide-react';

type PublishState = 'idle' | 'publishing' | 'done' | 'error';

type SessionHeaderProps = {
  sessionStartedAt: number;
  shareToken?: string;
  publishState: PublishState;
  onExitWithoutEnding: () => void;
  onOpenLibrary: () => void;
  onEndSession: () => void;
};

export function SessionHeader({
  sessionStartedAt,
  shareToken,
  publishState,
  onExitWithoutEnding,
  onOpenLibrary,
  onEndSession,
}: SessionHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onExitWithoutEnding}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
          title="Hide run mode without ending the session"
        >
          <ArrowLeft size={12} /> Hide
        </button>
        <button
          onClick={onOpenLibrary}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
          title="Open Library without ending the session"
        >
          <BookOpen size={12} /> Library
        </button>
        <h1 className="flex items-center gap-2 font-display text-lg tracking-wide text-ink sm:text-xl">
          <Swords size={18} className="text-crimson" /> Run Session
        </h1>
        <span className="font-serif text-xs italic text-ink-mute">
          Started {new Date(sessionStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {shareToken && (
          <div className="flex select-none items-center gap-1.5 rounded-full border border-rule/50 bg-parchment px-2.5 py-0.5 font-display text-[10px] uppercase tracking-wider shadow-sm">
            {publishState === 'publishing' ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brass opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-brass-deep"></span>
                </span>
                <span className="font-semibold text-brass-deep">Syncing...</span>
              </>
            ) : publishState === 'error' ? (
              <>
                <span className="size-2 rounded-full bg-crimson"></span>
                <span className="font-semibold text-crimson">Sync Error</span>
              </>
            ) : publishState === 'done' ? (
              <>
                <span className="size-2 rounded-full bg-moss"></span>
                <span className="font-semibold text-moss">Synced</span>
              </>
            ) : (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-moss opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-moss"></span>
                </span>
                <span className="font-semibold text-moss">Live Sharing</span>
              </>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onEndSession}
        className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
      >
        <Flag size={12} /> End Session
      </button>
    </header>
  );
}
