import { getFirebaseAuth } from '@/lib/firebase/client';
import { type MapEntityType } from '@/lib/maps/types';

export type Tool = 'select' | 'addMarker' | 'addNode' | 'addEdge';

export const ENTITY_LABEL: Record<MapEntityType, string> = {
  npcs: 'NPC',
  locations: 'Location',
  factions: 'Faction',
  monsters: 'Monster',
  items: 'Item',
};

export function uid(): string {
  return getFirebaseAuth().currentUser?.uid ?? '';
}

// Build [{id,name}] for an entity type from the campaign blob, tolerating the
// item array's string-or-object shape.
export function entityList(data: Record<string, any>, type: MapEntityType): Array<{ id: string; name: string }> {
  const arr = Array.isArray(data?.[type]) ? data[type] : [];
  return arr
    .map((e: any, i: number) => {
      if (typeof e === 'string') return { id: `item_${i}`, name: e.split(' — ')[0] || e };
      if (e && typeof e === 'object') {
        const id = typeof e.id === 'string' ? e.id : `${type}_${i}`;
        const name = typeof e.name === 'string' ? e.name : '';
        return { id, name };
      }
      return null;
    })
    .filter((e: any): e is { id: string; name: string } => !!e && !!e.name);
}

export function entityName(data: Record<string, any>, type: MapEntityType | undefined, id: string | undefined): string {
  if (!type || !id) return '';
  return entityList(data, type).find((e) => e.id === id)?.name ?? '';
}
