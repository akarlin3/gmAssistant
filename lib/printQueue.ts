/**
 * Module 5 — Creality K1C Hardware Bridge (Print Queue Engine)
 *
 * Aggregates all miniatures (Monsters & NPCs), boss tokens (is_boss or high-CR),
 * and terrain pieces (Locations & custom terrain items) needed for upcoming
 * encounters, and provides 1-click status cycling (`queued` -> `sliced` -> `printed`)
 * and `.stl` link updates back into campaign state.
 */

import type { PrintStatus } from './campaign-types';

export type PrintItemCategory = 'miniature' | 'boss' | 'terrain';

export interface PrintQueueItem {
  id: string;
  name: string;
  category: PrintItemCategory;
  sourceType: 'homebrewMonster' | 'prepMonster' | 'npc' | 'location' | 'customQueue';
  sourceIndex: number;
  subtitle?: string;
  stl_link: string;
  print_status: PrintStatus;
  quantity: number;
  inUpcomingEncounter?: boolean;
}

export const PRINT_STATUS_ORDER: PrintStatus[] = ['queued', 'sliced', 'printed'];

export const PRINT_STATUS_LABELS: Record<PrintStatus, string> = {
  queued: 'Queued',
  sliced: 'Sliced (Creality Print)',
  printed: 'Printed (K1C Ready)',
};

export const PRINT_STATUS_STYLES: Record<PrintStatus, string> = {
  queued: 'border-amber-600/50 bg-amber-500/10 text-amber-800',
  sliced: 'border-sky-600/50 bg-sky-500/10 text-sky-800',
  printed: 'border-moss/60 bg-moss/15 text-moss',
};

export function cyclePrintStatus(current?: PrintStatus): PrintStatus {
  if (current === 'queued') return 'sliced';
  if (current === 'sliced') return 'printed';
  return 'queued';
}

export function normalizePrintStatus(raw: unknown): PrintStatus {
  if (raw === 'queued' || raw === 'sliced' || raw === 'printed') return raw;
  return 'queued';
}

/**
 * Extracts all print queue items across:
 * 1. `homebrewMonsters` (boss tokens if `is_boss` or `cr >= 5`, otherwise miniatures)
 * 2. `monsters` prep list (upcoming session monsters — strings or objects)
 * 3. `npcs` (NPC miniatures or boss tokens that have `stl_link`, `print_status`, or `is_boss`, or all named NPCs when `includeAllUpcoming` is true)
 * 4. `locations` (Terrain pieces that have `stl_link`, `print_status`, or `terrainTags`)
 * 5. `k1cPrintQueue` (Custom standalone print jobs for tokens/terrain/props)
 */
export function buildK1CPrintQueue(
  data: Record<string, any> | undefined,
  options?: { includeUnqueuedEncounterAssets?: boolean }
): PrintQueueItem[] {
  const d = data || {};
  const includeAll = options?.includeUnqueuedEncounterAssets ?? true;
  const items: PrintQueueItem[] = [];
  const overrides: Record<string, { stl_link?: string; print_status?: PrintStatus; quantity?: number; is_boss?: boolean }> =
    d.k1cPrintOverrides && typeof d.k1cPrintOverrides === 'object' ? d.k1cPrintOverrides : {};

  // 1. Homebrew Monsters
  const homebrew: any[] = Array.isArray(d.homebrewMonsters) ? d.homebrewMonsters : [];
  homebrew.forEach((m, index) => {
    if (!m || !String(m.name || '').trim()) return;
    const key = `homebrewMonster:${m.slug || index}`;
    const ov = overrides[key] || {};
    const hasPrintMeta = Boolean(m.stl_link || m.print_status || ov.stl_link || ov.print_status);
    if (!includeAll && !hasPrintMeta) return;

    const isBoss = Boolean(ov.is_boss ?? m.is_boss ?? (typeof m.cr === 'number' && m.cr >= 5));
    items.push({
      id: key,
      name: String(m.name).trim(),
      category: isBoss ? 'boss' : 'miniature',
      sourceType: 'homebrewMonster',
      sourceIndex: index,
      subtitle: `CR ${m.challenge_rating || m.cr || '?'} · ${m.size || 'Medium'} ${m.type || 'Creature'}`,
      stl_link: String(ov.stl_link ?? m.stl_link ?? ''),
      print_status: normalizePrintStatus(ov.print_status ?? m.print_status),
      quantity: Number(ov.quantity) || 1,
      inUpcomingEncounter: true,
    });
  });

  // 2. Prep Monsters (`data.monsters`)
  const prepMonsters: any[] = Array.isArray(d.monsters) ? d.monsters : [];
  prepMonsters.forEach((raw, index) => {
    if (!raw) return;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const parts = trimmed.split(' — ');
      const name = parts[0]?.trim() || trimmed;
      const subtitle = parts.slice(1).join(' · ') || 'Session Prep Encounter';
      const key = `prepMonster:${index}`;
      const ov = overrides[key] || {};
      const isBoss = Boolean(ov.is_boss ?? /boss|dragon|lord|queen|king|lich|tyrant/i.test(trimmed));
      items.push({
        id: key,
        name,
        category: isBoss ? 'boss' : 'miniature',
        sourceType: 'prepMonster',
        sourceIndex: index,
        subtitle,
        stl_link: String(ov.stl_link ?? ''),
        print_status: normalizePrintStatus(ov.print_status),
        quantity: Number(ov.quantity) || 1,
        inUpcomingEncounter: true,
      });
    } else if (typeof raw === 'object') {
      const name = String(raw.name || '').trim();
      if (!name) return;
      const key = `prepMonster:${raw.id || index}`;
      const ov = overrides[key] || {};
      const isBoss = Boolean(ov.is_boss ?? raw.is_boss);
      items.push({
        id: key,
        name,
        category: isBoss ? 'boss' : 'miniature',
        sourceType: 'prepMonster',
        sourceIndex: index,
        subtitle: [raw.cr ? `CR ${raw.cr}` : '', raw.notes || ''].filter(Boolean).join(' · ') || 'Session Prep Monster',
        stl_link: String(ov.stl_link ?? raw.stl_link ?? ''),
        print_status: normalizePrintStatus(ov.print_status ?? raw.print_status),
        quantity: Number(ov.quantity ?? raw.quantity) || 1,
        inUpcomingEncounter: true,
      });
    }
  });

  // 3. NPCs
  const npcs: any[] = Array.isArray(d.npcs) ? d.npcs : [];
  npcs.forEach((n, index) => {
    if (!n || !String(n.name || '').trim()) return;
    const key = `npc:${n.id || index}`;
    const ov = overrides[key] || {};
    const hasPrintMeta = Boolean(n.stl_link || n.print_status || n.is_boss || ov.stl_link || ov.print_status);
    const isVillainOrCombat = /villain|rival|boss/i.test(String(n.type || ''));
    if (!hasPrintMeta && !(includeAll && isVillainOrCombat)) return;

    const isBoss = Boolean(ov.is_boss ?? n.is_boss ?? /villain/i.test(String(n.type || '')));
    items.push({
      id: key,
      name: String(n.name).trim(),
      category: isBoss ? 'boss' : 'miniature',
      sourceType: 'npc',
      sourceIndex: index,
      subtitle: [n.type, n.archetype, n.faction].filter(Boolean).join(' · ') || 'NPC',
      stl_link: String(ov.stl_link ?? n.stl_link ?? ''),
      print_status: normalizePrintStatus(ov.print_status ?? n.print_status),
      quantity: Number(ov.quantity) || 1,
      inUpcomingEncounter: true,
    });
  });

  // 4. Locations (Terrain pieces)
  const locations: any[] = Array.isArray(d.locations) ? d.locations : [];
  locations.forEach((l, index) => {
    if (!l || !String(l.name || '').trim()) return;
    const key = `location:${l.id || index}`;
    const ov = overrides[key] || {};
    const hasPrintMeta = Boolean(l.stl_link || l.print_status || ov.stl_link || ov.print_status);
    const hasTerrain = Array.isArray(l.terrainTags) && l.terrainTags.length > 0;
    if (!hasPrintMeta && !(includeAll && (hasTerrain || index < 3))) return;

    const tags = Array.isArray(l.terrainTags) && l.terrainTags.length > 0
      ? l.terrainTags.join(', ')
      : Array.isArray(l.aspects)
        ? l.aspects.filter(Boolean).slice(0, 2).join(' · ')
        : l.type || 'Terrain Scatter';

    items.push({
      id: key,
      name: String(l.name).trim(),
      category: 'terrain',
      sourceType: 'location',
      sourceIndex: index,
      subtitle: tags || 'Location Terrain',
      stl_link: String(ov.stl_link ?? l.stl_link ?? ''),
      print_status: normalizePrintStatus(ov.print_status ?? l.print_status),
      quantity: Number(ov.quantity) || 1,
      inUpcomingEncounter: true,
    });
  });

  // 5. Custom Queue Jobs (`data.k1cPrintQueue`)
  const customQueue: any[] = Array.isArray(d.k1cPrintQueue) ? d.k1cPrintQueue : [];
  customQueue.forEach((job, index) => {
    if (!job || !String(job.name || '').trim()) return;
    items.push({
      id: `customQueue:${job.id || index}`,
      name: String(job.name).trim(),
      category:
        job.category === 'boss' || job.category === 'terrain' || job.category === 'miniature'
          ? job.category
          : 'miniature',
      sourceType: 'customQueue',
      sourceIndex: index,
      subtitle: job.subtitle || 'Custom K1C Print Job',
      stl_link: String(job.stl_link || ''),
      print_status: normalizePrintStatus(job.print_status),
      quantity: Number(job.quantity) || 1,
      inUpcomingEncounter: true,
    });
  });

  return items;
}

/**
 * Applies a patch (`print_status`, `stl_link`, `quantity`, `is_boss`) to a `PrintQueueItem`
 * and persists it into the underlying campaign entity (`homebrewMonsters`, `npcs`, `locations`,
 * `monsters`, or `k1cPrintQueue` + `k1cPrintOverrides`).
 */
export function updatePrintQueueItemInState(
  prevState: Record<string, any>,
  item: PrintQueueItem,
  patch: Partial<{ stl_link: string; print_status: PrintStatus; quantity: number; is_boss: boolean }>
): Record<string, any> {
  const next = { ...prevState };
  const overrides = { ...(prevState.k1cPrintOverrides || {}) };
  overrides[item.id] = {
    ...(overrides[item.id] || {}),
    ...patch,
  };
  next.k1cPrintOverrides = overrides;

  if (item.sourceType === 'homebrewMonster' && Array.isArray(prevState.homebrewMonsters)) {
    next.homebrewMonsters = prevState.homebrewMonsters.map((m: any, idx: number) =>
      idx === item.sourceIndex
        ? {
            ...m,
            ...(patch.stl_link !== undefined ? { stl_link: patch.stl_link } : {}),
            ...(patch.print_status !== undefined ? { print_status: patch.print_status } : {}),
            ...(patch.is_boss !== undefined ? { is_boss: patch.is_boss } : {}),
          }
        : m
    );
  } else if (item.sourceType === 'npc' && Array.isArray(prevState.npcs)) {
    next.npcs = prevState.npcs.map((n: any, idx: number) =>
      idx === item.sourceIndex
        ? {
            ...n,
            ...(patch.stl_link !== undefined ? { stl_link: patch.stl_link } : {}),
            ...(patch.print_status !== undefined ? { print_status: patch.print_status } : {}),
            ...(patch.is_boss !== undefined ? { is_boss: patch.is_boss } : {}),
          }
        : n
    );
  } else if (item.sourceType === 'location' && Array.isArray(prevState.locations)) {
    next.locations = prevState.locations.map((l: any, idx: number) =>
      idx === item.sourceIndex
        ? {
            ...l,
            ...(patch.stl_link !== undefined ? { stl_link: patch.stl_link } : {}),
            ...(patch.print_status !== undefined ? { print_status: patch.print_status } : {}),
          }
        : l
    );
  } else if (item.sourceType === 'customQueue' && Array.isArray(prevState.k1cPrintQueue)) {
    next.k1cPrintQueue = prevState.k1cPrintQueue.map((job: any, idx: number) =>
      idx === item.sourceIndex
        ? {
            ...job,
            ...(patch.stl_link !== undefined ? { stl_link: patch.stl_link } : {}),
            ...(patch.print_status !== undefined ? { print_status: patch.print_status } : {}),
            ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
          }
        : job
    );
  }

  return next;
}
