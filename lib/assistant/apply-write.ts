// Pure functions that apply an approved write-tool proposal to the campaign
// `data` object. Mutations run client-side (the app writes everything to
// Firestore from the client), so these return a new data object plus a short
// summary fed back to the model as the tool_result. Kept pure for unit tests.

import type { WriteToolName } from './types';

type LooseRecord = Record<string, unknown>;

function rid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function factionNameById(data: LooseRecord, id: string): string {
  const f = arr(data.factions).find((x) => (x as LooseRecord).id === id) as LooseRecord | undefined;
  return f ? str(f.name) : '';
}

export type ApplyResult = { data: LooseRecord; summary: string; createdId?: string };

export function applyWriteTool(
  data: LooseRecord,
  name: WriteToolName,
  input: LooseRecord,
): ApplyResult {
  switch (name) {
    case 'createNpc': {
      const id = rid('npc');
      const npc: LooseRecord = {
        id,
        name: str(input.name),
        traits: str(input.traits),
        voice: str(input.voice),
        goals: Array.isArray(input.goals)
          ? (input.goals as unknown[]).map(str).filter(Boolean)
          : [],
        type: 'Neutral',
        source: 'assistant',
      };
      if (str(input.factionId))
        npc.faction = factionNameById(data, str(input.factionId)) || str(input.factionId);
      if (str(input.locationId)) npc.locationId = str(input.locationId);
      return {
        data: { ...data, npcs: [...arr(data.npcs), npc] },
        summary: `Created NPC "${npc.name}" (id ${id}).`,
        createdId: id,
      };
    }

    case 'createSecret': {
      const text = str(input.text);
      return {
        data: { ...data, secrets: [...arr(data.secrets), text] },
        summary: `Added secret: "${text.slice(0, 60)}".`,
      };
    }

    case 'createPotentialScene': {
      const type = str(input.type) || 'social';
      const title = str(input.title);
      const hook = str(input.hook);
      const line = `[${type}] ${title} — ${hook}`;
      return {
        data: { ...data, scenes: [...arr(data.scenes), line] },
        summary: `Added potential scene "${title}".`,
      };
    }

    case 'addFactionClock': {
      const factionId = str(input.factionId);
      const factionName = factionNameById(data, factionId) || factionId;
      const max = Math.min(Math.max(Number(input.maxSegments) || 6, 2), 12);
      const id = rid('clock');
      const clock: LooseRecord = {
        id,
        text: str(input.name),
        faction: factionName,
        max,
        filled: 0,
        notes: str(input.description),
      };
      return {
        data: { ...data, clocks: [...arr(data.clocks), clock] },
        summary: `Added clock "${clock.text}" (${max} segments) for ${factionName || 'faction'}.`,
        createdId: id,
      };
    }

    case 'addRelationship': {
      const id = rid('rel');
      const rel: LooseRecord = {
        id,
        fromType: str(input.fromType),
        fromId: str(input.fromId),
        toType: str(input.toType),
        toId: str(input.toId),
        kind: str(input.kind),
        notes: str(input.notes),
      };
      return {
        data: { ...data, relationships: [...arr(data.relationships), rel] },
        summary: `Linked ${rel.fromId} → ${rel.toId} as "${rel.kind}".`,
        createdId: id,
      };
    }

    case 'addCluePath': {
      const revelation = str(input.revelation);
      const clues = Array.isArray(input.clues)
        ? (input.clues as unknown[]).map(str).filter(Boolean)
        : [];
      // Persist as secrets entries: the revelation header plus each clue,
      // labeled so the three-clue grouping is legible in the Secrets list.
      const entries = [
        `Revelation: ${revelation}`,
        ...clues.map((c, i) => `Clue ${i + 1} → ${revelation}: ${c}`),
      ];
      return {
        data: { ...data, secrets: [...arr(data.secrets), ...entries] },
        summary: `Added a ${clues.length}-clue path toward "${revelation.slice(0, 50)}".`,
      };
    }

    default:
      return { data, summary: `Unknown write tool: ${name}` };
  }
}
