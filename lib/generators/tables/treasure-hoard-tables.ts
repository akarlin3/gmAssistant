// Treasure Hoard tables — ORIGINAL CONTENT.
//
// Source / licensing: SRD 5.1 (CC-BY-4.0) does NOT include the DMG treasure
// hoard tables verbatim. This file is original work authored for this
// project. The structure (CR-tiered coin scaling, gem value bands, art
// objects, magic item bands by rarity) follows conventions widely shared
// across CC-licensed and ORC-licensed tabletop SRDs, but every entry, every
// dice expression, and every multiplier is original — nothing was copied
// from any non-SRD source.
//
// Tier definitions:
//   "0-4"   — apprentice tier (party levels 1–4)
//   "5-10"  — journeyman tier (5–10)
//   "11-16" — master tier (11–16)
//   "17+"   — legendary tier (17–20)
//
// Hoard types:
//   "Individual Treasure" — coins only, smaller scale
//   "Treasure Hoard"      — coins + gems/art + magic items, larger scale

import type { ItemCategory, ItemRarity } from '../types';

export type CrTier = '0-4' | '5-10' | '11-16' | '17+';
export type HoardType = 'Individual Treasure' | 'Treasure Hoard';

// Coin yields: each tier defines a multiplier and dice expression per coin
// type. Expressed as { dice: 'NdS', multiplier: number }. Multiplier scales
// the final sum.
export type CoinFormula = { dice: string; multiplier: number };

export const COIN_TABLES: Record<HoardType, Record<CrTier, Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', CoinFormula>>>> = {
  'Individual Treasure': {
    '0-4':   { cp: { dice: '5d6', multiplier: 1 }, sp: { dice: '4d6', multiplier: 1 }, gp: { dice: '3d6', multiplier: 1 } },
    '5-10':  { sp: { dice: '4d6', multiplier: 10 }, gp: { dice: '2d6', multiplier: 10 }, pp: { dice: '1d4', multiplier: 1 } },
    '11-16': { gp: { dice: '4d6', multiplier: 10 }, pp: { dice: '2d6', multiplier: 1 } },
    '17+':   { gp: { dice: '6d6', multiplier: 100 }, pp: { dice: '4d6', multiplier: 10 } },
  },
  'Treasure Hoard': {
    '0-4':   { cp: { dice: '6d6', multiplier: 1 }, sp: { dice: '3d6', multiplier: 10 }, gp: { dice: '2d6', multiplier: 10 } },
    '5-10':  { cp: { dice: '2d6', multiplier: 100 }, sp: { dice: '2d6', multiplier: 100 }, gp: { dice: '6d6', multiplier: 10 }, pp: { dice: '3d6', multiplier: 1 } },
    '11-16': { gp: { dice: '4d6', multiplier: 100 }, pp: { dice: '5d6', multiplier: 10 } },
    '17+':   { gp: { dice: '12d6', multiplier: 100 }, pp: { dice: '8d6', multiplier: 10 } },
  },
};

// Gem and art tables (originals — named generically so users feel free to
// rename / theme them per campaign).
export const GEM_BANDS: Record<CrTier, { value: number; names: string[] }[]> = {
  '0-4': [
    { value: 10, names: ['azurite chip', 'banded agate', 'blue quartz', 'eye agate', 'hematite cabochon', 'lapis lazuli bead', 'malachite shard', 'moss agate', 'obsidian flake', 'tiger eye'] },
    { value: 50, names: ['bloodstone', 'carnelian', 'chalcedony bead', 'chrysoprase', 'citrine', 'jasper', 'moonstone fragment', 'onyx button', 'rose quartz cabochon', 'zircon'] },
  ],
  '5-10': [
    { value: 50, names: ['carnelian heart', 'jasper inlay', 'moonstone disc', 'onyx tile', 'zircon pendant', 'rose quartz egg'] },
    { value: 100, names: ['alexandrite', 'aquamarine bead', 'black pearl', 'green tourmaline', 'peridot', 'topaz cabochon', 'violet garnet'] },
    { value: 500, names: ['amethyst geode shard', 'chrysoberyl', 'coral cluster', 'jade figure', 'jet ring', 'spinel'] },
  ],
  '11-16': [
    { value: 100, names: ['amethyst heart', 'jet brooch', 'peridot ring', 'spinel chip'] },
    { value: 500, names: ['amber bead', 'amethyst geode', 'chrysoberyl pendant', 'coral fan', 'garnet rosette', 'jade tablet', 'pearl strand', 'tourmaline'] },
    { value: 1000, names: ['black opal', 'blue sapphire', 'emerald cabochon', 'fire opal', 'opal egg', 'sapphire'] },
  ],
  '17+': [
    { value: 500, names: ['amber ring', 'jade pendant', 'pearl rope', 'tourmaline tile'] },
    { value: 1000, names: ['blue sapphire', 'emerald bead', 'opal disc', 'sapphire shard'] },
    { value: 5000, names: ['black sapphire', 'diamond', 'jacinth', 'ruby of the deeps'] },
  ],
};

export const ART_BANDS: Record<CrTier, { value: number; names: string[] }[]> = {
  '0-4': [
    { value: 25, names: ['silver ewer', 'carved bone scrollcase', 'small gold locket', 'silvered drinking horn', 'enameled brass mirror', 'inlaid wooden box', 'polished copper plate'] },
  ],
  '5-10': [
    { value: 250, names: ['gold mask of a forgotten hero', 'jeweled clasp', 'silver chalice with ruby inlay', 'enameled hawk statuette', 'ivory diptych', 'silk tapestry of a stag hunt', 'gilded reliquary'] },
    { value: 750, names: ['gold ceremonial dagger', 'crystal sphere on bronze tripod', 'silver crown of a minor lord', 'pearl-tipped fan'] },
  ],
  '11-16': [
    { value: 750, names: ['silver coronet of a minor princess', 'gold-leafed atlas', 'ivory throne fragment', 'jeweled letter opener'] },
    { value: 2500, names: ['gold dragon statuette', 'platinum ring of a slain king', 'silver harp with garnet strings', 'jeweled funerary mask'] },
  ],
  '17+': [
    { value: 2500, names: ['gold throne plate', 'platinum coronet', 'silver effigy of a saint', 'jeweled war horn'] },
    { value: 7500, names: ['platinum statuette of a god', 'ruby-set crown of a dead empire', 'gilded altarpiece studded with diamonds', 'jade dragon larger than a child'] },
  ],
};

// Magic items per rarity tier. ORIGINAL names with light category tagging.
export type MagicItemEntry = { name: string; rarity: ItemRarity; category: ItemCategory; note?: string };

export const MAGIC_ITEMS: Record<Exclude<ItemRarity, 'mundane'>, MagicItemEntry[]> = {
  common: [
    { name: 'Candle of the Quiet Hour', rarity: 'common', category: 'wondrous', note: 'A wax taper that burns blue and silences soft sounds within ten feet.' },
    { name: 'Compass of Lost Things', rarity: 'common', category: 'wondrous', note: 'Needle points to an object the bearer named that morning, if within a mile.' },
    { name: 'Mug of the Drowning Sip', rarity: 'common', category: 'wondrous', note: 'Fills with clean water each dawn.' },
    { name: 'Pin of the Mended Cloak', rarity: 'common', category: 'wondrous', note: 'Repairs one tear or scuff per day in cloth or leather.' },
    { name: 'Lantern of Memory', rarity: 'common', category: 'wondrous', note: 'Burns without fuel; shows shadows of those who held it last.' },
    { name: 'Scroll of Polite Greeting', rarity: 'common', category: 'scroll', note: 'Casts the spell of formal greeting in twelve known dialects.' },
    { name: 'Bracelet of Soft Landing', rarity: 'common', category: 'wondrous', note: 'Once per day, halves falling damage when the wearer braces.' },
    { name: 'Pipe of Counting Smoke', rarity: 'common', category: 'wondrous', note: 'Smoke rings form numerals that count up to a hundred.' },
    { name: 'Quill of the Bound Promise', rarity: 'common', category: 'wondrous', note: 'A signature made with this quill cannot be later denied by the signer.' },
    { name: 'Ribbon of Strait Truth', rarity: 'common', category: 'wondrous', note: 'When tied around a wrist, the wearer cannot speak in untruths without effort.' },
  ],
  uncommon: [
    { name: 'Boots of the Heron Step', rarity: 'uncommon', category: 'wondrous', note: 'Long strides across rooftops or shallow water leave no print for a heartbeat.' },
    { name: 'Cloak of the Hollow Wind', rarity: 'uncommon', category: 'wondrous', note: 'Once per dawn, the wearer slips one breath out of view.' },
    { name: 'Ring of the Lender\'s Tongue', rarity: 'uncommon', category: 'ring', note: 'Allows comprehension of one chosen language for an hour each day.' },
    { name: 'Wand of Borrowed Sparks', rarity: 'uncommon', category: 'wand', note: 'Channels small lightning to inanimate targets — five charges, regains 1d4 at dawn.' },
    { name: 'Potion of the Even Pulse', rarity: 'uncommon', category: 'potion', note: 'Steadies a panicked or charmed mind for ten minutes.' },
    { name: 'Amulet of the Reading Mirror', rarity: 'uncommon', category: 'wondrous', note: 'Shows the reflection of any nearby written word, even if hidden.' },
    { name: 'Buckler of the Patient Defense', rarity: 'uncommon', category: 'armor', note: 'Once per short rest, raises to block a single hostile spell aimed at the bearer.' },
    { name: 'Dagger of the Quiet Step', rarity: 'uncommon', category: 'weapon', note: 'Strikes that miss leave no sound.' },
    { name: 'Censer of the Bound Spirit', rarity: 'uncommon', category: 'wondrous', note: 'Smoke from this censer reveals invisible passages in a hallway for one minute.' },
    { name: 'Spectacles of the Reading Sun', rarity: 'uncommon', category: 'wondrous', note: 'Allow the wearer to read in any light, including starlight.' },
    { name: 'Vial of the Last Word', rarity: 'uncommon', category: 'potion', note: 'Drunk after a death, lets the corpse speak one short answer.' },
    { name: 'Tome of the Indexed Wilderness', rarity: 'uncommon', category: 'wondrous', note: 'Self-updates with the bearer\'s recent travels; +2 to wilderness recall.' },
  ],
  rare: [
    { name: 'Crown of the Listening Court', rarity: 'rare', category: 'wondrous', note: 'The wearer hears the truthful intent behind any oath spoken in their presence.' },
    { name: 'Greatsword of the Riverbed', rarity: 'rare', category: 'weapon', note: 'Drinks blood spilled on it; the blade darkens for each life it has cost.' },
    { name: 'Mantle of the Tidewatcher', rarity: 'rare', category: 'wondrous', note: 'Grants water-breathing in salt water; the wearer dreams of tides they have never seen.' },
    { name: 'Ring of the Borrowed Hour', rarity: 'rare', category: 'ring', note: 'Once per dawn, the wearer may take a sixty-second action as if no time had passed.' },
    { name: 'Staff of the Quiet Wizard', rarity: 'rare', category: 'staff', note: 'Casts known spells without verbal components, but charges noticeably with each use.' },
    { name: 'Tome of the Falling Page', rarity: 'rare', category: 'wondrous', note: 'A new page appears each midnight; the words foretell a small event of the coming day.' },
    { name: 'Mask of the Borrowed Face', rarity: 'rare', category: 'wondrous', note: 'Shows the wearer the face of any one person they have spoken with this week.' },
    { name: 'Bracers of the Counting Wind', rarity: 'rare', category: 'wondrous', note: 'Once a day, deflect a single projectile by raising the bearer\'s forearm.' },
    { name: 'Lantern of the Pilgrim\'s Road', rarity: 'rare', category: 'wondrous', note: 'Lights only when carried toward a destination the bearer has named aloud.' },
    { name: 'Shield of the Saved Sigil', rarity: 'rare', category: 'armor', note: 'Once per day, absorbs a single spell aimed at a comrade within ten feet of the bearer.' },
  ],
  'very rare': [
    { name: 'Bow of the Last Stand', rarity: 'very rare', category: 'weapon', note: 'On the day of the bearer\'s death, fires each arrow with unerring aim.' },
    { name: 'Censer of Forgotten Names', rarity: 'very rare', category: 'wondrous', note: 'Smoke spells out the true name of one nearby creature once per dawn.' },
    { name: 'Helm of the Storm-King', rarity: 'very rare', category: 'wondrous', note: 'Hair stands on end during a storm; bearer may call lightning down once per moon.' },
    { name: 'Ledger of the Sealed Debt', rarity: 'very rare', category: 'wondrous', note: 'Anyone whose name is written within feels compelled to repay a debt they have forgotten.' },
    { name: 'Robe of the Stitched Hour', rarity: 'very rare', category: 'wondrous', note: 'Each thread is a minute. The wearer may unstitch one thread to undo their last action.' },
    { name: 'Sword of the Bound Promise', rarity: 'very rare', category: 'weapon', note: 'Will not strike a creature to whom its bearer has made an oath, until the oath ends.' },
    { name: 'Ring of the Painted Door', rarity: 'very rare', category: 'ring', note: 'Once per dawn, draws a door on any wall through which the bearer may pass for one minute.' },
    { name: 'Tome of the Mended Throne', rarity: 'very rare', category: 'wondrous', note: 'When held by a dying ruler, names the next ruler in the bearer\'s own handwriting.' },
  ],
  legendary: [
    { name: 'Crown of the Drowned Empire', rarity: 'legendary', category: 'wondrous', note: 'Bestows the memory of every drowned monarch upon the wearer; salt water leaks from their eyes when worn.' },
    { name: 'Hourglass of the Unwritten Day', rarity: 'legendary', category: 'wondrous', note: 'When inverted, gives the bearer a single day no one else will remember.' },
    { name: 'Sceptre of the Last Verdict', rarity: 'legendary', category: 'wondrous', note: 'A verdict spoken while holding this sceptre becomes binding on any creature within sight.' },
    { name: 'Sword of the Cleaved Mountain', rarity: 'legendary', category: 'weapon', note: 'Once per moon, parts solid stone in front of the wielder to a depth of ten feet.' },
    { name: 'Tome of the Final Page', rarity: 'legendary', category: 'wondrous', note: 'The last entry is always the next true event in the bearer\'s life — written in their own hand.' },
  ],
};

// Magic-item bands per CR tier and hoard type — controls how many items, what
// rarity, and the chance any items appear at all.
export type MagicItemBand = {
  chance: number;      // 0–1, chance hoard contains any magic items
  count: { dice: string; min?: number; max?: number };
  rarityWeights: { [K in Exclude<ItemRarity, 'mundane'>]?: number };
};

export const MAGIC_ITEM_BANDS: Record<HoardType, Record<CrTier, MagicItemBand>> = {
  'Individual Treasure': {
    '0-4':   { chance: 0.0, count: { dice: '0d1' }, rarityWeights: {} },
    '5-10':  { chance: 0.0, count: { dice: '0d1' }, rarityWeights: {} },
    '11-16': { chance: 0.0, count: { dice: '0d1' }, rarityWeights: {} },
    '17+':   { chance: 0.0, count: { dice: '0d1' }, rarityWeights: {} },
  },
  'Treasure Hoard': {
    '0-4':   { chance: 0.45, count: { dice: '1d4', min: 1, max: 4 }, rarityWeights: { common: 8, uncommon: 3 } },
    '5-10':  { chance: 0.70, count: { dice: '1d4+1', min: 2, max: 5 }, rarityWeights: { common: 4, uncommon: 8, rare: 2 } },
    '11-16': { chance: 0.85, count: { dice: '1d6+1', min: 2, max: 7 }, rarityWeights: { uncommon: 3, rare: 7, 'very rare': 3 } },
    '17+':   { chance: 0.95, count: { dice: '2d4', min: 2, max: 8 }, rarityWeights: { rare: 4, 'very rare': 7, legendary: 2 } },
  },
};

// Gem/art count bands — uniform 0..N picks per band per tier per hoard type.
export const GEM_COUNT: Record<HoardType, Record<CrTier, { dice: string }>> = {
  'Individual Treasure': { '0-4': { dice: '0d1' }, '5-10': { dice: '0d1' }, '11-16': { dice: '0d1' }, '17+': { dice: '0d1' } },
  'Treasure Hoard':      { '0-4': { dice: '1d4' }, '5-10': { dice: '1d6' }, '11-16': { dice: '1d6+1' }, '17+': { dice: '2d4' } },
};

export const ART_COUNT: Record<HoardType, Record<CrTier, { dice: string }>> = {
  'Individual Treasure': { '0-4': { dice: '0d1' }, '5-10': { dice: '0d1' }, '11-16': { dice: '0d1' }, '17+': { dice: '0d1' } },
  'Treasure Hoard':      { '0-4': { dice: '1d4' }, '5-10': { dice: '1d4' }, '11-16': { dice: '1d6' }, '17+': { dice: '1d6+1' } },
};
