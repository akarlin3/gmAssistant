'use client';

import { SECTION_KEYS } from '../types';
import type { SectionKey } from '../types';
import { SECTION_META } from './constants';

type Props = {
  onNavigate: (k: SectionKey) => void;
};

export function SectionNav({ onNavigate }: Props) {
  return (
    <div className="hide-scrollbar sticky top-0 z-20 -mx-3 flex gap-2 overflow-x-auto border-b border-rule bg-parchment/90 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
      {SECTION_KEYS.map(k => {
        const Icon = SECTION_META[k].icon;
        return (
          <button
            key={k}
            onClick={() => onNavigate(k)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rule bg-parchment px-3 py-1 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep hover:text-ink"
          >
            <Icon size={10} className="text-brass-deep" />
            {SECTION_META[k].label}
          </button>
        );
      })}
    </div>
  );
}
