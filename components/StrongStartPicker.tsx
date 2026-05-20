'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Shuffle } from 'lucide-react';
import {
  STRONG_STARTS,
  CATEGORY_LABELS,
  rollStrongStart,
  type StrongStart,
  type StrongStartCategory,
} from '@/lib/strongStarts';

type Props = {
  onUse: (body: string) => void;
};

const POPUP_WIDTH = 360;
const VIEWPORT_MARGIN = 8;

export default function StrongStartPicker({ onUse }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<StrongStartCategory | 'all'>('all');
  const [pick, setPick] = useState<StrongStart | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const updateCoords = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(POPUP_WIDTH, vw - VIEWPORT_MARGIN * 2);
    const preferredLeft = r.right - width;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, vw - width - VIEWPORT_MARGIN));
    setCoords({ top: r.bottom + 4, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onScroll = () => updateCoords();
    const onResize = () => updateCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const roll = useCallback(() => {
    const next = rollStrongStart(category === 'all' ? undefined : category);
    setPick(next);
  }, [category]);

  const toggle = () => {
    if (!open) {
      roll();
      updateCoords();
    }
    setOpen(o => !o);
  };

  const onCategoryChange = (next: StrongStartCategory | 'all') => {
    setCategory(next);
    const pool = next === 'all' ? STRONG_STARTS : STRONG_STARTS.filter(s => s.category === next);
    setPick(pool[Math.floor(Math.random() * pool.length)]);
  };

  const categories: Array<StrongStartCategory | 'all'> = [
    'all', 'combat', 'mystery', 'arrival', 'ultimatum', 'discovery', 'social', 'environmental',
  ];

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="text-[11px] px-2 py-0.5 rounded border border-brass-deep/60 bg-brass/15 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass-deep flex items-center gap-1 font-display uppercase tracking-wider"
        title="Inspire a strong start"
      >
        <Sparkles size={11} /> Inspire
      </button>
      {open && coords && (
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 50 }}
          className="rounded border border-brass-deep/70 bg-parchment shadow-xl p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between text-[10px] text-ink-mute px-1 pb-1 border-b border-rule">
            <span className="font-display uppercase tracking-wider text-brass-deep">Strong Start</span>
            <button onClick={() => setOpen(false)} className="text-ink-mute hover:text-ink font-display uppercase tracking-wider">Close</button>
          </div>

          <div className="flex flex-wrap gap-1">
            {categories.map(c => {
              const active = category === c;
              const label = c === 'all' ? 'All' : CATEGORY_LABELS[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCategoryChange(c)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-display uppercase tracking-wider ${
                    active
                      ? 'border-crimson bg-crimson text-parchment'
                      : 'border-rule text-ink-soft hover:border-crimson/60 hover:text-crimson'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {pick && (
            <div className="rounded border border-rule bg-parchment-soft p-2 space-y-1">
              <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
                {CATEGORY_LABELS[pick.category]} · {pick.title}
              </div>
              <p className="text-xs text-ink-soft font-serif leading-relaxed whitespace-pre-wrap">{pick.body}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => { if (pick) { onUse(pick.body); setOpen(false); } }}
              disabled={!pick}
              className="text-[11px] px-2 py-1 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider disabled:opacity-40"
            >
              Use This
            </button>
            <button
              type="button"
              onClick={roll}
              className="text-[11px] px-2 py-1 rounded border border-brass-deep/60 bg-brass/15 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1"
            >
              <Shuffle size={11} /> Roll Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
