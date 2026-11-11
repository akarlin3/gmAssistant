// Tabletop OS Ergonomics:
//   1. Screen Wake Lock (`navigator.wakeLock.request('screen')`) with automatic
//      re-acquisition on `visibilitychange`.
//   2. True OS-Level Floating Mini-HUD (`window.documentPictureInPicture` primary
//      engine with `<style>` / `<link>` head cloning + universal `<canvas>`
//      `captureStream(10)` -> `<video>` `requestPictureInPicture()` fallback
//      wired to `navigator.mediaSession`).
//   3. Hands-Free Voice Session Log (`SpeechRecognition` / `webkitSpeechRecognition`)
//      with automatic `@-mention` entity matching.

export type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export type TableHudSnapshot = {
  campaignName?: string;
  round?: number;
  activeTurnName?: string;
  activeTurnLabel?: string;
  subjectName: string;
  hpCurrent: number;
  hpMax: number;
  hpTemp?: number;
  ac: number;
  lastRollText?: string;
  latestFeedLine: string;
};

export type TableHudStateSnapshot = TableHudSnapshot;

// ---- 1. Tabletop Screen Wake Lock ------------------------------------------

export function isWakeLockSupported(nav?: any): boolean {
  const n = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  return Boolean(n && 'wakeLock' in n && typeof n.wakeLock?.request === 'function');
}

export type WakeLockController = {
  isActive: () => boolean;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  toggle: () => Promise<boolean>;
  subscribe: (cb: (active: boolean) => void) => () => void;
  destroy: () => Promise<void>;
};

export function createWakeLockController(opts?: {
  onStatusChange?: (active: boolean, error?: string) => void;
  nav?: any;
  doc?: Document;
}): WakeLockController {
  const nav = opts?.nav ?? (typeof navigator !== 'undefined' ? (navigator as any) : undefined);
  const doc = opts?.doc ?? (typeof document !== 'undefined' ? document : undefined);

  let desired = false;
  let sentinel: WakeLockSentinelLike | null = null;
  const listeners = new Set<(active: boolean) => void>();

  const notify = (active: boolean, error?: string) => {
    opts?.onStatusChange?.(active, error);
    for (const cb of listeners) {
      try {
        cb(active);
      } catch {
        /* ignore */
      }
    }
  };

  const acquire = async (): Promise<boolean> => {
    if (!isWakeLockSupported(nav)) {
      notify(false, 'Screen Wake Lock API is not supported on this browser.');
      return false;
    }
    try {
      sentinel = (await nav.wakeLock.request('screen')) as WakeLockSentinelLike;
      sentinel?.addEventListener?.('release', () => {
        if (!desired) {
          notify(false);
        }
      });
      notify(true);
      return true;
    } catch (err: any) {
      notify(false, err?.message || 'Wake lock request declined');
      return false;
    }
  };

  const handleVisibilityChange = () => {
    if (!desired || !doc) return;
    if (doc.visibilityState === 'visible') {
      void acquire();
    }
  };

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return {
    isActive() {
      return Boolean(desired && sentinel && !sentinel.released);
    },
    async enable() {
      desired = true;
      return acquire();
    },
    async disable() {
      desired = false;
      if (sentinel) {
        try {
          await sentinel.release();
        } catch {
          /* ignore */
        }
        sentinel = null;
      }
      notify(false);
    },
    async toggle() {
      if (desired && sentinel && !sentinel.released) {
        await this.disable();
        return false;
      }
      return this.enable();
    },
    subscribe(cb: (active: boolean) => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    async destroy() {
      desired = false;
      listeners.clear();
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (sentinel) {
        try {
          await sentinel.release();
        } catch {
          /* ignore */
        }
        sentinel = null;
      }
    },
  };
}

// ---- 2. Document Picture-in-Picture & Canvas Stream Fallback ---------------

export function isDocumentPiPSupported(win?: any): boolean {
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  return Boolean(
    w &&
      'documentPictureInPicture' in w &&
      typeof w.documentPictureInPicture?.requestWindow === 'function',
  );
}

/**
 * Clones all `<style>` and stylesheet `<link>` tags from `sourceDoc.head` into
 * `targetDoc.head` and copies root theme classes so the portal HUD renders with
 * full Tailwind & custom theme styling.
 */
export function cloneDocumentStylesToPiPWindow(sourceDoc: Document, targetDoc: Document): void {
  try {
    targetDoc.documentElement.className = sourceDoc.documentElement.className;
    targetDoc.body.className = sourceDoc.body.className;
    targetDoc.body.style.margin = '0';
    targetDoc.body.style.overflow = 'hidden';

    const nodes = sourceDoc.head.querySelectorAll('style, link[rel="stylesheet"]');
    nodes.forEach((node) => {
      const cloned = node.cloneNode(true);
      targetDoc.head.appendChild(cloned);
    });
  } catch {
    /* ignore cross-origin stylesheet cloning warnings */
  }
}

/**
 * Renders the universal fallback Mini-HUD onto a 340x220 `<canvas>` for
 * browsers without `documentPictureInPicture` (piped into `canvas.captureStream(10)`
 * and `<video>.requestPictureInPicture()`).
 */
export function renderFallbackHudCanvas(
  canvas: HTMLCanvasElement,
  snap: TableHudSnapshot,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = (canvas.width = 340);
  const h = (canvas.height = 220);

  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#b48a3e';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.fillStyle = '#292524';
  ctx.fillRect(6, 6, w - 12, 36);

  ctx.fillStyle = '#d6b36a';
  ctx.font = 'bold 11px Georgia, serif';
  const roundLabel = snap.round ? `ROUND ${snap.round}` : 'TABLE HUD';
  ctx.fillText(roundLabel, 14, 22);

  ctx.fillStyle = '#fafaf9';
  ctx.font = 'bold 13px Georgia, serif';
  const turnLabel = snap.activeTurnName || snap.activeTurnLabel;
  const turnText = turnLabel
    ? `Turn: ${turnLabel}`
    : snap.campaignName || 'Live Session';
  ctx.fillText(turnText.slice(0, 32), 14, 37);

  ctx.fillStyle = '#e7e5e4';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText(snap.subjectName.slice(0, 26), 14, 68);

  const hpPct = snap.hpMax > 0 ? Math.max(0, Math.min(1, snap.hpCurrent / snap.hpMax)) : 1;
  ctx.fillStyle = '#44403c';
  ctx.fillRect(14, 78, 200, 18);
  ctx.fillStyle = hpPct > 0.5 ? '#15803d' : hpPct > 0.25 ? '#ca8a04' : '#b91c1c';
  ctx.fillRect(14, 78, Math.round(200 * hpPct), 18);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  const tempSuffix = snap.hpTemp ? ` (+${snap.hpTemp})` : '';
  ctx.fillText(`HP ${snap.hpCurrent}/${snap.hpMax}${tempSuffix}`, 20, 91);

  ctx.fillStyle = '#292524';
  ctx.strokeStyle = '#b48a3e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(228, 62, 94, 36);
  ctx.fillStyle = '#d6b36a';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`AC ${snap.ac}`, 254, 84);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`🎲 ${snap.lastRollText || 'Ready to roll (d20)'}`.slice(0, 38), 14, 125);

  ctx.fillStyle = '#a8a29e';
  ctx.font = 'italic 11px Georgia, serif';
  const feed = snap.latestFeedLine || 'No session feed events yet.';
  ctx.fillText(feed.slice(0, 44), 14, 155);
  if (feed.length > 44) {
    ctx.fillText(`${feed.slice(44, 85)}…`, 14, 172);
  }
}

export function setupMediaSessionForPiP(handlers: {
  title?: string;
  artist?: string;
  onNextTurn?: () => void;
  onPrevTurn?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  onRollD20?: () => void;
}): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {};
  }
  const nextFn = handlers.onNextTurn ?? handlers.onNextTrack;
  const prevFn = handlers.onPrevTurn ?? handlers.onPreviousTrack;
  try {
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: handlers.title || 'gmAssistant Table HUD',
        artist: handlers.artist || 'Active Turn & Dice Roller',
      });
    }
    if (nextFn) {
      navigator.mediaSession.setActionHandler('nexttrack', () => nextFn());
    }
    if (prevFn) {
      navigator.mediaSession.setActionHandler('previoustrack', () => prevFn());
    }
    if (handlers.onRollD20) {
      navigator.mediaSession.setActionHandler('play', () => handlers.onRollD20?.());
      navigator.mediaSession.setActionHandler('pause', () => handlers.onRollD20?.());
    }
  } catch {
    /* ignore unsupported mediaSession actions */
  }
  return () => {
    try {
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
    } catch {
      /* ignore */
    }
  };
}

export function rollTableHudDie(
  sides: number = 20,
  modifierOrRng?: number | (() => number),
  customLabel?: string,
  rngArg?: () => number,
): {
  sides: number;
  value: number;
  modifier: number;
  total: number;
  label: string;
  summary: string;
  isCrit: boolean;
  isFumble: boolean;
} {
  const s = Math.max(2, Math.floor(sides));
  const modifier = typeof modifierOrRng === 'number' ? modifierOrRng : 0;
  const rng =
    typeof modifierOrRng === 'function'
      ? modifierOrRng
      : typeof rngArg === 'function'
        ? rngArg
        : Math.random;
  const value = Math.min(s, Math.max(1, Math.floor(rng() * s) + 1));
  const total = value + modifier;
  const isCrit = s === 20 && value === 20;
  const isFumble = s === 20 && value === 1;
  const tag = isCrit ? ' (NAT 20!)' : isFumble ? ' (NAT 1!)' : '';
  const dieLabel = customLabel || `d${s}`;
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
  const summary = `🎲 ${dieLabel}${modStr}: ${total}${tag}`;
  return {
    sides: s,
    value,
    modifier,
    total,
    label: `d${s}: ${total}${tag}`,
    summary,
    isCrit,
    isFumble,
  };
}

// ---- 3. Hands-Free Voice Session Log (`Web Speech API`) --------------------

export function getSpeechRecognitionConstructor(win?: any): any | null {
  const w = win ?? (typeof window !== 'undefined' ? (window as any) : undefined);
  if (!w) return null;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(win?: any): boolean {
  return Boolean(getSpeechRecognitionConstructor(win));
}

/**
 * Formats a raw spoken transcript so recognized campaign entity names become
 * `@EntityName` mention-ready tokens (unless already prefixed with `@`).
 */
export function formatTranscriptWithMentions(
  transcript: string,
  entityNames: ReadonlyArray<string> = [],
): string {
  const text = (transcript ?? '').trim();
  if (!text) return '';

  const sortedNames = [...entityNames]
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length);

  let formatted = text;
  for (const name of sortedNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!@)\\b(${escaped})\\b`, 'gi');
    formatted = formatted.replace(regex, `@${name}`);
  }
  return formatted;
}

export const formatSpokenTextWithMentions = formatTranscriptWithMentions;

export type VoiceDictationController = {
  start: () => boolean;
  stop: () => void;
  isListening: () => boolean;
};

export function createVoiceDictationController(opts: {
  entityNames?: ReadonlyArray<string>;
  knownEntityNames?: ReadonlyArray<string>;
  lang?: string;
  onTranscript: (formattedText: string, isFinal: boolean) => void;
  onStateChange?: (listening: boolean, error?: string) => void;
  win?: any;
}): VoiceDictationController {
  const Ctor = getSpeechRecognitionConstructor(opts.win);
  let recognition: any = null;
  let listening = false;
  const names = opts.entityNames ?? opts.knownEntityNames ?? [];

  return {
    start() {
      if (!Ctor) {
        opts.onStateChange?.(false, 'Web Speech API dictation is not supported in this browser.');
        return false;
      }
      try {
        recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = opts.lang || 'en-US';

        recognition.onstart = () => {
          listening = true;
          opts.onStateChange?.(true);
        };

        recognition.onresult = (event: any) => {
          let finalChunk = '';
          let interimChunk = '';
          const results = event?.results;
          if (!results) return;
          for (let i = event.resultIndex ?? 0; i < results.length; i++) {
            const res = results[i];
            const transcript = res?.[0]?.transcript ?? '';
            if (res?.isFinal) {
              finalChunk += transcript;
            } else {
              interimChunk += transcript;
            }
          }
          if (finalChunk.trim()) {
            const formatted = formatTranscriptWithMentions(finalChunk, names);
            opts.onTranscript(formatted, true);
          } else if (interimChunk.trim()) {
            opts.onTranscript(interimChunk.trim(), false);
          }
        };

        recognition.onerror = (event: any) => {
          listening = false;
          opts.onStateChange?.(false, event?.error || 'Speech recognition error');
        };

        recognition.onend = () => {
          listening = false;
          opts.onStateChange?.(false);
        };

        recognition.start();
        listening = true;
        opts.onStateChange?.(true);
        return true;
      } catch (err: any) {
        listening = false;
        opts.onStateChange?.(false, err?.message || 'Could not start microphone dictation');
        return false;
      }
    },
    stop() {
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
        recognition = null;
      }
      listening = false;
      opts.onStateChange?.(false);
    },
    isListening() {
      return listening;
    },
  };
}
