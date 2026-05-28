import type { SessionLogEntry, LinkedPrepItem } from '@/lib/sessionLog';
import { parseMonsterName } from '@/lib/sessionLog';
import { normalizeItem } from '@/lib/playerMode/types';
import type { NPC, LocationRow } from './types';

/** Loosely-typed raw item record, matching `normalizeItem`'s input contract. */
type RawItem = string | Record<string, any>;

type LinkContext = {
  npcs: NPC[];
  locations: LocationRow[];
  monsters: string[];
  items: unknown[];
  treasure: string[];
};

/**
 * Encapsulates the add/remove/edit handlers and the "ghost" (orphaned link)
 * detection for a session's linked prep items. Pure relative to its inputs;
 * mutations are routed back through the supplied `onChange`.
 */
export function useLinkedPrepItems(
  entry: SessionLogEntry,
  onChange: (patch: Partial<SessionLogEntry>) => void,
  ctx: LinkContext,
) {
  const { npcs, locations, monsters, items, treasure } = ctx;
  const linkedItems = entry.linkedPrepItems || [];

  const handleAddLink = (
    type: LinkedPrepItem['type'],
    id: string,
    name: string,
    extra?: { xp?: number; loot?: string },
  ) => {
    const isDup = linkedItems.some(item => item.id === id && item.type === type);
    if (isDup) return;
    const newItem: LinkedPrepItem = {
      id,
      type,
      snapshotName: name,
      snapshotXP: extra?.xp,
      snapshotLoot: extra?.loot,
    };
    onChange({ linkedPrepItems: [...linkedItems, newItem] });
  };

  const handleRemoveLink = (type: LinkedPrepItem['type'], id: string) => {
    onChange({ linkedPrepItems: linkedItems.filter(item => !(item.id === id && item.type === type)) });
  };

  const handleUpdateXP = (id: string, xpValue: number) => {
    onChange({
      linkedPrepItems: linkedItems.map(item =>
        (item.id === id && item.type === 'encounter') ? { ...item, snapshotXP: xpValue } : item
      )
    });
  };

  const isGhostItem = (item: LinkedPrepItem) => {
    switch (item.type) {
      case 'npc':
        return !npcs.some(n => n.id === item.id || n.name === item.snapshotName);
      case 'location':
        return !locations.some(l => l.id === item.id || l.name === item.snapshotName);
      case 'encounter':
        return !monsters.some(m => m === item.id || parseMonsterName(m) === item.snapshotName);
      case 'loot': {
        const itemsList = (items as RawItem[]).map((it, idx) => normalizeItem(it, idx));
        const inItems = itemsList.some(it => it.id === item.id || it.name === item.snapshotName);
        const inTreasure = treasure.some(t => t === item.id || t === item.snapshotName);
        return !inItems && !inTreasure;
      }
      default:
        return true;
    }
  };

  return { linkedItems, handleAddLink, handleRemoveLink, handleUpdateXP, isGhostItem };
}
