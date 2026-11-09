/**
 * Module 4 — Lore-Grounded RAG Prep & Stat-Block Assistant
 *
 * Automatically extracts and injects the active JSON and Markdown context from
 * Modules 2 (Relational Lore Graph: selected Location, connected NPCs, Factions,
 * and Artifacts) and Module 3 (Faction Clocks, World Clock Day, and Session Delta Log)
 * so the GM can generate canon-accurate tavern rumors, session consequence deltas,
 * or balanced 5e/tabletop monster stat blocks and custom items in one click.
 */

import type { HomebrewMonster } from '@/components/monsters/types';
import { blankHomebrewMonster } from '@/components/monsters/format';
import { buildEntityIndex } from './wiki/entities';
import { extractAllMentions } from './wiki/mentions';
import { deriveClockStatus, readSessionDeltaLog } from './world/sessionDelta';
import { readWorldClock } from './world/types';

const CR_TABLE: Array<{
  label: string;
  value: number;
  ac: number;
  hpMin: number;
  hpMax: number;
  attack: number;
  dprMin: number;
  dprMax: number;
  dc: number;
}> = [
  { label: '0', value: 0, ac: 12, hpMin: 4, hpMax: 6, attack: 3, dprMin: 2, dprMax: 4, dc: 11 },
  { label: '1/8', value: 0.125, ac: 12, hpMin: 7, hpMax: 15, attack: 3, dprMin: 3, dprMax: 5, dc: 11 },
  { label: '1/4', value: 0.25, ac: 13, hpMin: 15, hpMax: 28, attack: 3, dprMin: 5, dprMax: 8, dc: 11 },
  { label: '1/2', value: 0.5, ac: 13, hpMin: 28, hpMax: 45, attack: 4, dprMin: 7, dprMax: 11, dc: 12 },
  { label: '1', value: 1, ac: 13, hpMin: 35, hpMax: 55, attack: 4, dprMin: 10, dprMax: 14, dc: 12 },
  { label: '2', value: 2, ac: 14, hpMin: 50, hpMax: 75, attack: 5, dprMin: 15, dprMax: 20, dc: 13 },
  { label: '3', value: 3, ac: 14, hpMin: 70, hpMax: 95, attack: 5, dprMin: 21, dprMax: 26, dc: 13 },
  { label: '4', value: 4, ac: 15, hpMin: 85, hpMax: 115, attack: 6, dprMin: 27, dprMax: 32, dc: 14 },
  { label: '5', value: 5, ac: 15, hpMin: 105, hpMax: 135, attack: 7, dprMin: 33, dprMax: 38, dc: 15 },
  { label: '6', value: 6, ac: 15, hpMin: 120, hpMax: 155, attack: 7, dprMin: 39, dprMax: 44, dc: 15 },
  { label: '7', value: 7, ac: 16, hpMin: 135, hpMax: 170, attack: 7, dprMin: 45, dprMax: 50, dc: 15 },
  { label: '8', value: 8, ac: 16, hpMin: 150, hpMax: 190, attack: 8, dprMin: 51, dprMax: 56, dc: 16 },
  { label: '10', value: 10, ac: 17, hpMin: 175, hpMax: 220, attack: 9, dprMin: 63, dprMax: 68, dc: 17 },
  { label: '12', value: 12, ac: 17, hpMin: 200, hpMax: 250, attack: 10, dprMin: 75, dprMax: 80, dc: 18 },
  { label: '15', value: 15, ac: 18, hpMin: 240, hpMax: 295, attack: 11, dprMin: 93, dprMax: 98, dc: 18 },
  { label: '18', value: 18, ac: 19, hpMin: 280, hpMax: 340, attack: 12, dprMin: 111, dprMax: 116, dc: 19 },
  { label: '20', value: 20, ac: 19, hpMin: 320, hpMax: 400, attack: 13, dprMin: 123, dprMax: 140, dc: 20 },
  { label: '25', value: 25, ac: 21, hpMin: 420, hpMax: 520, attack: 16, dprMin: 160, dprMax: 190, dc: 22 },
  { label: '30', value: 30, ac: 23, hpMin: 550, hpMax: 675, attack: 19, dprMin: 220, dprMax: 260, dc: 24 },
];

export type LoreRagMode = 'rumors' | 'deltas' | 'statblock' | 'item';

export interface LoreRagContextPayload {
  location: {
    id: string;
    name: string;
    type: string;
    lighting: string;
    terrainTags: string[];
    description: string;
    aspects: string[];
    factionsPresent: string;
  } | null;
  linkedNpcs: Array<{
    id: string;
    name: string;
    type: string;
    faction: string;
    archetype: string;
    goal: string;
    secretOrFlaw: string;
  }>;
  linkedFactions: Array<{
    id: string;
    name: string;
    archetype: string;
    identity: string;
    area: string;
    renown: number;
    heat: number;
    longGoal: string;
  }>;
  factionClocks: Array<{
    id: string;
    text: string;
    faction: string;
    filled: number;
    max: number;
    status: string;
    triggerNote: string;
  }>;
  worldState: {
    inWorldDay: number;
    recentDeltas: Array<{
      inWorldDate: string;
      consequences: [string, string, string];
    }>;
  };
}

export interface LoreRagBundle {
  jsonContext: LoreRagContextPayload;
  markdownContext: string;
  promptForMode: (mode: LoreRagMode, extraNotes?: string, targetCr?: string) => string;
}

export interface SynthesizedLoreRagResult {
  mode: LoreRagMode;
  markdown: string;
  rumors?: string[];
  consequenceDeltas?: {
    inWorldDate: string;
    consequences: [string, string, string];
    suggestedClockTick?: { clockText: string; faction: string; delta: number };
  };
  monster?: HomebrewMonster;
  customItem?: {
    name: string;
    rarity: string;
    description: string;
    mechanic: string;
    gmSpoiler: string;
  };
}

export function buildLoreRagContext(
  campaignData: Record<string, any> | undefined,
  options?: { selectedLocationId?: string }
): LoreRagBundle {
  const d = campaignData || {};
  const locations: any[] = Array.isArray(d.locations) ? d.locations : [];
  const npcs: any[] = Array.isArray(d.npcs) ? d.npcs : [];
  const factions: any[] = Array.isArray(d.factions) ? d.factions : [];
  const clocks: any[] = Array.isArray(d.clocks) ? d.clocks : [];
  const relationships: any[] = Array.isArray(d.wiki?.relationships) ? d.wiki.relationships : [];

  const targetLocId = options?.selectedLocationId || d.cockpitActiveLocationId || locations[0]?.id;
  const rawLoc =
    locations.find((l, idx) => (l?.id || `loc-${idx}`) === targetLocId) ||
    locations[0] ||
    null;

  const location = rawLoc
    ? {
        id: String(rawLoc.id || 'loc-0'),
        name: String(rawLoc.name || 'Unnamed Location').trim() || 'Unnamed Location',
        type: String(rawLoc.type || 'Landmark'),
        lighting: String(rawLoc.lighting || 'Dim / Torchlight'),
        terrainTags: Array.isArray(rawLoc.terrainTags)
          ? rawLoc.terrainTags.filter(Boolean)
          : [],
        description: String(rawLoc.description || ''),
        aspects: Array.isArray(rawLoc.aspects) ? rawLoc.aspects.filter(Boolean) : [],
        factionsPresent: String(rawLoc.factions || ''),
      }
    : null;

  const locMentions = new Set<string>();
  const entityIdx = buildEntityIndex(d);
  if (location) {
    const blob = [
      location.description,
      ...location.aspects,
      location.factionsPresent,
    ].join(' ');
    for (const m of extractAllMentions(blob, entityIdx)) {
      locMentions.add(m.name.toLowerCase());
    }
  }

  // Linked NPCs via Lore Graph relationships, @mentions, or fallback to top campaign NPCs
  const linkedNpcList = npcs.filter((n, idx) => {
    if (!n || !String(n.name || '').trim()) return false;
    if (!location) return idx < 4;
    const nid = String(n.id || `npc-${idx}`);
    const nNameLower = String(n.name).toLowerCase();
    const relMatch = relationships.some(
      (r) =>
        (r.from?.type === 'location' && r.from?.id === location.id && r.to?.type === 'npc' && r.to?.id === nid) ||
        (r.to?.type === 'location' && r.to?.id === location.id && r.from?.type === 'npc' && r.from?.id === nid) ||
        (r.fromType === 'location' && r.fromId === location.id && r.toType === 'npc' && r.toId === nid) ||
        (r.toType === 'location' && r.toId === location.id && r.fromType === 'npc' && r.fromId === nid)
    );
    const mentionMatch =
      locMentions.has(nNameLower) ||
      [n.archetype, n.goal, n.faction, n.bond].some((field) =>
        typeof field === 'string' && field.toLowerCase().includes(location.name.toLowerCase())
      );
    const factionOverlap =
      Boolean(n.faction && location.factionsPresent) &&
      location.factionsPresent.toLowerCase().includes(String(n.faction).replace(/^@/, '').toLowerCase());
    return relMatch || mentionMatch || factionOverlap;
  });

  const effectiveNpcs = (linkedNpcList.length > 0 ? linkedNpcList : npcs.slice(0, 4))
    .filter((n) => n && String(n.name || '').trim())
    .map((n, idx) => ({
      id: String(n.id || `npc-${idx}`),
      name: String(n.name).trim(),
      type: String(n.type || 'NPC'),
      faction: String(n.faction || ''),
      archetype: String(n.archetype || ''),
      goal: String(n.goal || ''),
      secretOrFlaw: String(n.flaw || ''),
    }));

  // Linked Factions
  const linkedFactionList = factions.filter((f, idx) => {
    if (!f || !String(f.name || '').trim()) return false;
    if (!location) return idx < 4;
    const fid = String(f.id || `fac-${idx}`);
    const fNameLower = String(f.name).toLowerCase();
    const relMatch = relationships.some(
      (r) =>
        (r.from?.type === 'location' && r.from?.id === location.id && r.to?.type === 'faction' && r.to?.id === fid) ||
        (r.to?.type === 'location' && r.to?.id === location.id && r.from?.type === 'faction' && r.from?.id === fid) ||
        (r.fromType === 'location' && r.fromId === location.id && r.toType === 'faction' && r.toId === fid) ||
        (r.toType === 'location' && r.toId === location.id && r.fromType === 'faction' && r.fromId === fid)
    );
    const areaMatch =
      (typeof f.area === 'string' && f.area.toLowerCase().includes(location.name.toLowerCase())) ||
      location.factionsPresent.toLowerCase().includes(fNameLower) ||
      locMentions.has(fNameLower);
    return relMatch || areaMatch;
  });

  const effectiveFactions = (linkedFactionList.length > 0 ? linkedFactionList : factions.slice(0, 4))
    .filter((f) => f && String(f.name || '').trim())
    .map((f, idx) => ({
      id: String(f.id || `fac-${idx}`),
      name: String(f.name).trim(),
      archetype: String(f.archetype || ''),
      identity: String(f.identity || ''),
      area: String(f.area || ''),
      renown: typeof f.renown === 'number' ? f.renown : 0,
      heat: typeof f.heat === 'number' ? f.heat : 0,
      longGoal: String(f.longGoal || ''),
    }));

  // Active Faction Clocks
  const factionClocks = clocks
    .filter((c) => c && (String(c.text || '').trim() || String(c.faction || '').trim()))
    .map((c, idx) => ({
      id: String(c.id || `clock-${idx}`),
      text: String(c.text || 'Unnamed Clock').trim(),
      faction: String(c.faction || 'Independent').trim(),
      filled: Number(c.filled) || 0,
      max: Number(c.max) || 6,
      status: deriveClockStatus(c),
      triggerNote: String(c.triggerNote || c.notes || '').trim(),
    }));

  const wc = readWorldClock(d);
  const deltaLog = readSessionDeltaLog(d).slice(0, 3);

  const jsonContext: LoreRagContextPayload = {
    location,
    linkedNpcs: effectiveNpcs,
    linkedFactions: effectiveFactions,
    factionClocks,
    worldState: {
      inWorldDay: wc.currentDay,
      recentDeltas: deltaLog.map((entry) => ({
        inWorldDate: entry.inWorldDate,
        consequences: entry.consequences,
      })),
    },
  };

  const mdLines: string[] = [
    `# LORE-GROUNDED RAG CONTEXT (Modules 2 & 3)`,
    `- **In-World Calendar**: Day ${wc.currentDay}`,
  ];

  if (location) {
    mdLines.push(
      `\n## Active Scene Location: @${location.name} (${location.type})`,
      `- **Lighting**: ${location.lighting}`,
      `- **Terrain / Hazard Tags**: ${location.terrainTags.length > 0 ? location.terrainTags.join(', ') : 'Standard terrain'}`,
      location.description ? `- **Description**: ${location.description}` : '',
      location.aspects.length > 0 ? `- **Aspects**: ${location.aspects.join(' | ')}` : '',
      location.factionsPresent ? `- **Factions Present**: ${location.factionsPresent}` : ''
    );
  }

  if (effectiveNpcs.length > 0) {
    mdLines.push(`\n## Linked NPCs (Module 2 Lore Graph)`);
    for (const n of effectiveNpcs) {
      mdLines.push(
        `- **@${n.name}** (${n.type}${n.faction ? ` · ${n.faction}` : ''}): ${n.archetype || 'No archetype'} | Goal: ${n.goal || 'Unknown'}${n.secretOrFlaw ? ` | Secret: ||${n.secretOrFlaw}||` : ''}`
      );
    }
  }

  if (effectiveFactions.length > 0) {
    mdLines.push(`\n## Linked Factions & Heat (Module 3)`);
    for (const f of effectiveFactions) {
      mdLines.push(
        `- **@${f.name}** (${f.archetype || 'Faction'} · Heat ${f.heat}/10 · Renown ${f.renown}): ${f.identity || ''} | Goal: ${f.longGoal || 'Unspecified'}`
      );
    }
  }

  if (factionClocks.length > 0) {
    mdLines.push(`\n## Active Faction Clocks (Module 3)`);
    for (const c of factionClocks) {
      mdLines.push(
        `- **[${c.filled}/${c.max} · ${c.status.toUpperCase()}] ${c.faction} — ${c.text}**${c.triggerNote ? ` (Trigger: ${c.triggerNote})` : ''}`
      );
    }
  }

  if (deltaLog.length > 0) {
    mdLines.push(`\n## Recent Session Delta Log`);
    for (const entry of deltaLog) {
      mdLines.push(`- **${entry.inWorldDate}**: ${entry.consequences.filter(Boolean).join(' ; ')}`);
    }
  }

  const markdownContext = mdLines.filter(Boolean).join('\n');

  const promptForMode = (mode: LoreRagMode, extraNotes = '', targetCr = '2'): string => {
    const taskInstructions: Record<LoreRagMode, string> = {
      rumors:
        'Generate 3 canon-accurate Tavern Rumors grounded directly in the Location, Linked NPCs, Factions, and Faction Clocks above. Use @EntityName tags for linked entities and wrap GM-only truths behind each rumor in ||GM spoiler|| blocks.',
      deltas:
        'Generate a Session Consequence Delta Entry with: (1) an evocative In-World Date, (2) exactly 3 punchy bullet consequences reflecting how the active Faction Clocks and Location state shift, and (3) recommended Faction Clock tick and Faction Heat adjustments.',
      statblock:
        `Generate a balanced 5e/tabletop Monster Stat Block (Target CR ${targetCr}) tailored to the Location's lighting/terrain tags and Faction Clocks. Include AC, HP, Hit Dice, Speed, STR/DEX/CON/INT/WIS/CHA, 2 Special Abilities grounded in the terrain, and 2 Actions.`,
      item:
        'Generate a canon-accurate Custom Magic Item / Artifact discovered at this Location. Include Name, Rarity, Sensory Description (with @EntityName links), an actionable "+1" tabletop Mechanic, and a ||GM spoiler|| secret.',
    };

    return [
      markdownContext,
      `\n## JSON Context Snapshot\n\`\`\`json\n${JSON.stringify(jsonContext, null, 2)}\n\`\`\``,
      `\n## Task Instruction (${mode.toUpperCase()})`,
      taskInstructions[mode],
      extraNotes.trim() ? `Additional GM Directive: ${extraNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  return { jsonContext, markdownContext, promptForMode };
}

/**
 * Deterministic/procedural Canon Synthesizer that generates immediate, lore-grounded
 * rumors, session consequence deltas, balanced 5e monster stat blocks, and custom items
 * using the active Module 2 & Module 3 context.
 */
export function synthesizeLoreRagOutput(
  bundle: LoreRagBundle,
  mode: LoreRagMode,
  options?: { targetCr?: string; customNotes?: string }
): SynthesizedLoreRagResult {
  const ctx = bundle.jsonContext;
  const locName = ctx.location?.name || 'the Crossroads';
  const locLighting = ctx.location?.lighting || 'Dim / Torchlight';
  const locTerrain =
    ctx.location?.terrainTags[0] ||
    ctx.location?.aspects[0] ||
    'broken flagstones';
  const primaryNpc = ctx.linkedNpcs[0]?.name || 'a hooded courier';
  const secondaryNpc = ctx.linkedNpcs[1]?.name || primaryNpc;
  const primaryFaction =
    ctx.linkedFactions[0]?.name ||
    ctx.factionClocks[0]?.faction?.replace(/^@/, '') ||
    'the Shadow Syndicate';
  const topClock = ctx.factionClocks[0] || {
    id: 'clock-0',
    text: 'Consolidate control over the district',
    faction: primaryFaction,
    filled: 2,
    max: 6,
    status: 'active',
    triggerNote: `@${primaryFaction} locks down @${locName}`,
  };
  const customDirective = options?.customNotes?.trim()
    ? ` (${options.customNotes.trim()})`
    : '';

  if (mode === 'rumors') {
    const r1 = `"Keep your voice low near @${locName}—agents of @${primaryFaction} have been moving crates under ${locLighting.toLowerCase()}." ||Truth: Clock "${topClock.text}" is at ${topClock.filled}/${topClock.max}; ${topClock.triggerNote || 'they are preparing a lockdown'}.||`;
    const r2 = `"@${primaryNpc} was seen arguing with a factor near the ${locTerrain} after midnight, offering silver for anyone who can bypass the wards." ||Truth: ${ctx.linkedNpcs[0]?.goal || `@${primaryNpc} is secretly leveraging the party against @${primaryFaction}`}${customDirective}.||`;
    const r3 = `"Nobody lingers by the ${locTerrain} in @${locName} once the lanterns gutter out—something beneath the stones answers the sound of drawn steel." ||Truth: A guardian tied to @${primaryFaction} patrols the ${locTerrain} and reacts to loud combat.||`;

    return {
      mode: 'rumors',
      rumors: [r1, r2, r3],
      markdown: [
        `### Canon-Grounded Tavern Rumors (@${locName})`,
        `1. ${r1}`,
        `2. ${r2}`,
        `3. ${r3}`,
      ].join('\n\n'),
    };
  }

  if (mode === 'deltas') {
    const nextDay = ctx.worldState.inWorldDay + 1;
    const inWorldDate = `Day ${nextDay} · Aftermath at ${locName}`;
    const c1 = `Tension escalates at @${locName} as @${primaryFaction} advances "${topClock.text}" (${Math.min(topClock.max, topClock.filled + 1)}/${topClock.max}).`;
    const c2 = `@${primaryNpc} repositions around the ${locTerrain}, altering access to @${locName}${customDirective}.`;
    const c3 =
      topClock.filled + 1 >= topClock.max
        ? `CLOCK TRIGGERED: ${topClock.triggerNote || `@${primaryFaction} completes its objective at @${locName}`}.`
        : `Patrols and lookouts adapt to the ${locLighting.toLowerCase()} conditions; faction heat rises by +1.`;

    return {
      mode: 'deltas',
      consequenceDeltas: {
        inWorldDate,
        consequences: [c1, c2, c3],
        suggestedClockTick: {
          clockText: topClock.text,
          faction: topClock.faction,
          delta: 1,
        },
      },
      markdown: [
        `### Session Consequence Delta (${inWorldDate})`,
        `- **Bullet 1**: ${c1}`,
        `- **Bullet 2**: ${c2}`,
        `- **Bullet 3**: ${c3}`,
        `- **Recommended Clock Advance**: ${topClock.faction} — *${topClock.text}* (+1 segment → ${Math.min(topClock.max, topClock.filled + 1)}/${topClock.max})`,
      ].join('\n'),
    };
  }

  if (mode === 'statblock') {
    const crLabel = options?.targetCr || '2';
    const crRow = CR_TABLE.find((r) => r.label === crLabel) || CR_TABLE.find((r) => r.label === '2')!;
    const base = blankHomebrewMonster();
    const monsterName = options?.customNotes?.trim()
      ? options.customNotes.trim()
      : `${locName} ${primaryFaction.replace(/^The\s+/i, '')} Enforcer`;

    const hp = Math.round((crRow.hpMin + crRow.hpMax) / 2);
    const ac = crRow.ac;
    const atk = crRow.attack;
    const dpr = Math.max(4, Math.round((crRow.dprMin + crRow.dprMax) / 2));
    const saveDc = crRow.dc;

    const monster: HomebrewMonster = {
      ...base,
      name: monsterName,
      size: crRow.value >= 5 ? 'Large' : 'Medium',
      type: 'humanoid',
      subtype: primaryFaction,
      alignment: 'lawful neutral',
      armor_class: ac,
      armor_desc: `fitted ${locTerrain} plate`,
      hit_points: hp,
      hit_dice: `${Math.max(2, Math.round(hp / 6.5))}d8+${Math.round(hp / 4)}`,
      speed: { walk: 30 },
      strength: crRow.value >= 4 ? 18 : 15,
      dexterity: 14,
      constitution: 14,
      intelligence: 12,
      wisdom: 13,
      charisma: 11,
      skills: { perception: 3 + Math.floor(crRow.value / 2), stealth: 4 },
      senses: `${locLighting.toLowerCase().includes('dark') ? 'darkvision 60 ft., ' : ''}passive Perception ${13 + Math.floor(crRow.value / 2)}`,
      languages: 'Common',
      challenge_rating: crRow.label,
      cr: crRow.value,
      is_boss: crRow.value >= 5,
      print_status: 'queued',
      special_abilities: [
        {
          name: `${locLighting} Adaptation`,
          desc: `While in ${locLighting.toLowerCase()} at @${locName}, the ${monsterName} has advantage on Wisdom (Perception) checks and Dexterity (Stealth) checks.`,
        },
        {
          name: `${primaryFaction} Clock Momentum`,
          desc: `Triggered by "${topClock.text}" (${topClock.filled}/${topClock.max}). When an ally within 30 ft. drops to 0 HP, the ${monsterName} can move up to half its speed without provoking opportunity attacks.`,
        },
      ],
      actions: [
        {
          name: 'Multiattack / Tactical Strike',
          desc: `Melee Weapon Attack: +${atk} to hit, reach 5 ft., one target. Hit: ${dpr} (2d6 + ${Math.max(2, Math.floor(dpr / 3))}) slashing damage.`,
        },
        {
          name: `${locTerrain} Hazard Sweep (Recharge 5–6)`,
          desc: `The ${monsterName} exploits the ${locTerrain} of @${locName}. Each creature in a 15-foot cone must make a DC ${saveDc} Dexterity saving throw, taking ${Math.max(6, Math.round(dpr * 1.2))} (3d6) bludgeoning damage and falling prone on a failed save, or half as much damage on a successful one.`,
        },
      ],
      desc: `Canon-grounded enforcer of @${primaryFaction} stationed at @${locName} (linked to @${primaryNpc}).`,
      source: 'Lore-Grounded RAG Assistant',
      homebrew: true,
    };

    return {
      mode: 'statblock',
      monster,
      markdown: [
        `### ${monster.name} (CR ${monster.challenge_rating})`,
        `*${monster.size} ${monster.type} (${monster.subtype}), ${monster.alignment}*`,
        `- **AC**: ${monster.armor_class} (${monster.armor_desc}) · **HP**: ${monster.hit_points} (${monster.hit_dice}) · **Speed**: 30 ft.`,
        `- **STR** ${monster.strength} · **DEX** ${monster.dexterity} · **CON** ${monster.constitution} · **INT** ${monster.intelligence} · **WIS** ${monster.wisdom} · **CHA** ${monster.charisma}`,
        `- **Traits**:`,
        ...monster.special_abilities.map((a) => `  - **${a.name}**: ${a.desc}`),
        `- **Actions**:`,
        ...monster.actions.map((a) => `  - **${a.name}**: ${a.desc}`),
      ].join('\n'),
    };
  }

  // mode === 'item'
  const itemName = options?.customNotes?.trim()
    ? options.customNotes.trim()
    : `Relic of ${locName}`;
  const description = `Forged for operatives of @${primaryFaction} working under ${locLighting.toLowerCase()} in @${locName}. Bears the sigil of @${secondaryNpc}.`;
  const mechanic = `Actionable +1 Hook: Grants +1 to checks or attacks made while standing in ${locTerrain} or ${locLighting.toLowerCase()}. Once per short rest, you can invoke its sigil to sense whether agents of @${primaryFaction} are within 300 feet.`;
  const gmSpoiler = `||If used while the clock "${topClock.text}" is at ${topClock.max}/${topClock.max}, @${primaryNpc} is alerted to the bearer's exact location.||`;

  return {
    mode: 'item',
    customItem: {
      name: itemName,
      rarity: 'Uncommon',
      description: `${description} ${mechanic} ${gmSpoiler}`,
      mechanic,
      gmSpoiler,
    },
    markdown: [
      `### ${itemName} *(Uncommon Wondrous Item)*`,
      `- **Lore**: ${description}`,
      `- **Mechanic**: ${mechanic}`,
      `- **GM Secret**: ${gmSpoiler}`,
    ].join('\n'),
  };
}
