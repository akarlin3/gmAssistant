'use client';

import { Compass, ClipboardCheck, Swords, BookOpen, type LucideIcon } from 'lucide-react';
import type { Mode } from '@/lib/modes';
import { MODES, MODE_ORDER } from '@/lib/modes';

const MODE_ICONS: Record<Mode, LucideIcon> = {
  plan: Compass,
  prep: ClipboardCheck,
  run: Swords,
  library: BookOpen,
};

type Props = {
  mode: Mode;
  subview: string;
  onModeChange: (mode: Mode) => void;
  onSubviewChange: (subview: string) => void;
};

export default function ModeNav({ mode, subview, onModeChange, onSubviewChange }: Props) {
  const primaryModes = MODE_ORDER.filter(m => MODES[m].emphasis === 'primary');
  const mutedModes = MODE_ORDER.filter(m => MODES[m].emphasis === 'muted');
  const activeSubviews = MODES[mode].subviews;

  return (
    <div className="space-y-2">
      <nav role="tablist" aria-label="Mode" className="flex items-center gap-1 flex-wrap">
        {primaryModes.map(m => (
          <ModePill
            key={m}
            mode={m}
            active={m === mode}
            onClick={() => onModeChange(m)}
          />
        ))}
        {mutedModes.length > 0 && (
          <div className="border-l border-rule ml-2 pl-2 flex items-center gap-1">
            {mutedModes.map(m => (
              <ModePill
                key={m}
                mode={m}
                active={m === mode}
                onClick={() => onModeChange(m)}
                muted
              />
            ))}
          </div>
        )}
      </nav>
      <nav
        role="tablist"
        aria-label={`${MODES[mode].label} sub-view`}
        className="flex flex-wrap items-center gap-1 border-b border-rule pb-1.5"
      >
        {activeSubviews.map(sv => {
          const active = sv.id === subview;
          return (
            <button
              key={sv.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSubviewChange(sv.id)}
              title={sv.description}
              className={`text-xs px-2.5 py-1 rounded font-display uppercase tracking-wider transition-colors border ${
                active
                  ? 'bg-crimson/15 text-crimson border-crimson/60'
                  : 'text-ink-soft hover:bg-parchment-deep border-transparent'
              }`}
            >
              {sv.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ModePill({
  mode,
  active,
  onClick,
  muted = false,
}: {
  mode: Mode;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  const Icon = MODE_ICONS[mode];
  const label = MODES[mode].label;
  const iconSize = muted ? 12 : 14;
  const padding = muted ? 'px-2 py-1' : 'px-3 py-1.5';
  const textSize = muted ? 'text-[11px]' : 'text-xs';
  const base = `${padding} ${textSize} rounded font-display uppercase tracking-wider flex items-center gap-1.5 transition-colors border`;
  const activeClass = muted
    ? 'bg-parchment-deep text-ink border-rule'
    : 'bg-crimson text-parchment border-crimson';
  const inactiveClass = muted
    ? 'text-ink-mute hover:bg-parchment-deep/40 border-transparent'
    : 'text-ink-soft hover:bg-parchment-deep border-rule';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={MODES[mode].description}
      className={`${base} ${active ? activeClass : inactiveClass}`}
    >
      <Icon size={iconSize} />
      {label}
    </button>
  );
}
