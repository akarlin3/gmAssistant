import type { ComponentType } from 'react';
import { History, Skull, Gem, NotebookPen, Compass, Flame } from 'lucide-react';
import type { LogKind } from '@/lib/generators/log';
import { ScrollTextIcon } from './ScrollTextIcon';

/** Icon components accept at minimum a numeric `size` (lucide + ScrollTextIcon). */
export type CategoryIcon = ComponentType<{ size?: number; className?: string }>;

/** The non-"all" filter buckets surfaced as category badges. */
export type FilterCategory =
  | 'tavern'
  | 'shop'
  | 'dungeon'
  | 'settlement'
  | 'names'
  | 'locations'
  | 'treasure'
  | 'plot-segue'
  | 'dice';

export type CategoryValue = 'all' | FilterCategory;

export type CategoryDef = {
  value: CategoryValue;
  label: string;
  icon: CategoryIcon;
};

/**
 * Maps each filter category to the set of LogKinds it matches. Data-driven
 * replacement for the previous if-chain in `matchesCategory` — behavior is
 * identical (note that some LogKinds, e.g. monster-roll/monster-scale, are
 * intentionally not surfaced by any category and only appear under "All").
 */
export const CATEGORY_KINDS: Record<FilterCategory, readonly LogKind[]> = {
  tavern: ['tavern', 'tavern-name'],
  shop: ['mundane-shop', 'magic-shop'],
  dungeon: ['dungeon'],
  settlement: ['settlement'],
  names: ['names'],
  locations: ['locations'],
  treasure: ['treasure-hoard', 'trinket'],
  'plot-segue': ['plot-segue'],
  dice: ['dice'],
};

export const CATEGORIES: readonly CategoryDef[] = [
  { value: 'all', label: 'All', icon: History },
  { value: 'tavern', label: 'Taverns', icon: Compass },
  { value: 'shop', label: 'Shops', icon: Gem },
  { value: 'dungeon', label: 'Dungeons', icon: Skull },
  { value: 'settlement', label: 'Settlements', icon: Compass },
  { value: 'names', label: 'Names', icon: NotebookPen },
  { value: 'locations', label: 'Locations', icon: Compass },
  { value: 'treasure', label: 'Treasure', icon: Gem },
  { value: 'plot-segue', label: 'Plot Hooks', icon: ScrollTextIcon },
  { value: 'dice', label: 'Dice Rolls', icon: Flame },
];

/** Whether a log kind belongs to the active category. */
export function matchesCategory(kind: LogKind, cat: CategoryValue): boolean {
  if (cat === 'all') return true;
  return CATEGORY_KINDS[cat].includes(kind);
}
