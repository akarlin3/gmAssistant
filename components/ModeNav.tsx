'use client';

import { Compass, ClipboardCheck, Swords, BookOpen, User, Users, type LucideIcon } from 'lucide-react';
import type { Audience, Mode, ModeSubview } from '@/lib/modes';
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
      <nav role="tablist" aria-label="Mode" className="flex flex-wrap items-center gap-1">
        {primaryModes.map(m => (
          <ModePill
            key={m}
            mode={m}
            active={m === mode}
            onClick={() => onModeChange(m)}
          />
        ))}
        {mutedModes.length > 0 && (
          <div className="ml-2 flex items-center gap-1 border-l border-rule pl-2">
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
        {groupSubviewsByAudience(activeSubviews).map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'ml-1 flex items-center gap-1 border-l border-rule pl-2' : 'flex items-center gap-1'}>
            {group.map(sv => (
              <SubviewPill
                key={sv.id}
                sv={sv}
                active={sv.id === subview}
                onClick={() => onSubviewChange(sv.id)}
              />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

// Cluster consecutive same-audience subviews into adjacent groups so a
// vertical divider can slip between them. Subviews without an audience tag
// fall into their own single-element group, which renders without a divider
// from its neighbor — preserving the look of modes that don't use this.
function groupSubviewsByAudience(subviews: readonly ModeSubview[]): ModeSubview[][] {
  const groups: ModeSubview[][] = [];
  for (const sv of subviews) {
    const last = groups[groups.length - 1];
    if (last && last[0].audience === sv.audience) last.push(sv);
    else groups.push([sv]);
  }
  return groups;
}

const AUDIENCE_ICON: Record<Audience, LucideIcon> = {
  solo: User,
  together: Users,
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  solo: 'Solo prep — done without the players',
  together: 'With players — done collaboratively at the table',
};

function SubviewPill({
  sv,
  active,
  onClick,
}: {
  sv: ModeSubview;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = sv.audience ? AUDIENCE_ICON[sv.audience] : null;
  const tooltip = sv.audience
    ? `${AUDIENCE_LABEL[sv.audience]} · ${sv.description}`
    : sv.description;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={tooltip}
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
        active
          ? 'border-crimson/60 bg-crimson/15 text-crimson'
          : 'border-transparent text-ink-soft hover:bg-parchment-deep'
      }`}
    >
      {Icon && <Icon size={11} className={active ? 'text-crimson' : sv.audience === 'together' ? 'text-moss' : 'text-wine'} />}
      {sv.label}
    </button>
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
