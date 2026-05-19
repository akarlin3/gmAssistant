// Tavern tables — ORIGINAL CONTENT.
//
// Source / licensing: no DMG / PHB content. Two-part name tables, atmosphere
// descriptors, menu items, patron stubs, and rumour templates are all
// original prose authored for this project.

import type { SettlementSizeClass } from '../types';

export type TavernVibe = 'rough' | 'cozy' | 'upscale' | 'seedy' | 'themed';

export const TAVERN_NAME_PREFIXES: readonly string[] = [
  'The Brass', 'The Bent', 'The Bell', 'The Broken', 'The Crooked', 'The Crimson',
  'The Drowned', 'The Empty', 'The Forgotten', 'The Gilded', 'The Green', 'The Half-Penny',
  'The Hollow', 'The Iron', 'The Last', 'The Lonesome', 'The Long', 'The Mended',
  'The Quiet', 'The Salt', 'The Six-Fingered', 'The Sleeping', 'The Slow', 'The Sober',
  'The Stitched', 'The Twice-Lost', 'The Unmarked', 'The Wandering', 'The White',
  'The Wild', 'The Yawning',
];

export const TAVERN_NAME_SUFFIXES: readonly string[] = [
  'Anchor', 'Bell', 'Boar', 'Candle', 'Cloak', 'Compass', 'Crow', 'Crown', 'Cup',
  'Dog', 'Drake', 'Eel', 'Eye', 'Fish', 'Flagon', 'Fox', 'Goose', 'Halfpenny',
  'Hare', 'Hart', 'Hearth', 'Horn', 'Hound', 'Inn', 'Lantern', 'Lark', 'Mare',
  'Moon', 'Mug', 'Otter', 'Owl', 'Pillow', 'Quill', 'Ram', 'Raven', 'Rest',
  'Riddle', 'Sailor', 'Scribe', 'Sheaf', 'Shilling', 'Sigil', 'Sparrow', 'Spear',
  'Stag', 'Star', 'Stone', 'Stork', 'Sun', 'Sword', 'Tankard', 'Thistle', 'Thorn',
  'Toad', 'Wagon', 'Wheel', 'Whistle',
];

export const ATMOSPHERE_BY_VIBE: Record<TavernVibe, readonly string[]> = {
  rough: [
    'a low, smoke-blackened common room thick with the smell of sweat and stale beer',
    'long benches scarred from a hundred fights, the floor sticky in places no one wants to think about',
    'two doors leading out at the back; the regulars know which one leads to the alley and which to the kitchen',
    'a hearth that never quite gets hot enough, and a serving woman with a cudgel under her counter',
  ],
  cozy: [
    'low ceiling beams hung with copper pots; one corner permanently smells of bread',
    'warm yellow lamplight, scrubbed tables, and a black-and-white cat asleep by the hearth',
    'a single round window above the door letting in afternoon sun the colour of honey',
    'thick rugs on a flagstone floor and the constant low burr of friendly conversation',
  ],
  upscale: [
    'tall windows leaded with green glass, white linen tables, and a discreet servant at each door',
    'a high-ceilinged dining room with a quartet at the far end playing something restrained',
    'crystal lamps with mirrored backs and the careful murmur of people pretending not to listen',
    'polished mahogany counters, brass fittings, and a smell of beeswax beneath the wine',
  ],
  seedy: [
    'a low front room and three smaller booths in the back where deals are made and nothing is overheard',
    'flickering oil lamps, a curtain across the stairwell, and a watchman who never looks up',
    'a counter that is also a moneychanger\'s and a kitchen that closes earlier than advertised',
    'sawdust on the floor to absorb spilled drinks and anything else',
  ],
  themed: [
    'every surface decorated to the theme, sometimes tipping into the absurd; the regulars do not seem to notice',
    'the kitchen serves only dishes that fit the conceit, with a hand-painted menu on the back wall',
    'a small stage where the staff perform a brief themed routine once an evening',
    'walls hung with relics of the theme, half of them obviously sourced from market stalls',
  ],
};

export const VIBE_KEYWORDS: Record<TavernVibe, string[]> = {
  rough: ['dockhand', 'mercenary', 'caravan guard', 'pit-fighter', 'horse-breaker'],
  cozy: ['weaver', 'baker', 'apprentice', 'pensioner', 'cooper'],
  upscale: ['merchant', 'scholar', 'minor noble', 'diplomat', 'ambassador'],
  seedy: ['smuggler', 'fence', 'informer', 'cutpurse', 'tax-shaver'],
  themed: ['cosplayer', 'enthusiast', 'fan', 'traveller', 'pilgrim'],
};

// Menu items keyed to settlement size: each entry includes a copper-piece
// price that scales with the size's price multiplier (reusing SIZE_PRICE_MARKUP
// from the shop tables).
export type MenuItemTable = { name: string; kind: 'food' | 'drink' | 'lodging'; basePriceCp: number };

export const TAVERN_MENU: readonly MenuItemTable[] = [
  // food
  { name: 'bread and dripping', kind: 'food', basePriceCp: 2 },
  { name: 'thick barley pottage', kind: 'food', basePriceCp: 3 },
  { name: 'cabbage and bacon stew', kind: 'food', basePriceCp: 4 },
  { name: 'fried fish and turnip', kind: 'food', basePriceCp: 5 },
  { name: 'mutton pie, sharp pepper crust', kind: 'food', basePriceCp: 7 },
  { name: 'roast chicken with brown gravy', kind: 'food', basePriceCp: 9 },
  { name: 'salt-cured pork hock', kind: 'food', basePriceCp: 8 },
  { name: 'rabbit, stewed with prunes', kind: 'food', basePriceCp: 10 },
  { name: 'venison cutlet, red wine reduction', kind: 'food', basePriceCp: 25 },
  { name: 'duck with crackling skin', kind: 'food', basePriceCp: 18 },
  { name: 'apple tart with cream', kind: 'food', basePriceCp: 6 },
  { name: 'plate of soft cheese, hard cheese, and oat biscuits', kind: 'food', basePriceCp: 8 },
  // drink
  { name: 'house ale', kind: 'drink', basePriceCp: 2 },
  { name: 'dark stout (pint)', kind: 'drink', basePriceCp: 3 },
  { name: 'cider, summer-pressed', kind: 'drink', basePriceCp: 3 },
  { name: 'mead, spiced', kind: 'drink', basePriceCp: 5 },
  { name: 'red wine, table-grade', kind: 'drink', basePriceCp: 6 },
  { name: 'white wine, dry', kind: 'drink', basePriceCp: 7 },
  { name: 'imported brandy', kind: 'drink', basePriceCp: 50 },
  { name: 'pot of tea, lemon-leaf', kind: 'drink', basePriceCp: 2 },
  { name: 'hot mulled wine (winter)', kind: 'drink', basePriceCp: 6 },
  { name: 'small beer (children\'s)', kind: 'drink', basePriceCp: 1 },
  // lodging
  { name: 'a place by the fire', kind: 'lodging', basePriceCp: 3 },
  { name: 'a bench in the common room', kind: 'lodging', basePriceCp: 5 },
  { name: 'shared room, four straw mattresses', kind: 'lodging', basePriceCp: 8 },
  { name: 'private room with a single bed', kind: 'lodging', basePriceCp: 25 },
  { name: 'private room with a desk and basin', kind: 'lodging', basePriceCp: 50 },
];

// Patron stubs: a one-line "race/class hint, occupation, one-trait" template.
// These are skeletons the generator fills in (race, occupation, trait pools
// kept here).
export const PATRON_RACES: readonly string[] = [
  'human', 'half-elf', 'elf', 'dwarf', 'halfling', 'gnome', 'tiefling', 'half-orc', 'dragonborn',
];

export const PATRON_OCCUPATIONS: readonly string[] = [
  'caravan guard between jobs', 'travelling musician', 'farmhand on market day', 'pilgrim heading north',
  'off-duty militiaman', 'minor clerk in the local court', 'wandering scholar', 'apprentice smith',
  'down-on-luck mercenary', 'travelling priest', 'horse-trader', 'cooper\'s daughter',
  'travelling tinker', 'retired soldier', 'court bard between patrons', 'second mate on a river barge',
  'tin-cup beggar', 'travelling alchemist', 'jeweller passing through', 'sailor on land for a week',
];

export const PATRON_TRAITS: readonly string[] = [
  'always leaves a small coin on the table for the staff',
  'plays a stringed instrument badly but with feeling',
  'has a tattoo of a foreign letter on the inside of the wrist',
  'speaks too loudly when they have had a single drink',
  'wears a copper bracelet that they fidget with constantly',
  'limps slightly on the right foot, refuses to talk about it',
  'is missing the last joint of the smallest finger on the left hand',
  'whistles between sentences without realising',
  'always orders the same dish and never finishes it',
  'has a chipped clay pipe they fill from a leather pouch',
  'wears a green ribbon around the neck',
  'never sits with their back to the door',
  'speaks in a soft mainland accent that does not match the rest of their clothing',
  'has a single gold tooth and is proud of it',
  'always has a small dog with them, named for a saint',
  'never removes their gloves',
  'orders nothing but water and tips heavily',
  'has the rough manners of a soldier and the careful diction of a scholar',
  'carries a small leather notebook and writes a line whenever they think no one is looking',
  'always sits in the same corner; the regulars know not to take it',
];

// Rumour templates. Each is a placeholder pattern with {VAR} slots that the
// generator fills with values from below.
export const RUMOR_TEMPLATES: readonly string[] = [
  'They say a {THING} was seen on the {PLACE} road last Tuesday — nobody who saw it has spoken since.',
  'The {NPC_TITLE} at {INSTITUTION} hasn\'t been seen in three days. Their door is locked from the outside.',
  'There\'s a {THING} in the {PLACE} that wasn\'t there a month ago. The {NPC_TITLE} says it shouldn\'t be touched.',
  'Last week a {NPC_TITLE} paid for a room in old coin — coin a century out of mint — and was gone before dawn.',
  'Two caravans have come through this month with the same story: {THING} in the woods past the {PLACE}.',
  '{INSTITUTION} is hiring people who don\'t mind night work and don\'t ask questions. The pay is too good.',
  'The {NPC_TITLE}\'s child has gone missing again. They came back the first two times. Nobody talks about how.',
  'A {THING} washed up on the {PLACE} at low tide. They\'ve buried it but the gulls won\'t go near.',
  'The bell at {INSTITUTION} rang three times after midnight and there\'s no one inside to ring it.',
  'A {NPC_TITLE} is offering coin for anyone willing to spend a single night in the {PLACE}.',
  'They say if you stand on the {PLACE} at sunset and call your own name, something else answers.',
  '{INSTITUTION} burned down twice this year and was rebuilt both times before anyone noticed who was doing the work.',
];

export const RUMOR_VARS = {
  THING: [
    'pale-eyed stranger', 'figure in a brown cloak', 'cart with no driver', 'dog the size of a horse',
    'priest in old-fashioned vestments', 'child carrying a lantern', 'man without a shadow',
    'woman speaking a language no one knows', 'wagon full of empty cages', 'flock of black birds',
  ],
  PLACE: [
    'old north road', 'eastern bridge', 'mill stream', 'churchyard', 'old market square',
    'south orchard', 'broken aqueduct', 'forest edge', 'salt marsh', 'cliff path',
  ],
  NPC_TITLE: [
    'innkeeper', 'priest', 'sergeant of the watch', 'tax-collector', 'apprentice scribe',
    'magistrate', 'cooper', 'apothecary', 'travelling tinker', 'old woman who lives by the well',
  ],
  INSTITUTION: [
    'old chapel', 'town hall', 'guildhouse', 'almshouse', 'lighthouse', 'mill', 'apothecary',
    'magistrate\'s office', 'old inn at the crossroads', 'tannery',
  ],
} as const;
