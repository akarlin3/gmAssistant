'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Volume2, VolumeX, EyeOff, Eye, X, Sparkles, Skull, Lock } from 'lucide-react';
import { executeSheetRoll } from '@/lib/diceRoller';
import type { RollEvent } from '@/lib/pc/types';
import {
  emitLocalVisualRoll,
  filterPublicVisualRolls,
  shouldBroadcastVisualRoll,
  subscribeLocalVisualRolls,
} from '@/lib/visualDiceBus';

export {
  emitLocalVisualRoll,
  filterPublicVisualRolls,
  shouldBroadcastVisualRoll,
};

export type PolyhedralDieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface VisualDieFace {
  id: string;
  dieType: PolyhedralDieType;
  sides: number;
  value: number;
  dropped?: boolean;
  isCrit20?: boolean;
  isCrit1?: boolean;
}

const VALID_POLYHEDRAL_SIDES: ReadonlyArray<number> = [4, 6, 8, 10, 12, 20, 100];

function sidesToPolyhedralType(sides: number): PolyhedralDieType {
  if (sides <= 4) return 'd4';
  if (sides <= 6) return 'd6';
  if (sides <= 8) return 'd8';
  if (sides <= 10) return 'd10';
  if (sides <= 12) return 'd12';
  if (sides === 100) return 'd100';
  return 'd20';
}

/**
 * Deterministically extracts individual polyhedral dice faces (`d4..d100`) from a `RollEvent`
 * for rendering in the Shared Visual Dice Tray.
 */
export function extractVisualDiceFaces(roll: RollEvent): VisualDieFace[] {
  const faces: VisualDieFace[] = [];
  const breakdown = roll.breakdown || '';
  const formula = roll.formula || '';

  // 1. Primary d20 rolls (including Advantage / Disadvantage pairs)
  if (Array.isArray(roll.d20Rolls) && roll.d20Rolls.length > 0) {
    const keptVal =
      roll.d20Rolls.length > 1
        ? roll.rollMode === 'advantage'
          ? Math.max(...roll.d20Rolls)
          : roll.rollMode === 'disadvantage'
            ? Math.min(...roll.d20Rolls)
            : roll.d20Rolls[0]
        : roll.d20Rolls[0];

    let markedKept = false;
    roll.d20Rolls.forEach((val, idx) => {
      const isKept = !markedKept && val === keptVal;
      if (isKept) markedKept = true;
      faces.push({
        id: `${roll.id}-d20-${idx}`,
        dieType: 'd20',
        sides: 20,
        value: val,
        dropped: roll.d20Rolls.length > 1 && !isKept,
        isCrit20: isKept && (val === 20 || roll.crit === 'nat20'),
        isCrit1: isKept && (val === 1 || roll.crit === 'nat1'),
      });
    });
  }

  // 2. Parse bracketed multi-die groups from breakdown, e.g. `2d6[4,5]` or `+1d4[3]=3`
  const groupRegex = /(\d+)d(\d+)\[([0-9,\s]+)\]/gi;
  let m: RegExpExecArray | null;
  let extraIdx = 0;
  while ((m = groupRegex.exec(breakdown)) !== null) {
    const sides = parseInt(m[2], 10);
    if (sides === 20 && faces.length > 0) continue; // Already added via d20Rolls
    const dieType = sidesToPolyhedralType(sides);
    const vals = m[3]
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    for (const v of vals) {
      if (faces.length >= 10) break;
      faces.push({
        id: `${roll.id}-grp-${extraIdx++}`,
        dieType,
        sides,
        value: v,
        isCrit20: dieType === 'd20' && v === 20,
        isCrit1: dieType === 'd20' && v === 1,
      });
    }
  }

  // 3. Fallback when breakdown came from generic formula parser without `[...]`
  if (faces.length === 0) {
    const fMatch = formula.match(/(\d*)d(\d+)/i);
    const count = fMatch && fMatch[1] ? Math.min(8, Math.max(1, parseInt(fMatch[1], 10))) : 1;
    const sides = fMatch ? parseInt(fMatch[2], 10) : 20;
    const dieType = sidesToPolyhedralType(
      VALID_POLYHEDRAL_SIDES.includes(sides) ? sides : 20,
    );
    if (count === 1) {
      const clamped = Math.max(1, Math.min(sides, Math.abs(Math.trunc(roll.total)) || 1));
      faces.push({
        id: `${roll.id}-fb-0`,
        dieType,
        sides,
        value: clamped,
        isCrit20: roll.crit === 'nat20',
        isCrit1: roll.crit === 'nat1',
      });
    } else {
      const avg = Math.max(1, Math.min(sides, Math.round(Math.max(count, roll.total) / count)));
      for (let i = 0; i < count; i++) {
        faces.push({
          id: `${roll.id}-fb-${i}`,
          dieType,
          sides,
          value: avg,
        });
      }
    }
  }

  return faces;
}

// ---- Zero-Bloat Synthesized Web Audio Dice Clatter -------------------------

function playDiceTrayAudio(crit: 'nat20' | 'nat1' | null | undefined, dieCount: number): void {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const bounces = Math.min(6, Math.max(2, dieCount + 1));

    // Short filtered wooden clatter impulses
    for (let i = 0; i < bounces; i++) {
      const offset = i * 0.065 + (i * i) * 0.008;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + ((i * 97) % 240), now + offset);
      osc.frequency.exponentialRampToValueAtTime(75, now + offset + 0.045);

      const amp = Math.max(0.03, 0.16 * Math.pow(0.75, i));
      gain.gain.setValueAtTime(amp, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.055);
    }

    // Distinct Crit Success (golden major triad chime) vs Crit Fail (crimson low thud)
    if (crit === 'nat20') {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, idx) => {
        const start = now + 0.24 + idx * 0.055;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.45);
      });
    } else if (crit === 'nat1') {
      const start = now + 0.24;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, start);
      osc.frequency.exponentialRampToValueAtTime(48, start + 0.35);
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // Ignore autoplay/WebAudio restrictions silently
  }
}

// ---- Faceted 3D-Style Polyhedral SVG Renderer ------------------------------

function PolyhedralDieSvg({
  face,
  index,
}: {
  face: VisualDieFace;
  index: number;
}) {
  const isCrit20 = Boolean(face.isCrit20);
  const isCrit1 = Boolean(face.isCrit1);

  const palette = isCrit20
    ? {
        gradStart: '#fde047',
        gradEnd: '#b45309',
        stroke: '#fef08a',
        facet: 'rgba(255,255,255,0.45)',
        text: '#0f172a',
        glow: 'drop-shadow(0 0 12px rgba(250, 204, 21, 0.85))',
      }
    : isCrit1
      ? {
          gradStart: '#ef4444',
          gradEnd: '#7f1d1d',
          stroke: '#fca5a5',
          facet: 'rgba(254,202,202,0.38)',
          text: '#fff1f2',
          glow: 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.85))',
        }
      : {
          gradStart: '#38bdf8',
          gradEnd: '#1e293b',
          stroke: '#7dd3fc',
          facet: 'rgba(186,230,253,0.28)',
          text: '#f8fafc',
          glow: 'drop-shadow(0 6px 10px rgba(2, 6, 23, 0.6))',
        };

  const gradId = `die-grad-${face.id}`;

  return (
    <div
      className={`relative inline-flex flex-col items-center select-none transition-opacity ${
        face.dropped ? 'opacity-40 scale-90' : 'opacity-100'
      }`}
      style={{
        animation: `gmaDieTumble 620ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 45}ms both`,
        filter: palette.glow,
      }}
      title={`${face.dieType.toUpperCase()}: ${face.value}${face.dropped ? ' (dropped)' : ''}`}
    >
      <svg width="58" height="58" viewBox="0 0 64 64" className="overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.gradStart} />
            <stop offset="100%" stopColor={palette.gradEnd} />
          </linearGradient>
        </defs>

        {face.dieType === 'd4' && (
          <g>
            <polygon
              points="32,6 58,54 6,54"
              fill={`url(#${gradId})`}
              stroke={palette.stroke}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <line x1="32" y1="6" x2="32" y2="54" stroke={palette.facet} strokeWidth="1.2" />
            <line x1="6" y1="54" x2="45" y2="30" stroke={palette.facet} strokeWidth="1" />
          </g>
        )}

        {face.dieType === 'd6' && (
          <g>
            <polygon
              points="14,14 50,14 54,50 10,50"
              rx="6"
              fill={`url(#${gradId})`}
              stroke={palette.stroke}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <rect
              x="15"
              y="15"
              width="34"
              height="34"
              rx="4"
              fill="none"
              stroke={palette.facet}
              strokeWidth="1.2"
            />
          </g>
        )}

        {face.dieType === 'd8' && (
          <g>
            <polygon
              points="32,4 58,32 32,60 6,32"
              fill={`url(#${gradId})`}
              stroke={palette.stroke}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <polygon
              points="32,4 58,32 6,32"
              fill="none"
              stroke={palette.facet}
              strokeWidth="1.2"
            />
            <line x1="32" y1="4" x2="32" y2="60" stroke={palette.facet} strokeWidth="1" />
          </g>
        )}

        {(face.dieType === 'd10' || face.dieType === 'd100') && (
          <g>
            <polygon
              points="32,4 56,26 46,56 18,56 8,26"
              fill={`url(#${gradId})`}
              stroke={palette.stroke}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <polyline
              points="8,26 32,38 56,26"
              fill="none"
              stroke={palette.facet}
              strokeWidth="1.2"
            />
            <line x1="32" y1="4" x2="32" y2="56" stroke={palette.facet} strokeWidth="1.1" />
          </g>
        )}

        {face.dieType === 'd12' && (
          <g>
            <polygon
              points="32,5 54,16 60,40 44,58 20,58 4,40 10,16"
              fill={`url(#${gradId})`}
              stroke={palette.stroke}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <polygon
              points="32,16 46,26 41,44 23,44 18,26"
              fill="none"
              stroke={palette.facet}
              strokeWidth="1.3"
            />
          </g>
        )}

        {face.dieType === 'd20' && (
          <g>
            <polygon
              points="32,4 57,18 57,46 32,60 7,46 7,18"
              fill={`url(#${gradId})`}
              stroke={palette.stroke}
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <polygon
              points="32,13 49,43 15,43"
              fill="none"
              stroke={palette.facet}
              strokeWidth="1.4"
            />
            <line x1="32" y1="4" x2="32" y2="13" stroke={palette.facet} strokeWidth="1.2" />
            <line x1="57" y1="18" x2="49" y2="43" stroke={palette.facet} strokeWidth="1.1" />
            <line x1="7" y1="18" x2="15" y2="43" stroke={palette.facet} strokeWidth="1.1" />
            <line x1="32" y1="60" x2="49" y2="43" stroke={palette.facet} strokeWidth="1.1" />
            <line x1="32" y1="60" x2="15" y2="43" stroke={palette.facet} strokeWidth="1.1" />
          </g>
        )}

        {/* Crit Fail Shatter Fracture Lines */}
        {isCrit1 && (
          <g stroke="#fecaca" strokeWidth="1.5" opacity="0.85">
            <polyline points="32,32 18,14 12,18" fill="none" />
            <polyline points="32,32 49,21 55,25" fill="none" />
            <polyline points="32,32 26,53" fill="none" />
          </g>
        )}

        <text
          x="32"
          y={face.dieType === 'd4' ? '42' : '37'}
          textAnchor="middle"
          fill={palette.text}
          fontSize={face.value >= 100 ? '13' : face.value >= 10 ? '16' : '18'}
          fontWeight="800"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {face.value}
        </text>
      </svg>
      <span className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-slate-300">
        {face.dieType}
      </span>
    </div>
  );
}

export interface VisualDiceOverlayProps {
  /** Shared public rollEvents feed (`SlotProjection.rollEvents` or campaign `rollEvents`). */
  publicRollEvents?: ReadonlyArray<RollEvent>;
  /** Actor name used when rolling quick polyhedral dice directly from the tray. */
  actorName?: string;
  /** Optional callback when user tosses a public die directly from the tray's quick bar. */
  onPublicQuickRoll?: (roll: RollEvent) => void;
  /** Offset from bottom when mobile combat bar is present. */
  bottomOffsetClass?: string;
}

const STORAGE_ENABLED_KEY = 'gma_visual_dice_enabled_v1';
const STORAGE_SOUND_KEY = 'gma_visual_dice_sound_v1';
const AUTO_HIDE_MS = 6500;

export function VisualDiceOverlay({
  publicRollEvents = [],
  actorName = 'Table',
  onPublicQuickRoll,
  bottomOffsetClass = 'bottom-14',
}: VisualDiceOverlayProps) {
  const [trayEnabled, setTrayEnabled] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [quickLauncherOpen, setQuickLauncherOpen] = useState<boolean>(false);
  const [quickSecret, setQuickSecret] = useState<boolean>(false);
  const [activeRoll, setActiveRoll] = useState<RollEvent | null>(null);
  const [animKey, setAnimKey] = useState<number>(0);

  const seenRollIdsRef = useRef<Set<string>>(new Set());
  const mountedInitializedRef = useRef<boolean>(false);
  const hideTimerRef = useRef<number | null>(null);

  // Hydrate tray & audio preferences from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedEnabled = window.localStorage.getItem(STORAGE_ENABLED_KEY);
      if (savedEnabled !== null) setTrayEnabled(savedEnabled !== 'false');
      const savedSound = window.localStorage.getItem(STORAGE_SOUND_KEY);
      if (savedSound !== null) setSoundEnabled(savedSound === 'true');
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const triggerRollAnimation = useCallback(
    (roll: RollEvent) => {
      if (!trayEnabled) return;
      setActiveRoll(roll);
      setAnimKey((k) => k + 1);
      if (soundEnabled) {
        const faces = extractVisualDiceFaces(roll);
        playDiceTrayAudio(roll.crit, faces.length);
      }
      if (hideTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(hideTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        hideTimerRef.current = window.setTimeout(() => {
          setActiveRoll(null);
        }, AUTO_HIDE_MS);
      }
    },
    [trayEnabled, soundEnabled],
  );

  // 1. Subscribe to local rolls (including `secretRoll: true` on the rolling user's screen ONLY)
  useEffect(() => {
    return subscribeLocalVisualRolls((localRoll) => {
      seenRollIdsRef.current.add(localRoll.id);
      triggerRollAnimation(localRoll);
    });
  }, [triggerRollAnimation]);

  // 2. Watch incoming shared publicRollEvents for rolls from peers / GM
  useEffect(() => {
    const safePublic = filterPublicVisualRolls(publicRollEvents);
    if (!mountedInitializedRef.current) {
      for (const r of safePublic) {
        seenRollIdsRef.current.add(r.id);
      }
      mountedInitializedRef.current = true;
      return;
    }

    let newestUnseen: RollEvent | null = null;
    for (const r of safePublic) {
      if (!seenRollIdsRef.current.has(r.id)) {
        seenRollIdsRef.current.add(r.id);
        if (!newestUnseen || r.timestamp >= newestUnseen.timestamp) {
          newestUnseen = r;
        }
      }
    }

    if (newestUnseen && shouldBroadcastVisualRoll(newestUnseen)) {
      triggerRollAnimation(newestUnseen);
    }
  }, [publicRollEvents, triggerRollAnimation]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const toggleTray = () => {
    const next = !trayEnabled;
    setTrayEnabled(next);
    if (!next) setActiveRoll(null);
    try {
      window.localStorage.setItem(STORAGE_ENABLED_KEY, String(next));
    } catch {
      // Ignore
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_SOUND_KEY, String(next));
    } catch {
      // Ignore
    }
  };

  const handleQuickDieRoll = (die: PolyhedralDieType) => {
    const isD20 = die === 'd20';
    const roll = executeSheetRoll({
      actorName,
      label: `Quick ${die.toUpperCase()}`,
      baseFormula: `1${die}`,
      isD20,
      secretRoll: quickSecret,
    });
    // Strictly guarantee secretRoll NEVER broadcasts via onPublicQuickRoll / pcWritebacks / Firestore
    if (shouldBroadcastVisualRoll(roll) && onPublicQuickRoll) {
      onPublicQuickRoll(roll);
    }
  };

  const activeFaces = useMemo(
    () => (activeRoll ? extractVisualDiceFaces(activeRoll) : []),
    [activeRoll],
  );

  const isNat20 = activeRoll?.crit === 'nat20';
  const isNat1 = activeRoll?.crit === 'nat1';

  return (
    <>
      <style>{`
        @keyframes gmaDieTumble {
          0% {
            opacity: 0;
            transform: translate3d(68px, -74px, 0) rotate(-195deg) scale(0.55);
          }
          55% {
            opacity: 1;
            transform: translate3d(-8px, 6px, 0) rotate(18deg) scale(1.08);
          }
          78% {
            transform: translate3d(4px, -3px, 0) rotate(-7deg) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
        }
        @keyframes gmaGoldBurst {
          0% { transform: scale(0.75); opacity: 0.9; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes gmaCrimsonShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px) rotate(-1.5deg); }
          40% { transform: translateX(5px) rotate(1.5deg); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
      `}</style>

      <div
        className={`pointer-events-none fixed right-3 ${bottomOffsetClass} z-40 flex flex-col items-end gap-2`}
        data-testid="visual-dice-overlay"
      >
        {/* Active Tumbling Dice Stage Card */}
        {trayEnabled && activeRoll && (
          <div
            key={`${activeRoll.id}-${animKey}`}
            style={
              isNat1
                ? { animation: 'gmaCrimsonShake 460ms ease-in-out' }
                : undefined
            }
            className={`pointer-events-auto relative max-w-sm rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md transition-all ${
              isNat20
                ? 'border-amber-300/80 bg-slate-950/95 ring-2 ring-amber-400/50'
                : isNat1
                  ? 'border-rose-500/80 bg-slate-950/95 ring-2 ring-rose-500/40'
                  : 'border-slate-700/80 bg-slate-950/90'
            }`}
          >
            {/* Nat 20 Gold Burst Ring */}
            {isNat20 && (
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-amber-300"
                style={{ animation: 'gmaGoldBurst 900ms ease-out infinite' }}
              />
            )}

            {/* Header: Actor, Secret Badge, Close */}
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-display text-xs font-bold text-slate-100">
                    {activeRoll.actorName}
                  </span>
                  {activeRoll.secretRoll && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full border border-violet-400/50 bg-violet-500/20 px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wider text-violet-200"
                      title="Animated only on your screen — never broadcast"
                    >
                      <Lock size={9} />
                      Local Secret
                    </span>
                  )}
                </div>
                <div className="truncate font-sans text-[11px] text-slate-400">
                  {activeRoll.label}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveRoll(null)}
                aria-label="Dismiss dice tray roll"
                className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            {/* Crit Celebration / Shatter Banner */}
            {isNat20 && (
              <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500/30 via-yellow-400/30 to-amber-500/30 px-2.5 py-1 font-display text-xs font-extrabold uppercase tracking-widest text-amber-200">
                <Sparkles size={13} className="text-amber-300" />
                <span>Natural 20! Critical Success</span>
                <Sparkles size={13} className="text-amber-300" />
              </div>
            )}
            {isNat1 && (
              <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-900/60 via-red-600/35 to-rose-900/60 px-2.5 py-1 font-display text-xs font-extrabold uppercase tracking-widest text-rose-200">
                <Skull size={13} className="text-rose-300" />
                <span>Natural 1! Critical Failure</span>
              </div>
            )}

            {/* Polyhedral Tumbling Stage */}
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-slate-900/80 px-3 py-2.5">
              {activeFaces.map((face, idx) => (
                <PolyhedralDieSvg key={face.id} face={face} index={idx} />
              ))}
            </div>

            {/* Total & Breakdown Footer */}
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-800 pt-1.5">
              <span className="truncate font-mono text-[10px] text-slate-400">
                {activeRoll.breakdown}
              </span>
              <span
                className={`shrink-0 font-mono text-lg font-black ${
                  isNat20
                    ? 'text-amber-300'
                    : isNat1
                      ? 'text-rose-400'
                      : 'text-sky-300'
                }`}
              >
                = {activeRoll.total}
              </span>
            </div>
          </div>
        )}

        {/* Quick Polyhedral Roll Drawer */}
        {trayEnabled && quickLauncherOpen && (
          <div className="pointer-events-auto flex flex-col gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Toss Polyhedral Die
              </span>
              <button
                type="button"
                onClick={() => setQuickSecret((s) => !s)}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold transition-colors ${
                  quickSecret
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Secret rolls animate ONLY on your screen and never broadcast"
              >
                <Lock size={10} />
                <span>{quickSecret ? 'Secret (Local)' : 'Public'}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const).map((die) => (
                <button
                  key={die}
                  type="button"
                  onClick={() => handleQuickDieRoll(die)}
                  className="rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1 font-mono text-[11px] font-bold text-sky-300 transition-colors hover:border-sky-400 hover:bg-sky-500/20 hover:text-white"
                >
                  {die}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact Tray Toggle & Sound FX Pill */}
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/90 px-2 py-1 text-xs text-slate-200 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              if (!trayEnabled) {
                toggleTray();
              } else {
                setQuickLauncherOpen((o) => !o);
              }
            }}
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-sans text-[11px] font-semibold hover:bg-white/10"
            title="Open 3D Visual Dice Tray quick roller"
          >
            <Dices size={13} className={trayEnabled ? 'text-sky-400' : 'text-slate-500'} />
            <span className="hidden sm:inline">3D Dice</span>
          </button>

          <button
            type="button"
            onClick={toggleTray}
            aria-label={trayEnabled ? 'Disable visual dice tray' : 'Enable visual dice tray'}
            title={trayEnabled ? 'Visual Dice Tray: ON (click to hide)' : 'Visual Dice Tray: OFF'}
            className={`rounded-full p-1 transition-colors ${
              trayEnabled
                ? 'text-emerald-400 hover:bg-white/10'
                : 'text-slate-500 hover:bg-white/10'
            }`}
          >
            {trayEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {trayEnabled && (
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Mute dice clatter sound' : 'Enable dice clatter sound'}
              title={soundEnabled ? 'Web Audio Dice Clatter: ON' : 'Web Audio Dice Clatter: Muted'}
              className={`rounded-full p-1 transition-colors ${
                soundEnabled
                  ? 'text-amber-300 hover:bg-white/10'
                  : 'text-slate-400 hover:bg-white/10'
              }`}
            >
              {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default VisualDiceOverlay;
