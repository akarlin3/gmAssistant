import type { BriefingChange, TickTargetType } from '@/lib/world/types';

export type GetFn = (k: string, fb: any) => any;
export type SetFn = (k: string, v: any) => void;

export type PreviewState = {
  toDay: number;
  label: string;
  changes: BriefingChange[];
  rngSeed: number;
} | null;

export const TARGET_LABELS: Record<TickTargetType, string> = {
  factionClock: 'Faction Clock',
  downtime: 'Downtime',
  renown: 'Renown',
};
