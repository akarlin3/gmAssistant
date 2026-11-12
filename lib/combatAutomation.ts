// Automated Tactical Combat, AoE Geometry, Distance Ruler & Save/Damage Loop.
//
// Powers:
//   1. Tactical Map Distance Ruler (`5ft/square` configurable)
//   2. Spell AoE Templates (`sphere`, `cone`, `cube`, `line`) & real-time token hit-testing
//   3. Automated Damage Application (`Full` / `Half` / `Zero`) respecting resistances,
//      immunities, and vulnerabilities from `evaluateCharacterSheet`, deducting `hp.temp`
//      first, and triggering Concentration Save prompts (`DC = max(10, floor(dmg / 2))`)
//   4. Targeted Save Prompts (`⚡ Roll DEX Save (DC 15 vs. Fireball)`) projected strictly
//      to owning `/player` slots with fail-closed slot-ownership enforcement.

import { evaluateCharacterSheet } from '@/lib/characterEvaluator';
import {
  appendRollEventRingBuffer,
  rollConcentrationCheck,
  rollSavingThrow,
  sanitizeRollEventsForOutbound,
} from '@/lib/diceRoller';
import { abilityMod, type Combatant } from '@/lib/initiative';
import type { MapTokenPin } from '@/lib/maps/types';
import type { PlayerMapTokenPin } from '@/lib/maps/playerProjection';
import type { SrdMonster } from '@/lib/srdCompendium';
import type {
  AbilityName,
  PlayerCharacter,
  RollEvent,
  RollMode,
} from '@/lib/pc/types';

export const STAGE_VIEWBOX_WIDTH = 1000;
export const STAGE_VIEWBOX_HEIGHT = 625;
export const STAGE_GRID_CELL_PX = 50;
export const STAGE_SQUARES_X = STAGE_VIEWBOX_WIDTH / STAGE_GRID_CELL_PX; // 20
export const STAGE_SQUARES_Y = STAGE_VIEWBOX_HEIGHT / STAGE_GRID_CELL_PX; // 12.5

export type DiagonalDistanceRule = '5e-chebyshev' | '5-10-5' | 'euclidean';

export interface DistanceMeasurement {
  squares: number;
  feet: number;
  dxSquares: number;
  dySquares: number;
  label: string;
}

/**
 * Measures grid distance between two normalized `[0, 1]` map coordinates.
 */
export function measureMapDistance(opts: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  gridFeetPerSquare?: number;
  diagonalRule?: DiagonalDistanceRule;
}): DistanceMeasurement {
  const feetPerSq =
    typeof opts.gridFeetPerSquare === 'number' && opts.gridFeetPerSquare > 0
      ? opts.gridFeetPerSquare
      : 5;
  const rule = opts.diagonalRule ?? '5e-chebyshev';

  const dxSquares = Math.round(Math.abs(opts.endX - opts.startX) * STAGE_SQUARES_X * 1e6) / 1e6;
  const dySquares = Math.round(Math.abs(opts.endY - opts.startY) * STAGE_SQUARES_Y * 1e6) / 1e6;

  let rawSquares: number;
  if (rule === 'euclidean') {
    rawSquares = Math.hypot(dxSquares, dySquares);
  } else if (rule === '5-10-5') {
    const diag = Math.min(dxSquares, dySquares);
    const straight = Math.max(dxSquares, dySquares) - diag;
    rawSquares = straight + Math.floor(diag * 1.5);
  } else {
    // Standard 5e grid rule: 1 square in any direction (Chebyshev)
    rawSquares = Math.max(dxSquares, dySquares);
  }

  const squares = Math.round(rawSquares * 2) / 2;
  const roundedWholeSquares = Math.round(rawSquares);
  const feet = roundedWholeSquares * feetPerSq;

  return {
    squares,
    feet,
    dxSquares,
    dySquares,
    label: `${feet} ft (${roundedWholeSquares} sq)`,
  };
}

// ---- AoE Templates & Real-Time Token Hit-Testing ---------------------------

export type AoeShape = 'sphere' | 'cube' | 'cone' | 'line';

export interface AoeTemplate {
  id: string;
  shape: AoeShape;
  label?: string;
  originX: number; // 0-1 normalized
  originY: number; // 0-1 normalized
  targetX: number; // 0-1 normalized (controls cone/line direction)
  targetY: number; // 0-1 normalized
  sizeFt: number; // radius for sphere, length for cone/line, side for cube
  lineWidthFt?: number; // default 5 ft
  color?: string;
  gridFeetPerSquare?: number;
}

export interface AoeSvgGeometry {
  kind: 'circle' | 'rect' | 'polygon';
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: string;
  originPx: { x: number; y: number };
  handlePx: { x: number; y: number };
}

/**
 * Computes SVG geometry in the `1000 x 625` stage viewBox for any `AoeTemplate`.
 */
export function buildAoeSvgGeometry(template: AoeTemplate): AoeSvgGeometry {
  const feetPerSq =
    typeof template.gridFeetPerSquare === 'number' && template.gridFeetPerSquare > 0
      ? template.gridFeetPerSquare
      : 5;
  const sizePx = (Math.max(5, template.sizeFt) / feetPerSq) * STAGE_GRID_CELL_PX;
  const ox = template.originX * STAGE_VIEWBOX_WIDTH;
  const oy = template.originY * STAGE_VIEWBOX_HEIGHT;
  const tx = template.targetX * STAGE_VIEWBOX_WIDTH;
  const ty = template.targetY * STAGE_VIEWBOX_HEIGHT;

  let dirX = tx - ox;
  let dirY = ty - oy;
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-3) {
    dirX = 1;
    dirY = 0;
  } else {
    dirX /= len;
    dirY /= len;
  }

  const handlePx = {
    x: ox + dirX * sizePx,
    y: oy + dirY * sizePx,
  };

  if (template.shape === 'sphere') {
    return {
      kind: 'circle',
      cx: ox,
      cy: oy,
      r: sizePx,
      originPx: { x: ox, y: oy },
      handlePx,
    };
  }

  if (template.shape === 'cube') {
    return {
      kind: 'rect',
      x: ox - sizePx / 2,
      y: oy - sizePx / 2,
      width: sizePx,
      height: sizePx,
      originPx: { x: ox, y: oy },
      handlePx: { x: ox + sizePx / 2, y: oy },
    };
  }

  if (template.shape === 'cone') {
    // Standard 5e cone: width at end equals its length (half-width = 0.5 * length)
    const perpX = -dirY;
    const perpY = dirX;
    const endCenterX = ox + dirX * sizePx;
    const endCenterY = oy + dirY * sizePx;
    const halfWidth = sizePx * 0.5;
    const p1 = `${ox.toFixed(1)},${oy.toFixed(1)}`;
    const p2 = `${(endCenterX + perpX * halfWidth).toFixed(1)},${(endCenterY + perpY * halfWidth).toFixed(1)}`;
    const p3 = `${(endCenterX - perpX * halfWidth).toFixed(1)},${(endCenterY - perpY * halfWidth).toFixed(1)}`;
    return {
      kind: 'polygon',
      points: `${p1} ${p2} ${p3}`,
      originPx: { x: ox, y: oy },
      handlePx,
    };
  }

  // Line template
  const widthFt = template.lineWidthFt && template.lineWidthFt > 0 ? template.lineWidthFt : 5;
  const halfWidthPx = ((widthFt / feetPerSq) * STAGE_GRID_CELL_PX) / 2;
  const perpX = -dirY;
  const perpY = dirX;
  const ex = ox + dirX * sizePx;
  const ey = oy + dirY * sizePx;
  const pts = [
    `${(ox + perpX * halfWidthPx).toFixed(1)},${(oy + perpY * halfWidthPx).toFixed(1)}`,
    `${(ex + perpX * halfWidthPx).toFixed(1)},${(ey + perpY * halfWidthPx).toFixed(1)}`,
    `${(ex - perpX * halfWidthPx).toFixed(1)},${(ey - perpY * halfWidthPx).toFixed(1)}`,
    `${(ox - perpX * halfWidthPx).toFixed(1)},${(oy - perpY * halfWidthPx).toFixed(1)}`,
  ].join(' ');

  return {
    kind: 'polygon',
    points: pts,
    originPx: { x: ox, y: oy },
    handlePx,
  };
}

/**
 * Returns the IDs of all map tokens intersected by an `AoeTemplate` in real time.
 */
export function computeTokensInAoe(
  template: AoeTemplate,
  tokens: ReadonlyArray<Pick<MapTokenPin | PlayerMapTokenPin, 'id' | 'x' | 'y' | 'size'>>,
): string[] {
  const feetPerSq =
    typeof template.gridFeetPerSquare === 'number' && template.gridFeetPerSquare > 0
      ? template.gridFeetPerSquare
      : 5;
  const sizeSq = Math.max(1, template.sizeFt / feetPerSq);

  const ox = template.originX * STAGE_SQUARES_X;
  const oy = template.originY * STAGE_SQUARES_Y;
  const tx = template.targetX * STAGE_SQUARES_X;
  const ty = template.targetY * STAGE_SQUARES_Y;

  let dirX = tx - ox;
  let dirY = ty - oy;
  const dLen = Math.hypot(dirX, dirY);
  if (dLen < 1e-4) {
    dirX = 1;
    dirY = 0;
  } else {
    dirX /= dLen;
    dirY /= dLen;
  }

  const hitIds: string[] = [];

  for (const tok of tokens) {
    const kx = tok.x * STAGE_SQUARES_X;
    const ky = tok.y * STAGE_SQUARES_Y;
    const tokRadiusSq = Math.max(0.35, ((tok.size || 1) * 0.42));

    const relX = kx - ox;
    const relY = ky - oy;
    const distSq = Math.hypot(relX, relY);

    if (template.shape === 'sphere') {
      if (distSq <= sizeSq + tokRadiusSq) {
        hitIds.push(tok.id);
      }
      continue;
    }

    if (template.shape === 'cube') {
      const halfSide = sizeSq / 2;
      if (
        Math.abs(relX) <= halfSide + tokRadiusSq &&
        Math.abs(relY) <= halfSide + tokRadiusSq
      ) {
        hitIds.push(tok.id);
      }
      continue;
    }

    const proj = relX * dirX + relY * dirY;
    const perp = Math.abs(relX * -dirY + relY * dirX);

    if (template.shape === 'cone') {
      if (proj >= -tokRadiusSq && proj <= sizeSq + tokRadiusSq) {
        const coneHalfWidthAtProj = Math.max(0, proj) * 0.5;
        if (perp <= coneHalfWidthAtProj + tokRadiusSq) {
          hitIds.push(tok.id);
        }
      }
      continue;
    }

    if (template.shape === 'line') {
      const lineWidthSq = ((template.lineWidthFt && template.lineWidthFt > 0 ? template.lineWidthFt : 5) / feetPerSq);
      const halfWidthSq = lineWidthSq / 2;
      if (
        proj >= -tokRadiusSq &&
        proj <= sizeSq + tokRadiusSq &&
        perp <= halfWidthSq + tokRadiusSq
      ) {
        hitIds.push(tok.id);
      }
    }
  }

  return hitIds;
}

// ---- Damage Calculation, Temp HP Deduction & Concentration Checks ----------

export type DamageOutcomeMode = 'full' | 'half' | 'zero';
export type DamageDefenseApplied = 'none' | 'resistant' | 'immune' | 'vulnerable';

export interface AutomatedDamageResult {
  rawDamage: number;
  outcomeMode: DamageOutcomeMode;
  afterOutcomeDamage: number;
  defenseApplied: DamageDefenseApplied;
  finalDamage: number;
  tempHpBefore: number;
  tempHpAfter: number;
  hpBefore: number;
  hpAfter: number;
  concentrationCheckRequired: boolean;
  concentrationSpell?: string;
  concentrationDc: number | null;
}

function matchesDamageTypeInList(damageType: string | undefined, list: ReadonlyArray<string> | undefined): boolean {
  if (!damageType || !Array.isArray(list) || list.length === 0) return false;
  const needle = damageType.trim().toLowerCase();
  if (!needle) return false;
  return list.some((entry) => {
    const hay = String(entry || '').trim().toLowerCase();
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });
}

export function computeAdjustedDamage(opts: {
  rawDamage: number;
  outcome: DamageOutcomeMode;
  damageType?: string;
  resistances?: ReadonlyArray<string>;
  immunities?: ReadonlyArray<string>;
  vulnerabilities?: ReadonlyArray<string>;
}): {
  afterOutcomeDamage: number;
  defenseApplied: DamageDefenseApplied;
  finalDamage: number;
} {
  const base = Math.max(0, Math.trunc(opts.rawDamage || 0));
  const afterOutcomeDamage =
    opts.outcome === 'zero' ? 0 : opts.outcome === 'half' ? Math.floor(base / 2) : base;

  if (afterOutcomeDamage === 0) {
    return { afterOutcomeDamage: 0, defenseApplied: 'none', finalDamage: 0 };
  }

  if (matchesDamageTypeInList(opts.damageType, opts.immunities)) {
    return { afterOutcomeDamage, defenseApplied: 'immune', finalDamage: 0 };
  }

  if (matchesDamageTypeInList(opts.damageType, opts.resistances)) {
    return {
      afterOutcomeDamage,
      defenseApplied: 'resistant',
      finalDamage: Math.floor(afterOutcomeDamage / 2),
    };
  }

  if (matchesDamageTypeInList(opts.damageType, opts.vulnerabilities)) {
    return {
      afterOutcomeDamage,
      defenseApplied: 'vulnerable',
      finalDamage: afterOutcomeDamage * 2,
    };
  }

  return {
    afterOutcomeDamage,
    defenseApplied: 'none',
    finalDamage: afterOutcomeDamage,
  };
}

/**
 * Applies `Full`, `Half`, or `Zero` damage to a `PlayerCharacter`:
 * - Reads resistances & immunities from `evaluateCharacterSheet(pc)`
 * - Deducts `hp.temp` FIRST, then `hp.current` (clamped `[0, hp.max]`)
 * - Automatically triggers Concentration Save DC (`max(10, floor(finalDamage / 2))`)
 *   when `pc.concentrationSpell` is active and `finalDamage > 0`.
 */
export function applyAutomatedDamageToPc(
  pc: PlayerCharacter,
  opts: {
    rawDamage: number;
    outcome: DamageOutcomeMode;
    damageType?: string;
  },
): { updatedPc: PlayerCharacter; result: AutomatedDamageResult } {
  const evaluated = evaluateCharacterSheet(pc);
  const profile = evaluated.evaluation?.defensiveProfile;
  const resistances = Array.from(
    new Set([...(pc.resistances ?? []), ...(profile?.resistances ?? [])]),
  );
  const immunities = Array.from(
    new Set([...(pc.immunities ?? []), ...(profile?.immunities ?? [])]),
  );

  const { afterOutcomeDamage, defenseApplied, finalDamage } = computeAdjustedDamage({
    rawDamage: opts.rawDamage,
    outcome: opts.outcome,
    damageType: opts.damageType,
    resistances,
    immunities,
  });

  const tempBefore = Math.max(0, Math.trunc(pc.hp?.temp ?? 0));
  const hpBefore = Math.max(0, Math.trunc(pc.hp?.current ?? 0));
  const hpMax = Math.max(1, Math.trunc(pc.hp?.max ?? 1));

  const tempAbsorbed = Math.min(tempBefore, finalDamage);
  const tempAfter = tempBefore - tempAbsorbed;
  const overflowToHp = finalDamage - tempAbsorbed;
  const hpAfter = Math.max(0, Math.min(hpMax, hpBefore - overflowToHp));

  const activeConc = (pc.concentrationSpell || '').trim();
  const concentrationCheckRequired = Boolean(activeConc) && finalDamage > 0;
  const concentrationDc = concentrationCheckRequired
    ? Math.max(10, Math.floor(finalDamage / 2))
    : null;

  const updatedPc: PlayerCharacter = {
    ...pc,
    hp: {
      current: hpAfter,
      max: hpMax,
      temp: tempAfter,
    },
    currentHp: hpAfter,
    tempHp: tempAfter,
    updatedAt: Date.now(),
  };

  return {
    updatedPc,
    result: {
      rawDamage: Math.max(0, Math.trunc(opts.rawDamage || 0)),
      outcomeMode: opts.outcome,
      afterOutcomeDamage,
      defenseApplied,
      finalDamage,
      tempHpBefore: tempBefore,
      tempHpAfter: tempAfter,
      hpBefore,
      hpAfter,
      concentrationCheckRequired,
      ...(activeConc ? { concentrationSpell: activeConc } : {}),
      concentrationDc,
    },
  };
}

/**
 * Applies `Full`, `Half`, or `Zero` damage to an encounter `Combatant` (monster/NPC),
 * respecting optional monster resistances/immunities/vulnerabilities and deducting `hp.temp` first.
 */
export function applyAutomatedDamageToCombatant(
  combatant: Combatant,
  opts: {
    rawDamage: number;
    outcome: DamageOutcomeMode;
    damageType?: string;
    monsterStatblock?: Pick<
      SrdMonster,
      'damageResistances' | 'damageImmunities' | 'damageVulnerabilities'
    >;
  },
): { updatedCombatant: Combatant; result: AutomatedDamageResult } {
  const { afterOutcomeDamage, defenseApplied, finalDamage } = computeAdjustedDamage({
    rawDamage: opts.rawDamage,
    outcome: opts.outcome,
    damageType: opts.damageType,
    resistances: opts.monsterStatblock?.damageResistances,
    immunities: opts.monsterStatblock?.damageImmunities,
    vulnerabilities: opts.monsterStatblock?.damageVulnerabilities,
  });

  const tempBefore = Math.max(0, Math.trunc(combatant.hp?.temp ?? 0));
  const hpBefore = Math.max(0, Math.trunc(combatant.hp?.current ?? 0));
  const hpMax = Math.max(1, Math.trunc(combatant.hp?.max ?? 1));

  const tempAbsorbed = Math.min(tempBefore, finalDamage);
  const tempAfter = tempBefore - tempAbsorbed;
  const overflowToHp = finalDamage - tempAbsorbed;
  const hpAfter = Math.max(0, Math.min(hpMax, hpBefore - overflowToHp));

  const activeConc =
    (combatant.concentrationSpell || '').trim() ||
    (combatant.conditions.includes('Concentrating') ? 'Concentration' : '');
  const concentrationCheckRequired = Boolean(activeConc) && finalDamage > 0;
  const concentrationDc = concentrationCheckRequired
    ? Math.max(10, Math.floor(finalDamage / 2))
    : null;

  const updatedCombatant: Combatant = {
    ...combatant,
    hp: {
      current: hpAfter,
      max: hpMax,
      temp: tempAfter,
    },
  };

  return {
    updatedCombatant,
    result: {
      rawDamage: Math.max(0, Math.trunc(opts.rawDamage || 0)),
      outcomeMode: opts.outcome,
      afterOutcomeDamage,
      defenseApplied,
      finalDamage,
      tempHpBefore: tempBefore,
      tempHpAfter: tempAfter,
      hpBefore,
      hpAfter,
      concentrationCheckRequired,
      ...(activeConc ? { concentrationSpell: activeConc } : {}),
      concentrationDc,
    },
  };
}

// ---- Targeted Save Prompts & Slot-Isolated Player Resolution ---------------

export interface SavePromptResolution {
  targetId: string;
  targetName: string;
  rollTotal?: number;
  passed?: boolean;
  outcomeMode: DamageOutcomeMode;
  finalDamage: number;
  resolvedAtMs: number;
}

export interface CombatSavePrompt {
  id: string;
  sourceName: string; // e.g., "Fireball"
  actorName?: string;
  ability: AbilityName; // e.g., "DEX"
  dc: number; // e.g., 15
  baseDamage: number;
  damageFormula?: string;
  damageType: string;
  halfOnSuccess: boolean;
  targetPcIds: string[];
  targetCombatantIds?: string[]; // GM-only monster targets; strictly stripped in projection
  gmNotes?: string; // GM-only notes; strictly stripped in projection
  resolutions?: Record<string, SavePromptResolution>;
  createdAtMs: number;
}

export interface ProjectedSavePrompt {
  id: string;
  targetPcId: string;
  targetPcName: string;
  bannerText: string; // e.g., "⚡ Roll DEX Save (DC 15 vs. Fireball)"
  sourceName: string;
  ability: AbilityName;
  dc: number;
  baseDamage: number;
  damageType: string;
  halfOnSuccess: boolean;
  createdAtMs: number;
  resolved: boolean;
  resolutionSummary?: string;
}

export function formatSavePromptBanner(prompt: {
  ability: AbilityName;
  dc: number;
  sourceName: string;
}): string {
  return `⚡ Roll ${prompt.ability} Save (DC ${prompt.dc} vs. ${prompt.sourceName})`;
}

export function createCombatSavePrompt(input: {
  id?: string;
  sourceName: string;
  actorName?: string;
  ability: AbilityName;
  dc: number;
  baseDamage: number;
  damageFormula?: string;
  damageType?: string;
  halfOnSuccess?: boolean;
  targetPcIds: string[];
  targetCombatantIds?: string[];
  gmNotes?: string;
  nowMs?: number;
}): CombatSavePrompt {
  const now = input.nowMs ?? Date.now();
  const id =
    input.id ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `save-${crypto.randomUUID().slice(0, 8)}`
      : `save-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`);

  return {
    id,
    sourceName: (input.sourceName || 'Effect').trim(),
    ...(input.actorName ? { actorName: input.actorName } : {}),
    ability: input.ability,
    dc: Math.max(1, Math.min(40, Math.trunc(input.dc || 10))),
    baseDamage: Math.max(0, Math.trunc(input.baseDamage || 0)),
    ...(input.damageFormula ? { damageFormula: input.damageFormula } : {}),
    damageType: (input.damageType || 'magical').trim().toLowerCase(),
    halfOnSuccess: input.halfOnSuccess ?? true,
    targetPcIds: Array.from(new Set(input.targetPcIds.filter(Boolean))),
    ...(input.targetCombatantIds && input.targetCombatantIds.length > 0
      ? { targetCombatantIds: Array.from(new Set(input.targetCombatantIds.filter(Boolean))) }
      : {}),
    ...(input.gmNotes ? { gmNotes: input.gmNotes } : {}),
    resolutions: {},
    createdAtMs: now,
  };
}

export function makeSavePromptRollTag(promptId: string, pcId: string): string {
  return `[Save:${promptId}:${pcId}]`;
}

/**
 * Projects ONLY save prompts targeting a PC owned by `slotId`.
 * Strips `targetCombatantIds`, other players' `targetPcIds`, and `gmNotes`.
 */
export function projectSavePromptsForSlot(
  data: Record<string, unknown>,
  slotId: string,
): ProjectedSavePrompt[] {
  const rawPrompts = (data as any).combatSavePrompts;
  if (!Array.isArray(rawPrompts) || rawPrompts.length === 0 || !slotId) return [];

  const pcsArr: Array<Record<string, any>> = Array.isArray((data as any).pcs)
    ? (data as any).pcs
    : [];
  const ownedPcs = pcsArr.filter((pc) => {
    if (!pc || typeof pc !== 'object' || typeof pc.id !== 'string') return false;
    const own = pc.ownership as { ownerType?: string; playerSlotId?: string } | undefined;
    return own?.ownerType === 'player' && own.playerSlotId === slotId;
  });

  if (ownedPcs.length === 0) return [];
  const ownedById = new Map(ownedPcs.map((p) => [String(p.id), p]));

  const out: ProjectedSavePrompt[] = [];

  for (const raw of rawPrompts as ReadonlyArray<CombatSavePrompt>) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') continue;
    const targets = Array.isArray(raw.targetPcIds) ? raw.targetPcIds : [];
    for (const pcId of targets) {
      const pc = ownedById.get(pcId);
      if (!pc) continue;

      const explicitRes = raw.resolutions?.[pcId];
      const tag = makeSavePromptRollTag(raw.id, pcId);
      const pcRolls: RollEvent[] = Array.isArray(pc.rollEvents) ? pc.rollEvents : [];
      const matchingRoll = pcRolls.find(
        (r) => r && typeof r.label === 'string' && r.label.includes(tag),
      );

      const resolved = Boolean(explicitRes || matchingRoll);
      let resolutionSummary: string | undefined;
      if (explicitRes) {
        resolutionSummary =
          explicitRes.rollTotal !== undefined
            ? `Rolled ${explicitRes.rollTotal} (${explicitRes.passed ? 'Saved' : 'Failed'}) · Took ${explicitRes.finalDamage} dmg`
            : `Applied ${explicitRes.outcomeMode} damage (${explicitRes.finalDamage} dmg)`;
      } else if (matchingRoll) {
        const passed = matchingRoll.total >= raw.dc;
        resolutionSummary = `Rolled ${matchingRoll.total} (${passed ? 'Saved' : 'Failed'})`;
      }

      const ability = raw.ability || 'DEX';
      const dc = typeof raw.dc === 'number' ? raw.dc : 10;
      const sourceName = String(raw.sourceName || 'Effect');

      out.push({
        id: raw.id,
        targetPcId: pcId,
        targetPcName: String(pc.name || 'Hero'),
        bannerText: formatSavePromptBanner({ ability, dc, sourceName }),
        sourceName,
        ability,
        dc,
        baseDamage: typeof raw.baseDamage === 'number' ? raw.baseDamage : 0,
        damageType: String(raw.damageType || 'magical'),
        halfOnSuccess: Boolean(raw.halfOnSuccess),
        createdAtMs: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : 0,
        resolved,
        ...(resolutionSummary ? { resolutionSummary } : {}),
      });
    }
  }

  return out;
}

export type PlayerSaveResolutionOutcome =
  | {
      ok: true;
      updatedPc: PlayerCharacter;
      saveRoll: RollEvent | null;
      passed: boolean | null;
      damageResult: AutomatedDamageResult;
      concentrationRoll: RollEvent | null;
      /** Outbound updates strictly conforming to PLAYER_EDITABLE_FIELDS; secretRoll events never included. */
      writebackUpdates: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Resolves a save prompt for a player in `/player` or Standalone `Play`.
 *
 * SECURITY INVARIANT:
 * - Strictly enforces `pc.ownership?.ownerType === 'player' && pc.ownership.playerSlotId === resolverSlotId`
 *   whenever `resolverSlotId` is provided (live `/player` mode). Cross-slot attempts fail closed!
 * - `secretRoll: true` rolls are NEVER added to `writebackUpdates.rollEvents`.
 */
export function resolveSavePromptForPlayer(opts: {
  prompt: Pick<
    CombatSavePrompt,
    'id' | 'sourceName' | 'ability' | 'dc' | 'baseDamage' | 'damageType' | 'halfOnSuccess'
  > & { targetPcIds?: string[] };
  pc: PlayerCharacter;
  /** Required in live `/player` mode; verifies slot owns `pc`. Pass `null` ONLY in local Standalone Play. */
  resolverSlotId: string | null;
  /** Optional 1-tap manual override ('full' | 'half' | 'zero') without rolling a new save. */
  overrideOutcome?: DamageOutcomeMode;
  autoRollConcentration?: boolean;
  rollMode?: RollMode;
  secretRoll?: boolean;
  rng?: () => number;
  now?: number;
}): PlayerSaveResolutionOutcome {
  const { prompt, pc, resolverSlotId } = opts;

  if (resolverSlotId !== null) {
    if (
      !resolverSlotId ||
      pc.ownership?.ownerType !== 'player' ||
      pc.ownership.playerSlotId !== resolverSlotId
    ) {
      return {
        ok: false,
        error: 'Forbidden: player slot may only resolve saving throws and HP for its owned PC.',
      };
    }
  }

  if (Array.isArray(prompt.targetPcIds) && !prompt.targetPcIds.includes(pc.id)) {
    return {
      ok: false,
      error: 'Forbidden: PC is not a target of this saving throw prompt.',
    };
  }

  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? Date.now();
  const isSecret = opts.secretRoll === true;

  let saveRoll: RollEvent | null = null;
  let passed: boolean | null = null;
  let outcomeMode: DamageOutcomeMode;

  if (opts.overrideOutcome) {
    outcomeMode = opts.overrideOutcome;
  } else {
    const rawRoll = rollSavingThrow(pc, prompt.ability, {
      rollMode: opts.rollMode,
      secretRoll: isSecret,
      rng,
      now,
    });
    const tag = makeSavePromptRollTag(prompt.id, pc.id);
    saveRoll = {
      ...rawRoll,
      label: `${prompt.ability} Save vs. ${prompt.sourceName} (DC ${prompt.dc}) ${tag}`,
    };
    passed = saveRoll.total >= prompt.dc;
    outcomeMode = passed ? (prompt.halfOnSuccess ? 'half' : 'zero') : 'full';
  }

  const { updatedPc: pcAfterDmg, result: damageResult } = applyAutomatedDamageToPc(pc, {
    rawDamage: prompt.baseDamage,
    outcome: outcomeMode,
    damageType: prompt.damageType,
  });

  let concentrationRoll: RollEvent | null = null;
  let finalPc = pcAfterDmg;

  if (damageResult.concentrationCheckRequired && opts.autoRollConcentration) {
    concentrationRoll = rollConcentrationCheck(finalPc, damageResult.finalDamage, {
      rollMode: opts.rollMode,
      secretRoll: isSecret,
      rng,
      now: now + 1,
    });
    if (
      damageResult.concentrationDc !== null &&
      concentrationRoll.total < damageResult.concentrationDc
    ) {
      finalPc = {
        ...finalPc,
        concentrationSpell: '',
      };
    }
  }

  let nextOutboundRolls = sanitizeRollEventsForOutbound(finalPc.rollEvents ?? []);
  if (!isSecret && saveRoll) {
    nextOutboundRolls = appendRollEventRingBuffer(nextOutboundRolls, saveRoll);
  }
  if (!isSecret && concentrationRoll) {
    nextOutboundRolls = appendRollEventRingBuffer(nextOutboundRolls, concentrationRoll);
  }

  finalPc = {
    ...finalPc,
    rollEvents: nextOutboundRolls,
  };

  const writebackUpdates: Record<string, unknown> = {
    'hp.current': finalPc.hp.current,
    'hp.temp': finalPc.hp.temp,
  };
  if (!isSecret && (saveRoll || concentrationRoll)) {
    writebackUpdates.rollEvents = nextOutboundRolls;
  }
  if (finalPc.concentrationSpell !== pc.concentrationSpell) {
    writebackUpdates.concentrationSpell = finalPc.concentrationSpell ?? '';
  }

  return {
    ok: true,
    updatedPc: finalPc,
    saveRoll,
    passed,
    damageResult,
    concentrationRoll,
    writebackUpdates,
  };
}

/**
 * Auto-rolls saving throws and applies Full/Half/Zero damage for GM-controlled monsters.
 */
export function autoRollMonsterSavePrompt(opts: {
  prompt: CombatSavePrompt;
  combatants: ReadonlyArray<Combatant>;
  monstersById?: Map<string, SrdMonster>;
  rng?: () => number;
  nowMs?: number;
}): {
  updatedCombatants: Combatant[];
  updatedPrompt: CombatSavePrompt;
  logLines: string[];
} {
  const rng = opts.rng ?? Math.random;
  const now = opts.nowMs ?? Date.now();
  const targetSet = new Set(opts.prompt.targetCombatantIds ?? []);
  const nextResolutions: Record<string, SavePromptResolution> = {
    ...(opts.prompt.resolutions ?? {}),
  };
  const logLines: string[] = [];

  const updatedCombatants = opts.combatants.map((c) => {
    if (!targetSet.has(c.id)) return c;
    const mon = c.sourceMonsterId ? opts.monstersById?.get(c.sourceMonsterId) : undefined;
    const explicitSave = mon?.saves?.[opts.prompt.ability];
    const saveMod =
      typeof explicitSave === 'number'
        ? explicitSave
        : abilityMod(mon?.abilities?.[opts.prompt.ability] ?? 10);

    const d20 = Math.floor(rng() * 20) + 1;
    const total = d20 + saveMod;
    const passed = total >= opts.prompt.dc;
    const outcomeMode: DamageOutcomeMode = passed
      ? opts.prompt.halfOnSuccess
        ? 'half'
        : 'zero'
      : 'full';

    const { updatedCombatant, result } = applyAutomatedDamageToCombatant(c, {
      rawDamage: opts.prompt.baseDamage,
      outcome: outcomeMode,
      damageType: opts.prompt.damageType,
      monsterStatblock: mon,
    });

    nextResolutions[c.id] = {
      targetId: c.id,
      targetName: c.name,
      rollTotal: total,
      passed,
      outcomeMode,
      finalDamage: result.finalDamage,
      resolvedAtMs: now,
    };

    logLines.push(
      `${c.name}: ${opts.prompt.ability} save ${total} vs DC ${opts.prompt.dc} (${passed ? 'Pass' : 'Fail'}) -> ${result.finalDamage} ${opts.prompt.damageType} dmg (HP ${result.hpAfter}/${updatedCombatant.hp.max})`,
    );

    return updatedCombatant;
  });

  return {
    updatedCombatants,
    updatedPrompt: {
      ...opts.prompt,
      resolutions: nextResolutions,
    },
    logLines,
  };
}
