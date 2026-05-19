// Shop tables — ORIGINAL CONTENT.
//
// Source / licensing: SRD 5.1 does include a basic equipment list, but
// rather than embed its prices verbatim (which carries CC-BY attribution
// obligations and ties us to its specific gold-standard units), this file
// reconstructs an original adventurer's inventory of mundane goods with
// fresh names, descriptions, and a unified copper-piece base price.
// Settlement-size scarcity rules and price markups are original.
//
// Items are tagged with availability tiers: a "tier-2" item (uncommon
// goods) is only available in town-sized settlements or larger.

import type { ItemCategory, ItemRarity, SettlementSizeClass } from '../types';

export type ShopType =
  | 'general store'
  | 'smith'
  | 'alchemist'
  | 'fletcher'
  | 'herbalist'
  | 'scribe'
  | 'tailor'
  | 'stable';

export const SHOP_TYPES: readonly ShopType[] = [
  'general store', 'smith', 'alchemist', 'fletcher', 'herbalist', 'scribe', 'tailor', 'stable',
];

// availability: 0 = always available; 1 = village+; 2 = town+; 3 = small city+; 4 = large city+
export type MundaneItem = {
  name: string;
  shop: ShopType;
  category: ItemCategory;
  basePriceCp: number;
  availability: 0 | 1 | 2 | 3 | 4;
  note?: string;
};

export const SIZE_AVAILABILITY: Record<SettlementSizeClass, 0 | 1 | 2 | 3 | 4> = {
  thorp: 0,
  hamlet: 0,
  village: 1,
  town: 2,
  'small city': 3,
  'large city': 4,
  metropolis: 4,
};

export const SIZE_PRICE_MARKUP: Record<SettlementSizeClass, number> = {
  thorp: 1.4,        // scarcity in tiny places
  hamlet: 1.3,
  village: 1.15,
  town: 1.0,
  'small city': 0.95,
  'large city': 0.9,
  metropolis: 0.9,
};

export const MUNDANE_INVENTORY: readonly MundaneItem[] = [
  // ── general store ──
  { name: 'tallow candle (bundle of six)', shop: 'general store', category: 'gear', basePriceCp: 4, availability: 0 },
  { name: 'iron tinderbox', shop: 'general store', category: 'gear', basePriceCp: 50, availability: 0 },
  { name: 'oil lantern with brass handle', shop: 'general store', category: 'gear', basePriceCp: 500, availability: 1 },
  { name: 'hempen rope, fifty feet, coiled', shop: 'general store', category: 'gear', basePriceCp: 100, availability: 0 },
  { name: 'silken rope, fifty feet (oiled)', shop: 'general store', category: 'gear', basePriceCp: 1000, availability: 3 },
  { name: 'travelling blanket, undyed wool', shop: 'general store', category: 'gear', basePriceCp: 50, availability: 0 },
  { name: 'leather waterskin, two-quart', shop: 'general store', category: 'gear', basePriceCp: 200, availability: 0 },
  { name: 'tin mess kit (cup, plate, spoon)', shop: 'general store', category: 'gear', basePriceCp: 200, availability: 0 },
  { name: 'small steel mirror in leather sheath', shop: 'general store', category: 'gear', basePriceCp: 500, availability: 2 },
  { name: 'iron spike, single', shop: 'general store', category: 'gear', basePriceCp: 5, availability: 0 },
  { name: 'small iron pot', shop: 'general store', category: 'gear', basePriceCp: 200, availability: 0 },
  { name: 'wax-dipped torch, single', shop: 'general store', category: 'gear', basePriceCp: 1, availability: 0 },
  { name: 'leather pouch, drawstring', shop: 'general store', category: 'gear', basePriceCp: 50, availability: 0 },
  { name: 'cotton sack, large', shop: 'general store', category: 'gear', basePriceCp: 10, availability: 0 },
  { name: 'short pole of ash, ten feet', shop: 'general store', category: 'gear', basePriceCp: 5, availability: 0 },
  { name: 'iron grappling hook', shop: 'general store', category: 'gear', basePriceCp: 200, availability: 1 },
  // ── smith ──
  { name: 'short sword, plain hilt', shop: 'smith', category: 'weapon', basePriceCp: 1000, availability: 1 },
  { name: 'long sword, ash-handled', shop: 'smith', category: 'weapon', basePriceCp: 1500, availability: 2 },
  { name: 'dagger, simple', shop: 'smith', category: 'weapon', basePriceCp: 200, availability: 0 },
  { name: 'handaxe, hickory haft', shop: 'smith', category: 'weapon', basePriceCp: 500, availability: 0 },
  { name: 'spear, soft-iron tip', shop: 'smith', category: 'weapon', basePriceCp: 100, availability: 0 },
  { name: 'iron shield, banded oak', shop: 'smith', category: 'armor', basePriceCp: 1000, availability: 1 },
  { name: 'studded leather jerkin', shop: 'smith', category: 'armor', basePriceCp: 4500, availability: 2 },
  { name: 'chain shirt, well-fitted', shop: 'smith', category: 'armor', basePriceCp: 5000, availability: 2 },
  { name: 'iron helmet', shop: 'smith', category: 'armor', basePriceCp: 1000, availability: 1 },
  { name: 'horseshoes, set of four', shop: 'smith', category: 'gear', basePriceCp: 200, availability: 1 },
  { name: 'crowbar, hammered iron', shop: 'smith', category: 'tool', basePriceCp: 200, availability: 0 },
  { name: 'hammer, blacksmith\'s', shop: 'smith', category: 'tool', basePriceCp: 100, availability: 0 },
  // ── alchemist ──
  { name: 'flask of lamp oil', shop: 'alchemist', category: 'gear', basePriceCp: 10, availability: 0 },
  { name: 'flask of acid', shop: 'alchemist', category: 'potion', basePriceCp: 2500, availability: 2 },
  { name: 'flask of greek fire', shop: 'alchemist', category: 'potion', basePriceCp: 5000, availability: 3 },
  { name: 'salve of small healing', shop: 'alchemist', category: 'potion', basePriceCp: 5000, availability: 2 },
  { name: 'vial of antitoxin', shop: 'alchemist', category: 'potion', basePriceCp: 5000, availability: 2 },
  { name: 'pinch of phosphorus', shop: 'alchemist', category: 'gear', basePriceCp: 200, availability: 2 },
  { name: 'jar of slow-burning powder', shop: 'alchemist', category: 'gear', basePriceCp: 500, availability: 2 },
  { name: 'reagent bottle (saltpetre)', shop: 'alchemist', category: 'gear', basePriceCp: 100, availability: 1 },
  // ── fletcher ──
  { name: 'arrows, bundle of twenty', shop: 'fletcher', category: 'gear', basePriceCp: 100, availability: 0 },
  { name: 'crossbow bolts, bundle of twenty', shop: 'fletcher', category: 'gear', basePriceCp: 100, availability: 1 },
  { name: 'shortbow, well-shaped yew', shop: 'fletcher', category: 'weapon', basePriceCp: 2500, availability: 1 },
  { name: 'longbow, ash with horn nocks', shop: 'fletcher', category: 'weapon', basePriceCp: 5000, availability: 2 },
  { name: 'light crossbow', shop: 'fletcher', category: 'weapon', basePriceCp: 2500, availability: 2 },
  { name: 'leather quiver, twenty-arrow', shop: 'fletcher', category: 'gear', basePriceCp: 100, availability: 0 },
  // ── herbalist ──
  { name: 'bundle of dried sage', shop: 'herbalist', category: 'gear', basePriceCp: 10, availability: 0 },
  { name: 'pouch of dried willow bark', shop: 'herbalist', category: 'gear', basePriceCp: 25, availability: 0 },
  { name: 'jar of honey-soaked roots', shop: 'herbalist', category: 'gear', basePriceCp: 50, availability: 0 },
  { name: 'salt-cured leeches, six', shop: 'herbalist', category: 'gear', basePriceCp: 50, availability: 1 },
  { name: 'tincture of poppy', shop: 'herbalist', category: 'potion', basePriceCp: 1000, availability: 2 },
  { name: 'vial of moonflower honey', shop: 'herbalist', category: 'potion', basePriceCp: 500, availability: 1 },
  { name: 'small jar of soothing balm', shop: 'herbalist', category: 'potion', basePriceCp: 100, availability: 0 },
  { name: 'pressed bundle of stinging nettles', shop: 'herbalist', category: 'gear', basePriceCp: 25, availability: 1 },
  // ── scribe ──
  { name: 'sheet of fine vellum', shop: 'scribe', category: 'gear', basePriceCp: 100, availability: 1 },
  { name: 'roll of parchment, ten sheets', shop: 'scribe', category: 'gear', basePriceCp: 200, availability: 1 },
  { name: 'pot of iron-gall ink', shop: 'scribe', category: 'gear', basePriceCp: 200, availability: 1 },
  { name: 'pot of red letter ink', shop: 'scribe', category: 'gear', basePriceCp: 400, availability: 2 },
  { name: 'cut goose-feather quills, ten', shop: 'scribe', category: 'gear', basePriceCp: 25, availability: 1 },
  { name: 'wax stick, red', shop: 'scribe', category: 'gear', basePriceCp: 10, availability: 1 },
  { name: 'sealing-stick, dark green wax', shop: 'scribe', category: 'gear', basePriceCp: 25, availability: 2 },
  { name: 'pocket-book of ruled paper', shop: 'scribe', category: 'gear', basePriceCp: 500, availability: 2 },
  // ── tailor ──
  { name: 'plain wool tunic', shop: 'tailor', category: 'gear', basePriceCp: 500, availability: 1 },
  { name: 'travelling cloak, oiled wool', shop: 'tailor', category: 'gear', basePriceCp: 1000, availability: 1 },
  { name: 'fine linen shirt', shop: 'tailor', category: 'gear', basePriceCp: 2000, availability: 2 },
  { name: 'leather belt with iron buckle', shop: 'tailor', category: 'gear', basePriceCp: 100, availability: 0 },
  { name: 'kid-leather gloves, pair', shop: 'tailor', category: 'gear', basePriceCp: 500, availability: 2 },
  { name: 'embroidered sash', shop: 'tailor', category: 'gear', basePriceCp: 1500, availability: 3 },
  { name: 'pair of stout walking boots', shop: 'tailor', category: 'gear', basePriceCp: 2000, availability: 2 },
  // ── stable ──
  { name: 'sturdy mule', shop: 'stable', category: 'gear', basePriceCp: 800, availability: 1 },
  { name: 'riding horse, four-year-old', shop: 'stable', category: 'gear', basePriceCp: 7500, availability: 2 },
  { name: 'draft horse, working-age', shop: 'stable', category: 'gear', basePriceCp: 5000, availability: 1 },
  { name: 'saddle, riding', shop: 'stable', category: 'gear', basePriceCp: 1000, availability: 2 },
  { name: 'saddle, pack', shop: 'stable', category: 'gear', basePriceCp: 500, availability: 1 },
  { name: 'feed bag with three-day ration', shop: 'stable', category: 'gear', basePriceCp: 50, availability: 1 },
  { name: 'horsewhip', shop: 'stable', category: 'gear', basePriceCp: 100, availability: 1 },
];

// Format a copper price into the largest reasonable denomination.
export function formatPrice(cp: number): string {
  if (cp <= 0) return 'free';
  if (cp < 10) return `${cp} cp`;
  if (cp < 100) return `${(cp / 10).toFixed(cp % 10 === 0 ? 0 : 1)} sp`;
  return `${(cp / 100).toFixed(cp % 100 === 0 ? 0 : 2).replace(/\.?0+$/, '')} gp`;
}

// Shop name parts. Original prose, generic across cultures.
export const SHOP_NAME_PARTS: Record<ShopType, { prefix: readonly string[]; suffix: readonly string[] }> = {
  'general store': {
    prefix: ['The Cracked', 'The Honest', 'The Wandering', 'The Patient', 'The Quiet', 'The Threadbare', 'Old', 'New'],
    suffix: ['Lantern', 'Doorstep', 'Bell', 'Crate', 'Tinderbox', 'Sack', 'Hearth', 'Mug'],
  },
  smith: {
    prefix: ['The Hammered', 'The Folded', 'The Bright', 'The Stout', 'The Anvil', 'Iron-Heart', 'Black-Lung'],
    suffix: ['Anvil', 'Forge', 'Hearth', 'Quench', 'Bellows', 'Heat', 'Edge'],
  },
  alchemist: {
    prefix: ['The Brittle', 'The Steeping', 'The Long', 'The Patient', 'The Greening', 'The Salted'],
    suffix: ['Crucible', 'Beaker', 'Retort', 'Vapour', 'Pot', 'Distillate'],
  },
  fletcher: {
    prefix: ['The Long', 'The Straight', 'The Clean', 'The Patient', 'The Goose', 'The Yew'],
    suffix: ['Arrow', 'Nock', 'Quiver', 'Bowstring', 'Fletch', 'Shaft'],
  },
  herbalist: {
    prefix: ['The Green', 'The Hedgerow', 'The Crooked', 'The Salted', 'The Mossy', 'The Bitter'],
    suffix: ['Petal', 'Sprig', 'Mortar', 'Garden', 'Pestle', 'Bough'],
  },
  scribe: {
    prefix: ['The Quiet', 'The Hooded', 'The Slow', 'The Careful', 'The Borrowed', 'The Black'],
    suffix: ['Quill', 'Paragraph', 'Margin', 'Page', 'Ledger', 'Inkpot'],
  },
  tailor: {
    prefix: ['The Stitched', 'The Patient', 'The Folded', 'The Black-Thread', 'The Honest'],
    suffix: ['Seam', 'Loom', 'Shears', 'Cuff', 'Lapel', 'Sleeve'],
  },
  stable: {
    prefix: ['The Long', 'The Quiet', 'The Old', 'The Honest', 'The Heavy', 'The Steady'],
    suffix: ['Stride', 'Bridle', 'Halter', 'Pasture', 'Hoof', 'Stall'],
  },
};

// Mundane shop owner descriptors (original short phrases).
export const OWNER_FIRSTNAMES = [
  'Bram', 'Cole', 'Dara', 'Edda', 'Fern', 'Gar', 'Hen', 'Ivar', 'Joss', 'Kell',
  'Lin', 'Mer', 'Nell', 'Ord', 'Pell', 'Quel', 'Rin', 'Sera', 'Tor', 'Una',
  'Var', 'Wen', 'Yel', 'Zara', 'Aslin', 'Bryn', 'Cori', 'Doss', 'Emry', 'Frey',
];

export const OWNER_SURNAMES = [
  'Ash', 'Belt', 'Crowfoot', 'Drape', 'Elm', 'Frost', 'Gull', 'Hammer', 'Iron',
  'Jott', 'Kale', 'Lock', 'Marsh', 'Nail', 'Oat', 'Pine', 'Quern', 'Ringer',
  'Slate', 'Thorn', 'Under', 'Verg', 'Wick', 'Yare',
];

export const OWNER_DESCRIPTORS = [
  'wiry, with hands stained from their craft and a habit of speaking to themselves',
  'broad-shouldered and patient, with a steady gaze and a slight stammer',
  'sharp-eyed, methodical, and slow to extend trust',
  'cheerful at the counter and ruthless at the ledger',
  'middle-aged, freckled, and missing two fingers on the left hand',
  'quiet, well-read, and unhurried even when the shop is crowded',
  'gaunt and watchful, with an old scar tracing the line of their jaw',
  'apprenticed late in life, eager to prove competence',
  'a former soldier; keeps a polished blade behind the counter and does not need to draw it',
  'short, broad, plain-spoken, and disinclined to haggle',
];

// Owner trait shorthand keyed off shop archetype, for the AI enhance prompt.
export const OWNER_KIND_BY_SHOP: Record<ShopType, string> = {
  'general store': 'a steady, plain-spoken merchant',
  smith: 'a barrel-chested smith with soot under their nails',
  alchemist: 'a careful, ink-stained alchemist',
  fletcher: 'a long-fingered fletcher with calluses from drawing bowstrings',
  herbalist: 'a soft-voiced herbalist who smells faintly of green tea and crushed mint',
  scribe: 'a stooped scribe with ink at the cuffs',
  tailor: 'a meticulous tailor whose own clothes are slightly out of fashion',
  stable: 'a stout, weatherbeaten ostler',
};

export type MagicShopArchetype = 'curio shop' | 'hedge wizard' | 'black market' | 'temple';

export const MAGIC_SHOP_NAME_PARTS: Record<MagicShopArchetype, { prefix: readonly string[]; suffix: readonly string[] }> = {
  'curio shop': {
    prefix: ['The Wandering', 'The Bell-Jar', 'The Inverted', 'The Quiet', 'The Borrowed', 'The Patient'],
    suffix: ['Curio', 'Cabinet', 'Vitrine', 'Reliquary', 'Shelf', 'Drawer'],
  },
  'hedge wizard': {
    prefix: ['The Crooked', 'The Threshold', 'The Far-Field', 'The Bramble', 'The Salt-Marsh'],
    suffix: ['Charm', 'Hex', 'Knot', 'Ward', 'Sigil', 'Lantern'],
  },
  'black market': {
    prefix: ['The Tin-Roof', 'The Folded', 'The After-Hour', 'The Inside-Door', 'The Coin-Bitten'],
    suffix: ['Stall', 'Crate', 'Pocket', 'Sleeve', 'Marker', 'Tally'],
  },
  temple: {
    prefix: ['The Lesser', 'The Outer', 'The Mended', 'The Wayfarer\'s', 'The Lamp-Lit', 'The Last'],
    suffix: ['Chapel', 'Vestry', 'Cloister', 'Altar', 'Pilgrim', 'Vow'],
  },
};

// Per-archetype price multiplier on magic items (relative to a baseline of
// 1 for "fair-market temple offering").
export const MAGIC_PRICE_MULT: Record<MagicShopArchetype, number> = {
  'curio shop': 1.2,
  'hedge wizard': 1.5,
  'black market': 0.85,
  temple: 1.0,
};

// Per-rarity baseline market prices in gp. ORIGINAL ranges; not from any
// non-SRD published source.
export const MAGIC_PRICE_GP: Record<'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary', { min: number; max: number }> = {
  common:     { min: 50,    max: 250 },
  uncommon:   { min: 250,   max: 1500 },
  rare:       { min: 1500,  max: 12000 },
  'very rare':{ min: 12000, max: 50000 },
  legendary:  { min: 50000, max: 250000 },
};

// Settlement-size scarcity matrix for magic items: max rarity stocked.
export const MAGIC_SIZE_SCARCITY: Record<SettlementSizeClass, 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary'> = {
  thorp: 'common',
  hamlet: 'common',
  village: 'uncommon',
  town: 'rare',
  'small city': 'rare',
  'large city': 'very rare',
  metropolis: 'legendary',
};
