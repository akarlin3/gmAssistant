import { Skull, Gem, NotebookPen, Compass, Flame, HelpCircle } from 'lucide-react';
import type { LogKind } from '@/lib/generators/log';
import { ScrollTextIcon } from './ScrollTextIcon';
import type { CategoryIcon } from './categories';

const KIND_LABELS: Record<LogKind, string> = {
  'treasure-hoard': 'Treasure',
  trinket: 'Trinket',
  'mundane-shop': 'Mundane Shop',
  'magic-shop': 'Magic Shop',
  tavern: 'Tavern',
  'tavern-name': 'Tavern Name',
  dungeon: 'Dungeon',
  settlement: 'Settlement',
  'plot-segue': 'Plot Hook',
  names: 'Name Batch',
  locations: 'Location',
  'monster-roll': 'Monster',
  'monster-scale': 'Monster Scale',
  dice: 'Dice Roll',
};

const KIND_ICONS: Record<LogKind, CategoryIcon> = {
  'treasure-hoard': Gem,
  trinket: Gem,
  'mundane-shop': Gem,
  'magic-shop': Gem,
  tavern: Compass,
  'tavern-name': Compass,
  dungeon: Skull,
  settlement: Compass,
  'plot-segue': ScrollTextIcon,
  names: NotebookPen,
  locations: Compass,
  'monster-roll': Skull,
  'monster-scale': Skull,
  dice: Flame,
};

const KIND_BADGE_STYLES: Record<LogKind, string> = {
  'treasure-hoard': 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25',
  trinket: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25',
  'mundane-shop': 'bg-amber-500/10 text-amber-600 border border-amber-500/25',
  'magic-shop': 'bg-amber-500/10 text-amber-600 border border-amber-500/25',
  tavern: 'bg-blue-500/10 text-blue-600 border border-blue-500/25',
  'tavern-name': 'bg-blue-500/10 text-blue-600 border border-blue-500/25',
  dungeon: 'bg-purple-500/10 text-purple-600 border border-purple-500/25',
  settlement: 'bg-sky-500/10 text-sky-600 border border-sky-500/25',
  locations: 'bg-sky-500/10 text-sky-600 border border-sky-500/25',
  'plot-segue': 'bg-rose-500/10 text-rose-600 border border-rose-500/25',
  names: 'bg-teal-500/10 text-teal-600 border border-teal-500/25',
  'monster-roll': 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/25',
  'monster-scale': 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/25',
  dice: 'bg-orange-500/10 text-orange-600 border border-orange-500/25',
};

const DEFAULT_BADGE_STYLE = 'bg-zinc-500/10 text-zinc-600 border border-zinc-500/25';

export function getKindLabel(kind: LogKind): string {
  return KIND_LABELS[kind] ?? String(kind);
}

export function getKindIcon(kind: LogKind): CategoryIcon {
  return KIND_ICONS[kind] ?? HelpCircle;
}

export function getKindBadgeStyle(kind: LogKind): string {
  return KIND_BADGE_STYLES[kind] ?? DEFAULT_BADGE_STYLE;
}
