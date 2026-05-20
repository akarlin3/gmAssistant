// Plot Segue generator — bridging moments that dangle a new plot arc into
// the current scene (pivot) or surface after the party's recent action
// (aftermath). Deterministic: picks from a curated bank tagged by mode,
// delivery, arc flavor, and urgency. Strict filters relax progressively when
// no entry matches, so any combination of dials still produces results.

import type { SeededRng } from './rng';
import { PLOT_SEGUES } from './tables/plot-segue-tables';
import type {
  PlotSegueEntry,
  PlotSegueResult,
  SegueArcFlavor,
  SegueDelivery,
  SegueMode,
  SegueUrgency,
} from './types';

export type PlotSegueInputs = {
  count: number;
  mode: 'auto' | SegueMode;
  delivery: 'auto' | SegueDelivery;
  arcFlavor: 'auto' | SegueArcFlavor;
  urgency: 'auto' | SegueUrgency;
};

type Filter = {
  mode: 'auto' | SegueMode;
  delivery: 'auto' | SegueDelivery;
  arcFlavor: 'auto' | SegueArcFlavor;
  urgency: 'auto' | SegueUrgency;
};

function matches(entry: PlotSegueEntry, f: Filter): boolean {
  if (f.mode !== 'auto' && entry.mode !== f.mode) return false;
  if (f.delivery !== 'auto' && entry.delivery !== f.delivery) return false;
  if (f.arcFlavor !== 'auto' && entry.arcFlavor !== f.arcFlavor) return false;
  if (f.urgency !== 'auto' && entry.urgency !== f.urgency) return false;
  return true;
}

// Progressively relax filter dimensions (urgency → delivery → mode → flavor)
// until the candidate pool is non-empty. Arc flavor is the last to relax
// because it shapes the segue most strongly.
function candidatePool(initial: Filter): PlotSegueEntry[] {
  const passes: Filter[] = [
    initial,
    { ...initial, urgency: 'auto' },
    { ...initial, urgency: 'auto', delivery: 'auto' },
    { ...initial, urgency: 'auto', delivery: 'auto', mode: 'auto' },
    { mode: 'auto', delivery: 'auto', arcFlavor: 'auto', urgency: 'auto' },
  ];
  for (const f of passes) {
    const pool = PLOT_SEGUES.filter((e) => matches(e, f));
    if (pool.length > 0) return pool;
  }
  return PLOT_SEGUES; // unreachable while the table is non-empty
}

export function generatePlotSegues(
  inputs: PlotSegueInputs,
  rng: SeededRng,
): PlotSegueResult {
  const count = Math.max(1, Math.min(3, Math.floor(inputs.count)));
  const filter: Filter = {
    mode: inputs.mode,
    delivery: inputs.delivery,
    arcFlavor: inputs.arcFlavor,
    urgency: inputs.urgency,
  };
  const pool = candidatePool(filter);

  const picks: PlotSegueEntry[] = [];
  const seen = new Set<string>();
  let safety = count * 20;
  while (picks.length < count && safety-- > 0) {
    const candidate = pool[Math.floor(rng.next() * pool.length)];
    const key = candidate.trigger;
    if (seen.has(key)) {
      if (pool.length <= picks.length) break; // pool exhausted
      continue;
    }
    seen.add(key);
    picks.push(candidate);
  }

  return {
    kind: 'plot-segue',
    id: `plot-segue_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs: { count, mode: inputs.mode, delivery: inputs.delivery, arcFlavor: inputs.arcFlavor, urgency: inputs.urgency },
    segues: picks,
    enhanced: false,
  };
}
