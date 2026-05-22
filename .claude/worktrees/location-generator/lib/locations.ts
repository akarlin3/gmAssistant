export const LOCATION_TYPE_GROUPS: Array<{ label: string; types: string[] }> = [
  {
    label: 'Settlements',
    types: ['City', 'Town', 'Village', 'Hamlet'],
  },
  {
    label: 'Wilderness',
    types: ['Forest', 'Mountain Pass', 'Swamp', 'Desert', 'Coast / Harbor', 'River / Lake', 'Island'],
  },
  {
    label: 'Sites & Structures',
    types: ['Tavern / Inn', 'Castle / Keep', 'Temple / Shrine', 'Ruin', 'Dungeon', 'Tomb / Crypt'],
  },
  {
    label: 'Planar & Exotic',
    types: ['Feywild Site', 'Shadowfell Site', 'Underdark Site', 'Astral Site'],
  },
];

export const ALL_LOCATION_TYPES = LOCATION_TYPE_GROUPS.flatMap((g) => g.types);
