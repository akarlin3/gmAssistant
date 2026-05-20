'use client';

import { useEffect, useRef, useState } from 'react';
import { Wand2, ChevronDown } from 'lucide-react';
import type { GeneratorMeta, PrepSection } from '@/lib/generators/sectionMap';

type Props = {
  section: PrepSection;
  lastUsed: GeneratorMeta;
  options: GeneratorMeta[];
  onSummon: (meta: GeneratorMeta) => void;
};

export default function SummonButton({ section, lastUsed, options, onSummon }: Props) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasChoices = options.length > 1;

  return (
    <div className="relative inline-flex" ref={popoverRef}>
      <button
        type="button"
        onClick={() => onSummon(lastUsed)}
        title={`Summon ${lastUsed.label}`}
        className="text-[11px] px-2 py-0.5 rounded-l rounded-r-none border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment hover:border-crimson flex items-center gap-1 font-display uppercase tracking-wider"
      >
        <Wand2 size={11} /> Summon · {lastUsed.shortLabel}
      </button>
      {hasChoices && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Choose generator for ${section}`}
          title="Choose a different generator"
          className="text-[11px] px-1.5 py-0.5 -ml-px rounded-r border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment hover:border-crimson flex items-center"
        >
          <ChevronDown size={11} />
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[10rem] rounded border border-rule bg-parchment shadow-page py-1 text-xs font-serif"
        >
          {options.map((opt) => (
            <button
              key={opt.kind}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onSummon(opt);
              }}
              className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-parchment-deep ${
                opt.kind === lastUsed.kind ? 'text-crimson font-display tracking-wide' : 'text-ink'
              }`}
            >
              <span>{opt.label}</span>
              {opt.pro && (
                <span className="text-[9px] uppercase tracking-wider text-brass-deep">Pro</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
