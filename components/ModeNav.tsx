'use client';

import { Compass, ClipboardCheck, Swords, BookOpen, User, Users, Calendar, Sparkles, type LucideIcon } from 'lucide-react';
import type { Audience, Mode, ModeSubview } from '@/lib/modes';
import { MODES, MODE_ORDER } from '@/lib/modes';

const MODE_ICONS: Record<Mode, LucideIcon> = {
  plan: Compass,
  prep: ClipboardCheck,
  organize: Calendar,
  run: Swords,
  library: BookOpen,
  oracle: Sparkles,
};

type Props = {
  mode: Mode;
  subview: string;
  onModeChange: (mode: Mode) => void;
  onSubviewChange: (subview: string) => void;
  worldOnlyMode?: boolean;
  playMode?: 'solo' | 'duet' | 'standard';
};

export default function ModeNav({ mode, subview, onModeChange, onSubviewChange, worldOnlyMode, playMode }: Props) {
  const primaryModes = worldOnlyMode ? ['plan'] as Mode[] : MODE_ORDER.filter(m => MODES[m].emphasis === 'primary');
  let mutedModes = worldOnlyMode ? [] : MODE_ORDER.filter(m => MODES[m].emphasis === 'muted');

  if (playMode === 'solo') {
    mutedModes = mutedModes.filter(m => m !== 'oracle');
  }

  let activeSubviews = MODES[mode].subviews;
  if (worldOnlyMode && mode === 'plan') {
    activeSubviews = activeSubviews.filter(s => s.id === 'pitch' || s.id === 'worldbuild');
  }
  if (playMode === 'solo' && mode === 'organize') {
    activeSubviews = activeSubviews.filter(s => s.id !== 'players');
  }

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
      {mode === 'run' ? (
        <div className="space-y-1.5 border-b border-rule pb-1.5">
          <nav
            role="tablist"
            aria-label="Run sub-view row 1"
            className="hide-scrollbar flex items-center gap-1 overflow-x-auto"
          >
            <div className="flex flex-shrink-0 items-center gap-1">
              {activeSubviews.slice(0, Math.ceil(activeSubviews.length / 2)).map(sv => (
                <SubviewPill
                  key={sv.id}
                  sv={sv}
                  active={sv.id === subview}
                  onClick={() => onSubviewChange(sv.id)}
                />
              ))}
            </div>
          </nav>
          <nav
            role="tablist"
            aria-label="Run sub-view row 2"
            className="hide-scrollbar flex items-center gap-1 overflow-x-auto"
          >
            <div className="flex flex-shrink-0 items-center gap-1">
              {activeSubviews.slice(Math.ceil(activeSubviews.length / 2)).map(sv => (
                <SubviewPill
                  key={sv.id}
                  sv={sv}
                  active={sv.id === subview}
                  onClick={() => onSubviewChange(sv.id)}
                />
              ))}
            </div>
          </nav>
        </div>
      ) : mode === 'library' ? (
        <div className="space-y-1.5 border-b border-rule pb-1.5">
          <nav
            role="tablist"
            aria-label="Library sub-view row 1"
            className="hide-scrollbar flex items-center gap-1 overflow-x-auto"
          >
            <div className="flex flex-shrink-0 items-center gap-1">
              {activeSubviews.slice(0, Math.ceil(activeSubviews.length / 2)).map(sv => (
                <SubviewPill
                  key={sv.id}
                  sv={sv}
                  active={sv.id === subview}
                  onClick={() => onSubviewChange(sv.id)}
                />
              ))}
            </div>
          </nav>
          <nav
            role="tablist"
            aria-label="Library sub-view row 2"
            className="hide-scrollbar flex items-center gap-1 overflow-x-auto"
          >
            <div className="flex flex-shrink-0 items-center gap-1">
              {activeSubviews.slice(Math.ceil(activeSubviews.length / 2)).map(sv => (
                <SubviewPill
                  key={sv.id}
                  sv={sv}
                  active={sv.id === subview}
                  onClick={() => onSubviewChange(sv.id)}
                />
              ))}
            </div>
          </nav>
        </div>
      ) : (
        <div className="relative border-b border-rule pb-1.5">
          <nav
            role="tablist"
            aria-label={`${MODES[mode].label} sub-view`}
            className="hide-scrollbar flex items-center gap-1 overflow-x-auto pr-8"
          >
            {groupSubviewsByAudience(activeSubviews).map((group, gi) => (
              <div key={gi} className={gi > 0 ? 'ml-1 flex flex-shrink-0 items-center gap-1 border-l border-rule pl-2' : 'flex flex-shrink-0 items-center gap-1'}>
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
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-parchment via-parchment/80 to-transparent lg:hidden" />
        </div>
      )}
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
      data-subview-tab={sv.id}
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
