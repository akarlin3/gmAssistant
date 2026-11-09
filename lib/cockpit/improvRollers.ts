/**
 * Module 1 — Live Session Cockpit: Improv Panic Bar Rollers & Combat Helpers
 *
 * Rolls instant NPCs (name, voice/mannerism hook, motive, secret) or
 * self-contained weird encounters / custom item mechanics grounded in the
 * active Location's lighting, terrain tags, aspects, and factions.
 */

export interface ImprovNpcRoll {
  kind: 'npc';
  name: string;
  role: string;
  voiceAndMannerism: string;
  motive: string;
  secret: string;
  groundedIn: string;
}

export interface ImprovEncounterRoll {
  kind: 'encounter';
  title: string;
  sensoryBeat: string;
  mechanic: string;
  twist: string;
  groundedIn: string;
}

export interface ImprovItemRoll {
  kind: 'item';
  name: string;
  rarity: string;
  appearance: string;
  mechanic: string;
  curseOrSecret: string;
  groundedIn: string;
}

export type ImprovPanicRoll = ImprovNpcRoll | ImprovEncounterRoll | ImprovItemRoll;

export interface SceneGroundingContext {
  locationName?: string;
  locationType?: string;
  lighting?: string;
  terrainTags?: string[];
  aspects?: string[];
  factions?: string;
}

const FIRST_NAMES = [
  'Vaelen', 'Seraphine', 'Kaelen', 'Mireille', 'Tarek', 'Oswin', 'Lyra', 'Bram',
  'Isolde', 'Cassian', 'Nyx', 'Garrick', 'Soren', 'Vespera', 'Dorian', 'fen-born Orla',
];

const SURNAMES = [
  'Ashford', 'Vane', 'Blackwater', 'Thorne', 'Crowe', 'Mercer', 'Glass', 'Kestrel',
  'Ironwood', 'Voight', 'Sallow', 'Dusk', 'Harrow', 'Cinder', 'Rell', 'Sterling',
];

const VOICE_HOOKS = [
  'Raspy whisper; compulsively flips a notched brass coin between knuckles',
  'Clipped military cadence; never stands with their back to a doorway',
  'Warm, honeyed baritone; pauses to adjust spectacles with cracked lenses',
  'Breathless and rapid-fire; constantly checks a pocket watch that ticks backward',
  'Low gravelly drawl; smells faintly of ozone and wet parchment',
  'Overly formal courtly diction; taps three times on wood before speaking a name',
  'Husky contralto; traces old burn scars along their wrists when lying',
  'Dry, sardonic monotone; carries a ledger bound in salt-stained leather',
];

const MOTIVES = [
  'Collecting a blood-debt before the next faction clock ticks',
  'Looking for a discreet crew to smuggle a sealed reliquary out of the district',
  'Trying to erase their own name from a faction ledger before dawn',
  'Searching for an informant who vanished here two nights ago',
  'Selling forged safe-conduct passes to the highest bidder',
  'Testing whether the party can be trusted with a dangerous faction secret',
];

const SECRETS = [
  'Secretly on the payroll of the rival faction and carrying their cipher key',
  'The item they guard is a decoy; they hid the real one beneath the scene',
  'They witnessed the last major faction incident and are being hunted for it',
  'Bound by a geas that triggers if they speak their employer’s true name',
  'Carries a stolen key that opens the sealed vault beneath this location',
  'They are the disgraced heir of the local authority operating incognito',
];

const ENCOUNTER_TEMPLATES = [
  {
    prefix: 'Unstable Resonance',
    beat: 'A sudden pressure drop extinguishes open flames for one heartbeat while whispers echo off the walls.',
    mechanic: 'At initiative count 20 (losing ties), each creature near the terrain feature must succeed on a DC 13 Wisdom or Dexterity save or be pushed 10 ft. and grant advantage on the next attack against it.',
    twist: 'The phenomenon is being intentionally siphoned by a hidden device; smashing or disarming it (AC 14, 18 HP, DC 14 Thieves’ Tools) ends the hazard and yields a charged arcane cell.',
  },
  {
    prefix: 'Ambush in the Shadows',
    beat: 'Loose debris shifts overhead just as a signal whistle cuts through the air.',
    mechanic: 'Hostile scouts use the terrain for three-quarters cover (+5 AC) and can Hide as a bonus action while in dim light or darkness.',
    twist: 'They are not here to kill the party—they are trying to delay them for 3 rounds while an operative extracts a package from the room.',
  },
  {
    prefix: 'Living Hazard Awakening',
    beat: 'The floor shudders as dormant wards or unnatural flora react to the party’s presence.',
    mechanic: '15-foot zones become difficult terrain. Ending a turn inside a zone deals 1d8 damage unless the character expends 5 ft. of movement to anchor themselves.',
    twist: 'A creature or NPC trapped at the center of the hazard offers a canon secret in exchange for immediate extraction.',
  },
];

const ITEM_PREFIXES = [
  'Lantern-Ward', 'Clockwork', 'Whisper-Forged', 'Cinder-Etched', 'Gloom-Touched', 'Wayfinder’s',
];

const ITEM_NOUNS = [
  'Signet Ring', 'Grappling Hook', 'Compass', 'Dagger', 'Vial', 'Lens', 'Cloak Clasp',
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function extractGroundingSummary(ctx: SceneGroundingContext): {
  locLabel: string;
  tagLabel: string;
  lightingLabel: string;
  factionLabel: string;
} {
  const locLabel = (ctx.locationName || '').trim() || 'the Current Scene';
  const tags = [
    ...(ctx.terrainTags || []).filter(Boolean),
    ...(ctx.aspects || []).filter(Boolean),
  ];
  const tagLabel = tags[0] || ctx.locationType || 'stone corridors';
  const lightingLabel = (ctx.lighting || '').trim() || 'Dim / Torchlight';
  const factionLabel = (ctx.factions || '').trim() || 'local faction operatives';
  return { locLabel, tagLabel, lightingLabel, factionLabel };
}

export function rollImprovNpc(
  ctx: SceneGroundingContext,
  rng: () => number = Math.random
): ImprovNpcRoll {
  const { locLabel, tagLabel, lightingLabel, factionLabel } = extractGroundingSummary(ctx);
  const name = `${pick(FIRST_NAMES, rng)} ${pick(SURNAMES, rng)}`;
  const voiceAndMannerism = `${pick(VOICE_HOOKS, rng)} (keeps glancing toward the ${tagLabel} in the ${lightingLabel.toLowerCase()}).`;
  const motive = `${pick(MOTIVES, rng)} at @${locLabel}.`;
  const secret = `||${pick(SECRETS, rng)} (linked to ${factionLabel}).||`;

  return {
    kind: 'npc',
    name,
    role: `Contact at ${locLabel}`,
    voiceAndMannerism,
    motive,
    secret,
    groundedIn: `${locLabel} · ${lightingLabel} · ${tagLabel}`,
  };
}

export function rollImprovEncounter(
  ctx: SceneGroundingContext,
  rng: () => number = Math.random
): ImprovEncounterRoll {
  const { locLabel, tagLabel, lightingLabel, factionLabel } = extractGroundingSummary(ctx);
  const tpl = pick(ENCOUNTER_TEMPLATES, rng);

  return {
    kind: 'encounter',
    title: `${tpl.prefix} at ${locLabel}`,
    sensoryBeat: `Under ${lightingLabel.toLowerCase()} near the ${tagLabel}: ${tpl.beat}`,
    mechanic: `Grounded in [${tagLabel} · ${lightingLabel}]: ${tpl.mechanic}`,
    twist: `||Connected to ${factionLabel}: ${tpl.twist}||`,
    groundedIn: `${locLabel} · ${lightingLabel} · ${tagLabel}`,
  };
}

export function rollImprovItem(
  ctx: SceneGroundingContext,
  rng: () => number = Math.random
): ImprovItemRoll {
  const { locLabel, tagLabel, lightingLabel, factionLabel } = extractGroundingSummary(ctx);
  const name = `${pick(ITEM_PREFIXES, rng)} ${pick(ITEM_NOUNS, rng)} of ${locLabel}`;

  return {
    kind: 'item',
    name,
    rarity: 'Uncommon',
    appearance: `Discovered near the ${tagLabel} of @${locLabel}, cool to the touch under ${lightingLabel.toLowerCase()}.`,
    mechanic: `Actionable +1 Mechanic: Grants +1 to ability checks or attack rolls while in ${lightingLabel.toLowerCase()} or interacting with ${tagLabel}. Once per short rest, activate as a bonus action to ignore difficult terrain or gain 10 temp HP for 1 minute.`,
    curseOrSecret: `||Forged by ${factionLabel}; activating it within 120 ft. of their agents causes the item to hum audibly.||`,
    groundedIn: `${locLabel} · ${lightingLabel} · ${tagLabel}`,
  };
}

/**
 * 5e Concentration Save DC = max(10, floor(damageTaken / 2))
 */
export function calculateConcentrationDc(damageTaken: number): number {
  const dmg = Math.max(0, Math.floor(damageTaken));
  return Math.max(10, Math.floor(dmg / 2));
}
