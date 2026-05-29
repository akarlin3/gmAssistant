'use client';

import { useEffect, useState, useRef } from 'react';
import { Sparkles, X, ChevronRight } from 'lucide-react';

export type TourStep = {
  selector: string;
  title: string;
  body: string;
};

type Props = {
  mode: 'solo' | 'duet';
  steps: TourStep[];
  onComplete: () => void;
};

export default function Tour({ mode, steps, onComplete }: Props) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStepIndex];

  useEffect(() => {
    if (!step) return;

    // Retry finding the element a few times since tabs might take a frame to mount/render
    let attempts = 0;
    const updatePosition = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setCoords({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(updatePosition, 100);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [step]);

  if (!step || !coords) return null;

  const isLast = currentStepIndex === steps.length - 1;
  const isSolo = mode === 'solo';
  const themeColor = isSolo ? 'text-pink-400 bg-pink-500/15' : 'text-teal-400 bg-teal-500/15';
  const borderTheme = isSolo ? 'border-pink-500/30' : 'border-teal-500/30';
  const btnTheme = isSolo ? 'bg-pink-600 hover:bg-pink-700' : 'bg-teal-600 hover:bg-teal-700';

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  // Determine ideal position for the tooltip (usually below the element)
  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: coords.top + coords.height + 12,
    left: Math.max(16, Math.min(window.innerWidth - 300, coords.left + coords.width / 2 - 140)),
    zIndex: 9999,
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Target element highlight ring */}
      <div
        className={`pointer-events-auto absolute animate-pulse rounded ring-4 transition-all ${
          isSolo ? 'ring-pink-500/40' : 'ring-teal-500/40'
        }`}
        style={{
          top: coords.top - 4,
          left: coords.left - 4,
          width: coords.width + 8,
          height: coords.height + 8,
          zIndex: 9998,
        }}
      />

      {/* Tooltip Card */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className={`pointer-events-auto relative w-72 space-y-3 rounded-lg border bg-parchment p-4 shadow-lg ${borderTheme}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-display text-[11px] uppercase tracking-wider text-ink-mute">
            <span className={`rounded p-1 ${themeColor}`}>
              <Sparkles size={11} />
            </span>
            <span>{mode} tour · {currentStepIndex + 1}/{steps.length}</span>
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="text-ink-mute transition-colors hover:text-crimson"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-1">
          <h4 className="font-display text-sm font-bold tracking-wide text-ink">{step.title}</h4>
          <p className="font-serif text-xs leading-relaxed text-ink-soft">{step.body}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onComplete}
            className="font-display text-[10px] uppercase tracking-wider text-ink-mute transition-colors hover:text-ink"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleNext}
            className={`flex items-center gap-1 rounded px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-parchment shadow-sm transition-colors ${btnTheme}`}
          >
            {isLast ? 'Got It' : 'Next'} <ChevronRight size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
