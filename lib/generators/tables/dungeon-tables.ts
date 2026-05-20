// Dungeon tables — ORIGINAL CONTENT.
//
// Source / licensing: no DMG content. Room contents, dressing, hazards, and
// theme-keyed inhabitant pools are original prose. Inhabitant names reference
// generic creature archetypes (skeleton, goblin, ghoul, etc.) which appear
// in SRD 5.1, but no SRD stat blocks or descriptions are copied.

import type { DungeonResult } from '../types';

export type DungeonTheme = 'ruin' | 'lair' | 'tomb' | 'stronghold' | 'temple' | 'cave' | 'sewer';
export type DungeonSize = 'small' | 'medium' | 'large' | 'sprawling';
export type DungeonChallengeTier = '0-4' | '5-10' | '11-16' | '17+';

export const SIZE_TO_ROOM_COUNT: Record<DungeonSize, number> = {
  small: 5,
  medium: 10,
  large: 20,
  sprawling: 40,
};

export const THEME_NAME_PREFIXES: Record<DungeonTheme, readonly string[]> = {
  ruin: ['Broken', 'Lost', 'Toppled', 'Drowned', 'Burnt', 'Mossbound'],
  lair: ['Den of', 'Lair of', 'Warren of', 'Hollow of', 'Pit of'],
  tomb: ['Crypt of', 'Tomb of', 'Catacombs of', 'Bone-House of', 'Mausoleum of'],
  stronghold: ['Keep of', 'Fortress of', 'Citadel of', 'Bastion of', 'Hold of'],
  temple: ['Temple of', 'Sanctum of', 'Cloister of', 'Chapel of', 'Vow-House of'],
  cave: ['Caverns of', 'Mouths of', 'Black-Throat of', 'Belly of', 'Wormways of'],
  sewer: ['Drains of', 'Underway of', 'Gutter-Run of', 'Pipes of', 'Sluice of'],
};

export const THEME_NAME_SUFFIXES: Record<DungeonTheme, readonly string[]> = {
  ruin: ['the Old Hold', 'Hex Tower', 'the Vine-Choked Court', 'Salt-Bell Keep', 'the Sunken Causeway'],
  lair: ['the Iron-Tooth', 'the Long-Tail', 'the Mossback', 'the Pale Singer', 'the Night-Eyed Mother'],
  tomb: ['the Mended Saint', 'Bell-Throat the King', 'the Twin Sisters', 'Lord Halse', 'the Last Heralds'],
  stronghold: ['the Burnt Marshal', 'the Eight Banners', 'the Crooked Crown', 'the Bone-Light', 'Iron Vigil'],
  temple: ['the Listening God', 'the Lamp-Bearer', 'the Empty Throne', 'the Quiet Hour', 'the Mended Veil'],
  cave: ['the Crooked Salt', 'the Singing Bones', 'the Wet Stair', 'the Black Light', 'the Loud Dark'],
  sewer: ['the Ribbon Lock', 'the Tenfold Gate', 'the Old Sluice', 'the Drowned Bell', 'the Bone-Run'],
};

// Room content table. Weights:
//   empty: 30, monster: 25, trap: 10, hazard: 10, treasure: 8, feature: 12, puzzle: 5
export const ROOM_CONTENT_KINDS = [
  { value: 'empty' as const, weight: 30 },
  { value: 'monster' as const, weight: 25 },
  { value: 'trap' as const, weight: 10 },
  { value: 'hazard' as const, weight: 10 },
  { value: 'treasure' as const, weight: 8 },
  { value: 'feature' as const, weight: 12 },
  { value: 'puzzle' as const, weight: 5 },
];

export const ROOM_DESCRIPTIONS_BY_KIND: Record<'empty' | 'monster' | 'trap' | 'hazard' | 'treasure' | 'feature' | 'puzzle', readonly string[]> = {
  empty: [
    'an unremarkable room, recently disturbed',
    'an unremarkable room, undisturbed for years',
    'a room that someone has been sleeping in',
    'a room that has been hastily searched and abandoned',
    'a quiet room with nothing of obvious interest',
  ],
  monster: [
    'the room\'s inhabitants are mid-meal and unhappy to be interrupted',
    'a creature is asleep here; the floor is strewn with the leavings of its last meal',
    'two creatures are arguing here; their voices carry into the corridor',
    'the room is a den; the inhabitants will fight to defend it',
    'a sentry stands here; raising the alarm will summon more',
    'the creature here is wounded; it may be willing to bargain',
  ],
  trap: [
    'a pressure plate triggers a hidden mechanism when stepped on',
    'a tripwire across the doorway releases something into the room',
    'the ceiling is unstable; a single loud noise will bring it down',
    'an old ward inscribed on the lintel triggers when crossed',
    'a swinging blade waits behind the door for the second person through',
  ],
  hazard: [
    'the floor is half-flooded with cold black water',
    'mould grows thickly on every surface; touching it stains the skin',
    'the air is thin here; breathing for long is exhausting',
    'something in the walls is whispering; the longer you listen the harder it is to leave',
    'the floor is slick with old grease; running is dangerous',
  ],
  treasure: [
    'a small unlocked chest holds modest coin and an unidentified pouch',
    'an iron lockbox is bolted to the floor; the key is not here',
    'a treasure offering on a small altar; taking it has consequences',
    'a stash hidden behind a loose stone in the wall',
    'a body in old armour, still wearing rings',
  ],
  feature: [
    'a stone altar carved with crude symbols; offerings are arranged on top',
    'a deep pit at the room\'s centre; the bottom cannot be seen from the rim',
    'an old well; the water is fresh',
    'a great chain in the floor, padlocked, leading down into darkness',
    'a circle of stones; the air inside the circle is markedly colder',
    'a mural so faded it is barely legible; what remains is unsettling',
    'a single tall mirror in a gilt frame; it does not reflect the room',
  ],
  puzzle: [
    'three doors stand at the far wall, each with a different rune; only one is the way forward',
    'a chessboard inlaid in the floor, with two pieces overturned; what they signify is unclear',
    'a riddle in old script is carved over an iron door, in a language one of the party knows',
    'a column with rotating bands marked with sigils; the bands click when turned',
  ],
};

export const ROOM_DRESSING: readonly string[] = [
  'broken crockery underfoot; an old candle stub on a shelf',
  'a child\'s drawing in chalk on the far wall; it has been here a long time',
  'a single boot, dry and cracked, in the corner',
  'the bones of small animals piled into a strange shape by the door',
  'a stack of dust-thick books no one will ever read again',
  'a torn banner draped from a beam, its sigil long faded',
  'three iron hooks in the wall, one of which has been wrenched out of true',
  'old rope coiled neatly in the corner, oiled, as if waiting',
  'a broken stair rising into the ceiling and stopping mid-step',
  'a single eye painted on each wall, watching the centre of the room',
  'an old fire in the centre of the room, banked, embers cooling',
  'a small tin cup half full of dark, foul water',
  'a child\'s wooden toy left at the foot of an altar',
  'a cracked stone basin with brown stains around the rim',
  'an axe buried in a wooden post, the handle long since rotted',
  'a length of clean silk thread snagged on a nail',
  'a row of small boots arranged neatly against one wall',
  'a low whistling sound that has no obvious source',
  'an upturned chair; the rest of the furniture is missing',
  'a calendar carved into the wall ending three months ago',
];

export const HAZARD_TABLE: readonly string[] = [
  'standing water hides a deep pit at the centre of the chamber',
  'a fungus growth spreads damaging spores when disturbed',
  'air pockets of stale gas pool near the floor',
  'thin floors over older drainage pits',
  'the dungeon settles audibly; loud noises bring stones down from the ceiling',
  'cursed runes carved into the door frames; crossing them costs the will to keep going',
  'pools of strong acid disguised as still water',
  'a structural weakness — half the corridor collapses if more than one person treads on the wrong stone',
  'a faint magical chill that slows movement and clouds the mind',
  'an infestation of small biting things in the walls',
];

// Inhabitant pools by theme + tier. Names are generic creature archetypes —
// no SRD descriptions or stat lines copied.
export const INHABITANTS_BY_THEME_TIER: Record<DungeonTheme, Record<DungeonChallengeTier, readonly string[]>> = {
  ruin: {
    '0-4':   ['kobold scavengers', 'giant rats', 'goblin claim-jumpers', 'stirges', 'a single ghoul'],
    '5-10':  ['gnoll war band', 'wererat squatters', 'shadow drake roosting here', 'a mind-broken wizard and their familiar'],
    '11-16': ['black guard cultists', 'a marshalled wight and their captains', 'a roost of perytons'],
    '17+':   ['a slumbering ancient nightmare', 'a bound storm giant', 'a forgotten god\'s herald'],
  },
  lair: {
    '0-4':   ['wolves', 'giant centipedes', 'a single ogre', 'awakened wolves'],
    '5-10':  ['owlbear pair', 'griffon parent and brood', 'manticore', 'troll and its young'],
    '11-16': ['young dragon and its hoard-watcher', 'chimera mated pair', 'a pack of hellhounds and their handler'],
    '17+':   ['adult dragon and its mate', 'a behir', 'a roc and its rider'],
  },
  tomb: {
    '0-4':   ['skeletons', 'crawling claws', 'an animated armoury', 'a swarm of beetles'],
    '5-10':  ['wight king\'s retinue', 'a small unit of wraiths', 'an animated guardian and its hounds'],
    '11-16': ['mummies of the funerary court', 'a deathlock', 'a lich\'s apprentice'],
    '17+':   ['a lich and their inner court', 'an ancient mummy lord', 'a deathknight and his cursed retinue'],
  },
  stronghold: {
    '0-4':   ['bandit company', 'hobgoblin watch', 'a small unit of orcs'],
    '5-10':  ['veteran mercenary garrison', 'hobgoblin warband with shamans', 'an oni in disguise'],
    '11-16': ['a fallen knight-captain and his elite', 'a war-priest of a forbidden god', 'a stone giant retinue'],
    '17+':   ['a marshal of the dead and their banner-host', 'an archfey general and their court'],
  },
  temple: {
    '0-4':   ['acolyte cultists', 'a single doppelganger pretending to be the priest', 'small swarms of bats'],
    '5-10':  ['a senior cult priest and their inner circle', 'a vrock or other demonic visitor', 'a fanatical knight-templar'],
    '11-16': ['a high priest with several lieutenants', 'an outsider bound to the altar', 'a corrupted celestial'],
    '17+':   ['a god\'s herald (corrupted)', 'a pit fiend ambassador', 'a planar court visiting in secret'],
  },
  cave: {
    '0-4':   ['cave goblins', 'giant spiders', 'troglodytes', 'a single ettin'],
    '5-10':  ['drow scouts', 'umber hulk', 'kuo-toa raiders', 'a hill giant and their bull'],
    '11-16': ['drow noble scouting party', 'a beholder\'s lesser kin', 'a stone giant matriarch and clan'],
    '17+':   ['an aboleth and its court', 'a beholder', 'a balor visiting the deep dark'],
  },
  sewer: {
    '0-4':   ['wererat squatters', 'rust monsters', 'otyugh', 'a small gang of gricks'],
    '5-10':  ['wererat clan elders', 'a young black dragon making a home here', 'gricks of an unusual size'],
    '11-16': ['wererat clan war-band', 'a sleeping aboleth\'s thralls', 'a deathlock', 'a roper at the central chamber'],
    '17+':   ['an aboleth\'s outlying thrall-host', 'a roper-thrall network with overseers', 'an ancient sewer-wyrm'],
  },
};

// Room name fragments, used to give each room a short label.
export const ROOM_NAME_NOUNS: readonly string[] = [
  'Antechamber', 'Cell', 'Chapel', 'Cistern', 'Cloister', 'Corridor', 'Crypt', 'Den',
  'Foyer', 'Gallery', 'Guardroom', 'Hall', 'Hollow', 'Kitchen', 'Larder', 'Library',
  'Mess', 'Pit', 'Refectory', 'Stair', 'Storeroom', 'Sump', 'Vestry', 'Workshop',
];

export type RoomKind = keyof typeof ROOM_DESCRIPTIONS_BY_KIND;
export type DungeonRoomDraft = DungeonResult['details']['rooms'][number];

// Exit-type weights used by the map layout. `states` is the door-state table
// rolled when the exit is a door variant; non-door exits leave it undefined.
export const EXIT_TYPE_WEIGHTS: readonly {
  type: string;
  weight: number;
  states?: readonly string[];
}[] = [
  {
    type: 'door',
    weight: 32,
    states: [
      'closed, unlocked',
      'closed and locked from this side',
      'closed and locked from the other side',
      'stuck — forced open with effort',
      'ajar, swinging slightly',
      'lock recently pried open',
    ] as const,
  },
  { type: 'archway', weight: 22 },
  { type: 'corridor', weight: 22 },
  {
    type: 'secret door',
    weight: 8,
    states: [
      'concealed behind a tapestry',
      'flush with the masonry, no seam visible',
      'opens to the right pressure on a flagstone',
      'triggered by a counterweight elsewhere',
    ] as const,
  },
  { type: 'stairs up', weight: 6 },
  { type: 'stairs down', weight: 6 },
  { type: 'ladder', weight: 2 },
  { type: 'shaft', weight: 1 },
  { type: 'portal', weight: 1 },
];
