// Pure read-tool implementations. They operate solely on the CampaignSnapshot
// the client sends, so they're trivially unit-testable and never touch the
// network. Each returns a JSON-serializable object that gets fed back to the
// model as a tool_result.

import type {
  CampaignSnapshot,
  SnapshotFaction,
  SnapshotLocation,
  SnapshotNpc,
  SnapshotSecret,
} from '../context';
import type { ReadToolName } from '../types';

type EntityType =
  | 'npc'
  | 'faction'
  | 'location'
  | 'secret'
  | 'pc'
  | 'magicItem'
  | 'fantasticLocation';

function matchText(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function npcSearchText(n: SnapshotNpc): string {
  return [n.name, n.traits, n.voice, n.goals, n.faction].join(' ');
}
function factionSearchText(f: SnapshotFaction): string {
  return [f.name, f.goals].join(' ');
}
function locationSearchText(l: SnapshotLocation): string {
  return [l.name, l.description].join(' ');
}
function secretSearchText(s: SnapshotSecret): string {
  return s.text;
}

export function searchEntities(
  snap: CampaignSnapshot,
  input: { query?: string; types?: string[]; limit?: number },
): { results: Array<{ type: EntityType; id: string; name: string; snippet: string }> } {
  const query = String(input.query ?? '').trim();
  const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 20);
  const types = Array.isArray(input.types) && input.types.length ? new Set(input.types) : null;
  const want = (t: EntityType) => !types || types.has(t);
  const results: Array<{ type: EntityType; id: string; name: string; snippet: string }> = [];

  if (query) {
    if (want('npc'))
      for (const n of snap.npcs)
        if (matchText(npcSearchText(n), query))
          results.push({ type: 'npc', id: n.id, name: n.name, snippet: n.traits || n.goals });
    if (want('faction'))
      for (const f of snap.factions)
        if (matchText(factionSearchText(f), query))
          results.push({ type: 'faction', id: f.id, name: f.name, snippet: f.goals });
    if (want('location'))
      for (const l of snap.locations)
        if (matchText(locationSearchText(l), query))
          results.push({ type: 'location', id: l.id, name: l.name, snippet: l.description });
    if (want('secret'))
      for (const s of snap.secrets)
        if (matchText(secretSearchText(s), query))
          results.push({ type: 'secret', id: s.id, name: s.text.slice(0, 40), snippet: s.text });
    if (want('pc'))
      for (const p of snap.pcs)
        if (matchText([p.name, p.summary].join(' '), query))
          results.push({ type: 'pc', id: p.id, name: p.name, snippet: p.summary });
    if (want('magicItem'))
      for (const i of snap.magicItems)
        if (matchText([i.name, i.description].join(' '), query))
          results.push({ type: 'magicItem', id: i.id, name: i.name, snippet: i.description });
    if (want('fantasticLocation'))
      for (const i of snap.fantasticLocations)
        if (matchText([i.name, i.description].join(' '), query))
          results.push({
            type: 'fantasticLocation',
            id: i.id,
            name: i.name,
            snippet: i.description,
          });
  }

  return { results: results.slice(0, limit) };
}

export function getCampaignSummary(snap: CampaignSnapshot) {
  return {
    title: snap.title,
    premise: snap.premise || '(no premise recorded)',
    settingSummary: snap.settingSummary || '(unspecified setting)',
    currentDay: snap.currentDay || '(world clock not set)',
    counts: {
      npcs: snap.npcs.length,
      factions: snap.factions.length,
      locations: snap.locations.length,
      secrets: snap.secrets.length,
      pcs: snap.pcs.length,
      potentialScenes: snap.potentialScenes.length,
      clocks: snap.clocks.length,
    },
    party: snap.pcs.map((p) => ({ name: p.name, summary: p.summary })),
    recentSessionCount: snap.sessions.length,
  };
}

export function getRecentSessions(snap: CampaignSnapshot, input: { n?: number }) {
  const n = Math.min(Math.max(Number(input.n) || 3, 1), 10);
  return {
    sessions: snap.sessions.slice(0, n).map((s) => ({
      number: s.number,
      date: s.date,
      title: s.title,
      recap: s.recap,
      transcript: s.text,
    })),
  };
}

export function getFactionStatus(snap: CampaignSnapshot, input: { factionId?: string }) {
  const id = String(input.factionId ?? '').trim();
  const factions = id ? snap.factions.filter((f) => f.id === id) : snap.factions;
  return {
    factions: factions.map((f) => ({
      id: f.id,
      name: f.name,
      goals: f.goals,
      clocks: f.clocks,
      members: snap.npcs.filter((n) => n.faction && n.faction === f.name).map((n) => n.name),
    })),
  };
}

export function getEntityDetails(
  snap: CampaignSnapshot,
  input: { entityType?: string; entityId?: string },
) {
  const type = String(input.entityType ?? '') as EntityType;
  const id = String(input.entityId ?? '');
  switch (type) {
    case 'npc': {
      const e = snap.npcs.find((n) => n.id === id);
      if (!e) return { found: false };
      return {
        found: true,
        entity: e,
        relationships: {
          faction: e.faction || null,
        },
      };
    }
    case 'faction': {
      const e = snap.factions.find((f) => f.id === id);
      if (!e) return { found: false };
      return {
        found: true,
        entity: e,
        relationships: {
          members: snap.npcs.filter((n) => n.faction === e.name).map((n) => n.name),
        },
      };
    }
    case 'location': {
      const e = snap.locations.find((l) => l.id === id);
      return e ? { found: true, entity: e } : { found: false };
    }
    case 'secret': {
      const e = snap.secrets.find((s) => s.id === id);
      return e ? { found: true, entity: e } : { found: false };
    }
    case 'pc': {
      const e = snap.pcs.find((p) => p.id === id);
      return e ? { found: true, entity: e } : { found: false };
    }
    case 'magicItem': {
      const e = snap.magicItems.find((i) => i.id === id);
      return e ? { found: true, entity: e } : { found: false };
    }
    case 'fantasticLocation': {
      const e = snap.fantasticLocations.find((i) => i.id === id);
      return e ? { found: true, entity: e } : { found: false };
    }
    default:
      return { found: false, error: `Unknown entity type: ${type}` };
  }
}

// An entity is "dangling" if neither its name nor id appears in the aggregated
// text of any of the last N sessions.
export function getDanglingThreads(snap: CampaignSnapshot, input: { sessionsBack?: number }) {
  const n = Math.min(Math.max(Number(input.sessionsBack) || 3, 1), 20);
  const recent = snap.sessions.slice(0, n);
  const corpus = recent
    .map((s) => s.text)
    .join(' \n ')
    .toLowerCase();

  const referenced = (name: string, id: string) => {
    const lname = name.trim().toLowerCase();
    if (lname && corpus.includes(lname)) return true;
    if (id && corpus.includes(id.toLowerCase())) return true;
    return false;
  };

  const danglingNpcs = snap.npcs
    .filter((e) => !referenced(e.name, e.id))
    .map((e) => ({ id: e.id, name: e.name }));
  const danglingFactions = snap.factions
    .filter((e) => !referenced(e.name, e.id))
    .map((e) => ({ id: e.id, name: e.name }));
  const danglingLocations = snap.locations
    .filter((e) => !referenced(e.name, e.id))
    .map((e) => ({ id: e.id, name: e.name }));

  return {
    sessionsBack: n,
    sessionsConsidered: recent.length,
    danglingNpcs,
    danglingFactions,
    danglingLocations,
    note:
      recent.length === 0
        ? 'No recent sessions on record, so everything is technically unreferenced.'
        : undefined,
  };
}

export function executeReadTool(
  name: ReadToolName,
  input: Record<string, unknown>,
  snap: CampaignSnapshot,
): unknown {
  switch (name) {
    case 'searchEntities':
      return searchEntities(snap, input);
    case 'getCampaignSummary':
      return getCampaignSummary(snap);
    case 'getRecentSessions':
      return getRecentSessions(snap, input);
    case 'getFactionStatus':
      return getFactionStatus(snap, input);
    case 'getEntityDetails':
      return getEntityDetails(snap, input);
    case 'getDanglingThreads':
      return getDanglingThreads(snap, input);
    default:
      return { error: `Unknown read tool: ${name}` };
  }
}
