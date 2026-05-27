// Phase 3 session log records: rich entries saved when a session ends via
// the finalizer. Kept separate from the legacy `sessionLogs` array (which
// the Track tab still uses) so neither side breaks.

import type { ChangeEvent } from './sessionEvents';
import type { Character } from './character-schema';
import { CR_TO_XP } from './encounterMath';

export type GoalUpdate = {
  goal: string;
  from: string;
  to: string;
};

export type LinkedPrepItem = {
  id: string; // The original prep item ID
  type: 'npc' | 'encounter' | 'loot' | 'location';
  snapshotName: string; // Static snapshot of name/title
  snapshotXP?: number; // Static snapshot of XP (for encounters)
  snapshotLoot?: string; // Static snapshot of loot description/text (for loot)
};

export type SessionLogEntry = {
  id: string;
  number: number;
  date: string;
  startedAt: number;
  endedAt: number;
  title?: string;
  recap: string;
  xpAwarded?: number;
  events: ChangeEvent[];
  secretsRevealed: string[];
  scenesUsed: string[];
  goalUpdates: GoalUpdate[];
  pinned?: boolean;
  linkedPrepItems?: LinkedPrepItem[];
  strongStart?: string;
};

export function parseMonsterXP(monsterStr: string): number {
  if (!monsterStr) return 0;
  const match = monsterStr.match(/(?:cr\s*|challenge\s*rating\s*|cr:\s*)(\d+(?:\/\d+)?)/i);
  if (match && match[1]) {
    const cr = match[1];
    return CR_TO_XP[cr] || 0;
  }
  return 0;
}

export function parseMonsterName(monsterStr: string): string {
  if (!monsterStr) return 'Unnamed Encounter';
  const parts = monsterStr.split(/(?:\s*—\s*|\s*,\s*|\s*·\s*)/);
  if (parts.length > 0) return parts[0].trim();
  return monsterStr.trim();
}

export function recalculatePartyState(
  entries: SessionLogEntry[],
  characters: Character[]
): {
  partyXP: number;
  partyInventory: string[];
  updatedCharacters: Character[];
} {
  const partyXP = entries.reduce((sum, entry) => {
    const basicXP = entry.xpAwarded || 0;
    const encounterXP = entry.linkedPrepItems
      ?.filter(item => item.type === 'encounter')
      .reduce((esum, e) => esum + (e.snapshotXP || 0), 0) || 0;
    return sum + basicXP + encounterXP;
  }, 0);

  const partyInventory = entries.reduce<string[]>((acc, entry) => {
    const lootItems = entry.linkedPrepItems
      ?.filter(item => item.type === 'loot')
      .map(item => item.snapshotLoot || item.snapshotName) || [];
    for (const item of lootItems) {
      if (item && !acc.includes(item)) {
        acc.push(item);
      }
    }
    return acc;
  }, []);

  const updatedCharacters = characters.map(c => ({
    ...c,
    experience: String(partyXP),
  }));

  return {
    partyXP,
    partyInventory,
    updatedCharacters,
  };
}

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextSessionNumber(existing: SessionLogEntry[]): number {
  if (existing.length === 0) return 1;
  return Math.max(...existing.map(e => e.number || 0)) + 1;
}

export function summarizeEvents(events: ChangeEvent[]): { kept: number; dismissed: number; starred: number } {
  let kept = 0, dismissed = 0, starred = 0;
  for (const e of events) {
    if (e.dismissed) dismissed++;
    else kept++;
    if (e.starred) starred++;
  }
  return { kept, dismissed, starred };
}

export function cleanPrepLists(params: {
  npcs: any[];
  locations: any[];
  monsters: string[];
  items: any[];
  treasure: string[];
  scenes: string[];
  secrets: string[];
  sessionLogs: SessionLogEntry[];
}): {
  npcs: any[];
  locations: any[];
  monsters: string[];
  items: any[];
  treasure: string[];
  scenes: string[];
  secrets: string[];
} {
  const { sessionLogs } = params;

  // 1. Gather all linked item IDs and names/snapshots from the session logs
  const linkedNpcIds = new Set<string>();
  const linkedNpcNames = new Set<string>();
  const linkedLocIds = new Set<string>();
  const linkedLocNames = new Set<string>();
  const linkedMonsterIds = new Set<string>();
  const linkedMonsterNames = new Set<string>();
  const linkedLootIds = new Set<string>();
  const linkedLootNames = new Set<string>();

  const usedScenes = new Set<string>();
  const usedSecrets = new Set<string>();

  for (const entry of sessionLogs) {
    // Collect used scenes
    if (Array.isArray(entry.scenesUsed)) {
      for (const scene of entry.scenesUsed) {
        if (scene) usedScenes.add(scene.trim());
      }
    }
    // Collect revealed secrets
    if (Array.isArray(entry.secretsRevealed)) {
      for (const secret of entry.secretsRevealed) {
        if (secret) usedSecrets.add(secret.trim());
      }
    }

    // Collect linked prep items
    if (Array.isArray(entry.linkedPrepItems)) {
      for (const item of entry.linkedPrepItems) {
        if (!item) continue;
        const id = (item.id || '').trim();
        const name = (item.snapshotName || '').trim();

        if (item.type === 'npc') {
          if (id) linkedNpcIds.add(id);
          if (name) linkedNpcNames.add(name);
        } else if (item.type === 'location') {
          if (id) linkedLocIds.add(id);
          if (name) linkedLocNames.add(name);
        } else if (item.type === 'encounter') {
          if (id) linkedMonsterIds.add(id);
          if (name) linkedMonsterNames.add(name);
        } else if (item.type === 'loot') {
          if (id) linkedLootIds.add(id);
          if (name) linkedLootNames.add(name);
        }
      }
    }
  }

  // 2. Filter NPCs
  const npcs = params.npcs.filter(n => {
    if (!n) return false;
    const id = String(n.id || '').trim();
    const name = String(n.name || '').trim();
    return !linkedNpcIds.has(id) && !linkedNpcNames.has(name);
  });

  // 3. Filter Locations
  const locations = params.locations.filter(l => {
    if (!l) return false;
    const id = String(l.id || '').trim();
    const name = String(l.name || '').trim();
    return !linkedLocIds.has(id) && !linkedLocNames.has(name);
  });

  // 4. Filter Monsters
  const monsters = params.monsters.filter(m => {
    if (!m) return false;
    const trimmed = m.trim();
    const cleanName = parseMonsterName(trimmed);
    return !linkedMonsterIds.has(trimmed) && !linkedMonsterNames.has(cleanName) && !linkedMonsterNames.has(trimmed);
  });

  // 5. Filter Items (Magic items)
  const items = params.items.filter(item => {
    if (!item) return false;
    if (typeof item === 'object') {
      const id = String(item.id || '').trim();
      const name = String(item.name || '').trim();
      const isAssigned = !!item.assignedPlayerId;
      return !isAssigned && !linkedLootIds.has(id) && !linkedLootNames.has(name);
    } else if (typeof item === 'string') {
      const trimmed = item.trim();
      return !linkedLootIds.has(trimmed) && !linkedLootNames.has(trimmed);
    }
    return true;
  });

  // 6. Filter Treasure
  const treasure = params.treasure.filter(t => {
    if (!t) return false;
    const trimmed = t.trim();
    return !linkedLootIds.has(trimmed) && !linkedLootNames.has(trimmed);
  });

  // 7. Filter Scenes
  const scenes = params.scenes.filter(s => {
    if (!s) return false;
    return !usedScenes.has(s.trim());
  });

  // 8. Filter Secrets
  const secrets = params.secrets.filter(s => {
    if (!s) return false;
    return !usedSecrets.has(s.trim());
  });

  return { npcs, locations, monsters, items, treasure, scenes, secrets };
}
