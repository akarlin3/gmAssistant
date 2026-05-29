// Inspiration tables for campaign prep
// Original content authored for this project.
// Categories are inspired by GM-craft conventions found across tabletop sources,
// but all entries are original work.
//
// The table data is split by category under `lib/inspirationTables/` to keep
// each module small; this file owns the shared type, merges the categories
// into a single `TABLES` record, and exposes the roll/sample helpers.

import { goalTables } from './inspirationTables/goal-tables';
import { castTables } from './inspirationTables/cast-tables';
import { plotTables } from './inspirationTables/plot-tables';
import { complicationTables } from './inspirationTables/complication-tables';
import { npcTraitTables } from './inspirationTables/npc-trait-tables';
import { npcDepthTables } from './inspirationTables/npc-depth-tables';
import { villainyTables } from './inspirationTables/villainy-tables';
import { worldEventTables } from './inspirationTables/world-event-tables';
import { localeTables } from './inspirationTables/locale-tables';
import { travelTables } from './inspirationTables/travel-tables';
import { sensoryTables } from './inspirationTables/sensory-tables';

export type InspireTable = {
  id: string;
  title: string;
  attribution: string;
  entries: string[];
};

export const TABLES: Record<string, InspireTable> = {
  ...goalTables,
  ...castTables,
  ...plotTables,
  ...complicationTables,
  ...npcTraitTables,
  ...npcDepthTables,
  ...villainyTables,
  ...worldEventTables,
  ...localeTables,
  ...travelTables,
  ...sensoryTables,
};

// Pick one random entry from a table id
export function rollTable(tableId: string): string | null {
  const t = TABLES[tableId];
  if (!t || t.entries.length === 0) return null;
  return t.entries[Math.floor(Math.random() * t.entries.length)];
}

// Pick N distinct random entries from a table id
export function sampleTable(tableId: string, count: number): string[] {
  const t = TABLES[tableId];
  if (!t) return [];
  const shuffled = [...t.entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
