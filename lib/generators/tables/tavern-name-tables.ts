// Tavern names — ORIGINAL CONTENT.
//
// A curated flat list of evocative tavern, inn, and alehouse names for
// quick lookup at the table. Original prose authored for this project; no
// PHB / DMG / non-SRD content was copied. Distinct from the procedural
// prefix×suffix grid used by the full Tavern generator — these are
// hand-picked so each one is meant to stand on its own without further
// embellishment.
//
// The names are split across `tavern-names-part-1.ts` and
// `tavern-names-part-2.ts` to keep each module small; this file concatenates
// them into the combined export consumed by the rest of the app.

import { TAVERN_NAMES_PART_1 } from './tavern-names-part-1';
import { TAVERN_NAMES_PART_2 } from './tavern-names-part-2';

export const TAVERN_NAMES: readonly string[] = [
  ...TAVERN_NAMES_PART_1,
  ...TAVERN_NAMES_PART_2,
];

// Quick safety-check: keep this list above 300 entries. If you trim it,
// reduce the assert below so the unit test still proves we cleared the bar.
export const TAVERN_NAMES_MIN_COUNT = 600;
