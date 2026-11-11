'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cloneDocumentStylesToPiPWindow,
  createVoiceDictationController,
  createWakeLockController,
  isDocumentPiPSupported,
  isSpeechRecognitionSupported,
  renderFallbackHudCanvas,
  rollTableHudDie,
  setupMediaSessionForPiP,
  type TableHudStateSnapshot,
} from '@/lib/tabletopErgonomics';

export interface ExternalTablePiPProps {
  role?: 'gm' | 'standalone-player' | 'shared-player';
  campaignName?: string;
  initiative?: {
    round?: number;
    activeId?: string | null;
    entries?: Array<{ id: string; name: string }>;
  } | null;
  activePc?: {
    id?: string;
    name?: string;
    currentHp?: number;
    maxHp?: number;
    hp?: { current?: number; max?: number; temp?: number };
    ac?: number;
  } | null;
  /** Active combat/initiative turn label (e.g. "Aria the Bard"). */
  activeTurnLabel?: string;
  /** Active combat round number. */
  round?: number;
  /** Primary subject name (PC name or active combatant). */
  subjectName?: string;
  hpCurrent?: number;
  hpMax?: number;
  ac?: number;
  latestFeedLine?: string;
  /** Known entity names for @-mention voice formatting. */
  knownEntityNames?: string[];
  onAdjustHp?: (delta: number) => void;
  onAdjustPcHp?: (delta: number) => void;
  onAdjustAc?: (delta: number) => void;
  onAdjustPcAc?: (delta: number) => void;
  onAdvanceTurn?: () => void;
  onRollRecorded?: (summary: string) => void;
  /** Enable keyboard hotkey `P` (when not typing in an input/textarea). */
  enableHotkeyP?: boolean;
}

export function ExternalTablePiP({
  campaignName,
  initiative,
  activePc,
  activeTurnLabel: activeTurnLabelProp,
  round: roundProp,
  subjectName: subjectNameProp,
  hpCurrent: hpCurrentProp,
  hpMax: hpMaxProp,
  ac: acProp,
  latestFeedLine = 'Ready at the table.',
  onAdjustHp,
  onAdjustPcHp,
  onAdjustAc,
  onAdjustPcAc,
  onAdvanceTurn,
  onRollRecorded,
  enableHotkeyP = true,
}: ExternalTablePiPProps) {
  const activeCombatant = initiative?.entries?.find((e) => e.id === initiative.activeId);
  const activeTurnLabel =
    activeTurnLabelProp || activeCombatant?.name || campaignName || 'Exploration / Free Play';
  const round = roundProp ?? initiative?.round ?? 1;
  const subjectName = subjectNameProp || activePc?.name || 'Party HUD';
  const hpCurrent =
    hpCurrentProp ?? activePc?.currentHp ?? activePc?.hp?.current ?? 24;
  const hpMax =
    hpMaxProp ?? activePc?.maxHp ?? activePc?.hp?.max ?? 24;
  const ac = acProp ?? activePc?.ac ?? 15;
  const handleAdjustHpCb = onAdjustHp ?? onAdjustPcHp;
  const handleAdjustAcCb = onAdjustAc ?? onAdjustPcAc;

  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [pipPortalContainer, setPipPortalContainer] = useState<HTMLElement | null>(null);
  const [fallbackPiPActive, setFallbackPiPActive] = useState(false);
  const [localHp, setLocalHp] = useState(hpCurrent);
  const [localAc, setLocalAc] = useState(ac);
  const [lastRollText, setLastRollText] = useState<string>(latestFeedLine);

  const wakeLockRef = useRef<ReturnType<typeof createWakeLockController> | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setLocalHp(hpCurrent);
  }, [hpCurrent]);

  useEffect(() => {
    setLocalAc(ac);
  }, [ac]);

  useEffect(() => {
    if (latestFeedLine) setLastRollText(latestFeedLine);
  }, [latestFeedLine]);

  // Setup Wake Lock controller
  useEffect(() => {
    const ctrl = createWakeLockController();
    wakeLockRef.current = ctrl;
    const unsub = ctrl.subscribe(setWakeLockActive);
    return () => {
      unsub();
      void ctrl.disable();
    };
  }, []);

  const handleToggleWakeLock = async () => {
    if (!wakeLockRef.current) return;
    await wakeLockRef.current.toggle();
  };

  const adjustHp = useCallback(
    (delta: number) => {
      setLocalHp((prev) => Math.max(0, Math.min(hpMax || 999, prev + delta)));
      handleAdjustHpCb?.(delta);
    },
    [hpMax, handleAdjustHpCb],
  );

  const adjustAc = useCallback(
    (delta: number) => {
      setLocalAc((prev) => Math.max(0, Math.min(50, prev + delta)));
      handleAdjustAcCb?.(delta);
    },
    [handleAdjustAcCb],
  );

  const triggerQuickRoll = useCallback(
    (sides: number) => {
      const res = rollTableHudDie(sides, 0, `d${sides}`);
      setLastRollText(res.summary);
      onRollRecorded?.(res.summary);
    },
    [onRollRecorded],
  );

  // Keep fallback canvas updated whenever HUD state changes
  useEffect(() => {
    if (!fallbackCanvasRef.current) return;
    const snapshot: TableHudStateSnapshot = {
      activeTurnLabel,
      round,
      subjectName,
      hpCurrent: localHp,
      hpMax,
      ac: localAc,
      latestFeedLine: lastRollText,
    };
    renderFallbackHudCanvas(fallbackCanvasRef.current, snapshot);
  }, [activeTurnLabel, round, subjectName, localHp, hpMax, localAc, lastRollText]);

  const closePiP = useCallback(() => {
    if (pipWindowRef.current) {
      try {
        pipWindowRef.current.close();
      } catch {
        // ignore
      }
      pipWindowRef.current = null;
    }
    setPipPortalContainer(null);
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {});
    }
    setFallbackPiPActive(false);
  }, []);

  const openPiP = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (pipPortalContainer || fallbackPiPActive) {
      closePiP();
      return;
    }

    // Primary Engine: Document Picture-in-Picture API
    if (isDocumentPiPSupported()) {
      try {
        const dpip = (window as any).documentPictureInPicture;
        const pipWin: Window = await dpip.requestWindow({ width: 340, height: 220 });
        pipWindowRef.current = pipWin;
        cloneDocumentStylesToPiPWindow(document, pipWin.document);
        pipWin.document.body.style.margin = '0';
        pipWin.document.body.style.backgroundColor = '#020617';
        pipWin.document.body.style.color = '#f8fafc';
        const mountNode = pipWin.document.createElement('div');
        pipWin.document.body.appendChild(mountNode);
        pipWin.addEventListener('pagehide', () => {
          setPipPortalContainer(null);
          pipWindowRef.current = null;
        });
        setPipPortalContainer(mountNode);
        return;
      } catch {
        // Fall through to universal canvas stream fallback
      }
    }

    // Universal Fallback: Offscreen <canvas> -> captureStream(10) -> <video muted playsInline> -> requestPictureInPicture()
    try {
      let canvas = fallbackCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 340;
        canvas.height = 220;
        fallbackCanvasRef.current = canvas;
      }
      renderFallbackHudCanvas(canvas, {
        activeTurnLabel,
        round,
        subjectName,
        hpCurrent: localHp,
        hpMax,
        ac: localAc,
        latestFeedLine: lastRollText,
      });

      let video = fallbackVideoRef.current;
      if (!video) {
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        fallbackVideoRef.current = video;
      }

      if (typeof (canvas as any).captureStream === 'function') {
        const stream = (canvas as any).captureStream(10);
        video.srcObject = stream;
        await video.play().catch(() => {});
        setupMediaSessionForPiP({
          title: `${subjectName} — Round ${round}`,
          artist: activeTurnLabel,
          onNextTrack: () => onAdvanceTurn?.(),
          onPreviousTrack: () => triggerQuickRoll(20),
        });
        if (typeof (video as any).requestPictureInPicture === 'function') {
          await (video as any).requestPictureInPicture();
        }
      }
      setFallbackPiPActive(true);
    } catch {
      // Fallback inline floating mini-HUD if browser blocks PiP in headless/test context
      setFallbackPiPActive(true);
    }
  }, [
    activeTurnLabel,
    closePiP,
    fallbackPiPActive,
    hpMax,
    lastRollText,
    localAc,
    localHp,
    onAdvanceTurn,
    pipPortalContainer,
    round,
    subjectName,
    triggerQuickRoll,
  ]);

  // Hotkey `P` support to pop out Table HUD
  useEffect(() => {
    if (!enableHotkeyP || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        void openPiP();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enableHotkeyP, openPiP]);

  const miniHudContent = (
    <div
      style={{
        width: '100%',
        minHeight: '190px',
        boxSizing: 'border-box',
        padding: '10px 12px',
        background: 'linear-gradient(160deg, #020617 0%, #0f172a 100%)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '8px',
      }}
    >
      {/* Active Turn & Round Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#1e293b',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '8px',
          padding: '5px 8px',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8' }}>
          ⚔️ R{round} • {activeTurnLabel}
        </div>
        {onAdvanceTurn && (
          <button
            type="button"
            onClick={onAdvanceTurn}
            style={{
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Next Turn →
          </button>
        )}
      </div>

      {/* Compact HP / AC Adjusters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700 }}>
          {subjectName}:{' '}
          <span style={{ color: '#4ade80' }}>
            {localHp}/{hpMax} HP
          </span>{' '}
          • <span style={{ color: '#cbd5e1' }}>AC {localAc}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => adjustHp(-1)}
            style={{
              background: '#7f1d1d',
              color: '#fecaca',
              border: '1px solid #ef4444',
              borderRadius: '5px',
              padding: '2px 6px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            -1 HP
          </button>
          <button
            type="button"
            onClick={() => adjustHp(1)}
            style={{
              background: '#14532d',
              color: '#bbf7d0',
              border: '1px solid #22c55e',
              borderRadius: '5px',
              padding: '2px 6px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            +1 HP
          </button>
          <button
            type="button"
            onClick={() => adjustAc(1)}
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #475569',
              borderRadius: '5px',
              padding: '2px 5px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            AC+
          </button>
        </div>
      </div>

      {/* 1-Click d20 / Dice Roller */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {[20, 12, 10, 8, 6, 4].map((sides) => (
          <button
            key={sides}
            type="button"
            onClick={() => triggerQuickRoll(sides)}
            style={{
              background: sides === 20 ? '#d97706' : '#1e293b',
              color: '#fff',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              borderRadius: '6px',
              padding: '3px 7px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🎲 d{sides}
          </button>
        ))}
      </div>

      {/* Latest Session / Roll Feed Line */}
      <div
        style={{
          fontSize: '11px',
          color: '#fcd34d',
          background: 'rgba(15, 23, 42, 0.9)',
          borderRadius: '6px',
          padding: '4px 8px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {lastRollText}
      </div>
    </div>
  );

  const isPipOpen = Boolean(pipPortalContainer || fallbackPiPActive);

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {/* Keep Screen Awake Toggle */}
      <button
        type="button"
        onClick={() => void handleToggleWakeLock()}
        aria-pressed={wakeLockActive}
        title="Prevent phone/tablet screen from dimming at the physical table (Wake Lock API)"
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
          wakeLockActive
            ? 'border-amber-500/60 bg-amber-500/20 text-amber-600 dark:text-amber-200'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-amber-500/40'
        }`}
      >
        {wakeLockActive ? '☀️ Screen Awake' : '🌙 Keep Screen Awake'}
      </button>

      {/* Pop Out Table HUD Button */}
      <button
        type="button"
        onClick={() => void openPiP()}
        title="Pop Out Always-On-Top Floating Table Mini-HUD (Hotkey: P)"
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
          isPipOpen
            ? 'border-sky-500/60 bg-sky-500/20 text-sky-600 dark:text-sky-200'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-sky-500/40'
        }`}
      >
        {isPipOpen ? '🪟 Close Floating HUD (P)' : '🪟 Pop Out Table HUD (P)'}
      </button>

      {/* Document PiP Portal */}
      {pipPortalContainer && createPortal(miniHudContent, pipPortalContainer)}

      {/* Universal Fallback Floating Mini-HUD when Document PiP is unavailable */}
      {fallbackPiPActive && !pipPortalContainer && (
        <div
          className="fixed bottom-4 right-4 z-50 w-[340px] overflow-hidden rounded-xl border border-sky-500/50 shadow-2xl"
          role="region"
          aria-label="Floating Table Mini-HUD"
        >
          <div className="flex items-center justify-between bg-slate-900 px-3 py-1 text-[10px] text-slate-400 border-b border-slate-800">
            <span>FLOATING TABLE MINI-HUD (Canvas PiP Stream Active)</span>
            <button
              type="button"
              onClick={closePiP}
              className="text-slate-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          {miniHudContent}
        </div>
      )}
    </div>
  );
}

export interface VoiceDictationButtonProps {
  /** Called with formatted (@-mention-ready) spoken transcript text. */
  onTranscript: (text: string) => void;
  /** Known entity names to auto-prefix with `@` when spoken. */
  knownEntityNames?: string[];
  entityNames?: string[];
  className?: string;
  label?: string;
  compact?: boolean;
}

export function VoiceDictationButton({
  onTranscript,
  knownEntityNames,
  entityNames,
  className = '',
  label = 'Dictate',
  compact = false,
}: VoiceDictationButtonProps) {
  const resolvedEntityNames = entityNames ?? knownEntityNames ?? [];
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createVoiceDictationController> | null>(null);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
  }, []);

  const toggleListening = () => {
    if (listening) {
      controllerRef.current?.stop();
      setListening(false);
      return;
    }
    const ctrl = createVoiceDictationController({
      knownEntityNames: resolvedEntityNames,
      onTranscript: (text, isFinal) => {
        if (isFinal && text) {
          onTranscript(text);
        }
      },
      onStateChange: (active) => setListening(active),
    });
    controllerRef.current = ctrl;
    const started = ctrl.start();
    if (!started) {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      title={
        supported
          ? 'Hands-Free Voice Dictation (Web Speech API) — auto-formats @-mentions'
          : 'Web Speech API dictation (browser support required)'
      }
      className={`inline-flex items-center gap-1 rounded-lg border font-medium transition ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        listening
          ? 'animate-pulse border-rose-500/60 bg-rose-500/20 text-rose-600 dark:text-rose-200'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-amber-500/40'
      } ${className}`}
    >
      <span>{listening ? '🎙️ Listening…' : compact ? '🎤' : `🎤 ${label}`}</span>
    </button>
  );
}

export default ExternalTablePiP;
