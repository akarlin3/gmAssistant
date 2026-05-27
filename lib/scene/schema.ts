// Validation for the model's scene-turn JSON. The repo deliberately avoids a
// schema library on the AI routes (see lib/api/validate.ts), so this mirrors
// the Appendix-C Zod shape with hand-written, dependency-free checks. Errors
// are collected as readable strings so the turn route can feed them back to
// the model on a corrective retry.

import { ABILITIES, type Ability, type SceneTurnResponse, type SuggestedRoll } from './types';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const MAX_DIALOGUE = 10;
const MAX_LINE = 500;
const MAX_SENSORY = 1000;
const MAX_REASON = 200;
const MIN_DC = 5;
const MAX_DC = 30;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseSuggestedRoll(raw: unknown, errors: string[]): SuggestedRoll | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) {
    errors.push('suggestedRoll must be an object or null.');
    return null;
  }

  const ability = raw.ability;
  if (typeof ability !== 'string' || !(ABILITIES as readonly string[]).includes(ability)) {
    errors.push(`suggestedRoll.ability must be one of ${ABILITIES.join(', ')}.`);
  }

  let skill: string | null = null;
  if (raw.skill !== undefined && raw.skill !== null) {
    if (typeof raw.skill !== 'string') {
      errors.push('suggestedRoll.skill must be a string or null.');
    } else {
      skill = raw.skill;
    }
  }

  const dc = raw.dc;
  if (typeof dc !== 'number' || !Number.isInteger(dc) || dc < MIN_DC || dc > MAX_DC) {
    errors.push(`suggestedRoll.dc must be an integer between ${MIN_DC} and ${MAX_DC}.`);
  }

  const reason = raw.reason;
  if (typeof reason !== 'string' || reason.length < 1 || reason.length > MAX_REASON) {
    errors.push(`suggestedRoll.reason must be a non-empty string (max ${MAX_REASON} chars).`);
  }

  if (errors.length > 0) return null;
  return {
    ability: ability as Ability,
    skill,
    dc: dc as number,
    reason: reason as string,
  };
}

// Validate a parsed JSON object against the scene-turn contract. `presentNpcIds`
// (when provided) further constrains dialogue to NPCs actually in the scene —
// the model is told to use only those ids, and this is the enforcement.
export function validateSceneTurnResponse(
  raw: unknown,
  presentNpcIds?: readonly string[],
): ParseResult<SceneTurnResponse> {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ['Response must be a JSON object.'] };
  }

  const present = presentNpcIds ? new Set(presentNpcIds) : null;

  const dialogue: SceneTurnResponse['dialogue'] = [];
  if (!Array.isArray(raw.dialogue)) {
    errors.push('dialogue must be an array.');
  } else {
    if (raw.dialogue.length > MAX_DIALOGUE) {
      errors.push(`dialogue may contain at most ${MAX_DIALOGUE} lines.`);
    }
    raw.dialogue.forEach((entry, i) => {
      if (!isObject(entry)) {
        errors.push(`dialogue[${i}] must be an object.`);
        return;
      }
      const npcId = entry.npcId;
      const line = entry.line;
      if (typeof npcId !== 'string' || npcId.length < 1) {
        errors.push(`dialogue[${i}].npcId must be a non-empty string.`);
      } else if (present && !present.has(npcId)) {
        errors.push(
          `dialogue[${i}].npcId "${npcId}" is not one of the NPCs present in this scene.`,
        );
      }
      if (typeof line !== 'string' || line.length < 1 || line.length > MAX_LINE) {
        errors.push(`dialogue[${i}].line must be a non-empty string (max ${MAX_LINE} chars).`);
      }
      if (typeof npcId === 'string' && typeof line === 'string') {
        dialogue.push({ npcId, line });
      }
    });
  }

  const sensory = raw.sensory;
  if (typeof sensory !== 'string' || sensory.length < 1 || sensory.length > MAX_SENSORY) {
    errors.push(`sensory must be a non-empty string (max ${MAX_SENSORY} chars).`);
  }

  const suggestedRoll = parseSuggestedRoll(raw.suggestedRoll, errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      dialogue,
      sensory: sensory as string,
      suggestedRoll,
    },
  };
}

// Strip markdown fences / stray prose and parse the first JSON object found.
// The model is told to emit bare JSON, but this is a cheap safety net.
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const candidate = fenced.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
