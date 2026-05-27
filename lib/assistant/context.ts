// Read-only campaign snapshot assembled on the client and sent to the
// assistant route. The read tools execute against this snapshot, so no extra
// Firestore reads happen server-side (the route can't read the campaign doc
// anyway — verifyPro only grants the user's own users/{uid} doc). The snapshot
// is bounded: session text is the only large field and it's truncated.

type LooseRecord = Record<string, unknown>;

const MAX_SESSIONS = 12;
const MAX_SESSION_TEXT = 4000;

export type SnapshotNpc = {
  id: string;
  name: string;
  traits: string;
  voice: string;
  goals: string;
  faction: string;
};

export type SnapshotFaction = {
  id: string;
  name: string;
  goals: string;
  clocks: { name: string; filled: number; max: number }[];
};

export type SnapshotLocation = { id: string; name: string; description: string };
export type SnapshotSecret = { id: string; text: string };
export type SnapshotPc = { id: string; name: string; summary: string };
export type SnapshotItem = { id: string; name: string; description: string };

export type SnapshotSession = {
  number: number;
  date: string;
  title: string;
  recap: string;
  text: string; // aggregated matchable text (recap + events + revealed + scenes)
};

export type CampaignSnapshot = {
  title: string;
  premise: string;
  settingSummary: string;
  currentDay: string;
  npcs: SnapshotNpc[];
  factions: SnapshotFaction[];
  locations: SnapshotLocation[];
  secrets: SnapshotSecret[];
  pcs: SnapshotPc[];
  magicItems: SnapshotItem[];
  fantasticLocations: SnapshotItem[];
  potentialScenes: string[];
  clocks: { text: string; faction: string; filled: number; max: number }[];
  sessions: SnapshotSession[];
};

function arr(v: unknown): LooseRecord[] {
  return Array.isArray(v) ? (v as LooseRecord[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function joinParts(parts: Array<string | undefined | null>, sep = '. '): string {
  return parts
    .map((p) => str(p))
    .filter(Boolean)
    .join(sep);
}

function npcCard(n: LooseRecord): SnapshotNpc {
  return {
    id: str(n.id),
    name: str(n.name) || '(unnamed NPC)',
    traits: str(n.traits) || joinParts([str(n.archetype), str(n.descriptor), str(n.type)]),
    voice: str(n.voice) || str(n.mannerism),
    goals: str(n.goals) || joinParts([str(n.goal), str(n.method) && `Method: ${str(n.method)}`]),
    faction: str(n.faction),
  };
}

function factionCard(f: LooseRecord): SnapshotFaction {
  const clocks = arr(f.clocks).map((c) => ({
    name: str(c.name) || str(c.text),
    filled: num(c.filled),
    max: num(c.max) || num(c.maxSegments) || 6,
  }));
  return {
    id: str(f.id),
    name: str(f.name) || '(unnamed faction)',
    goals: joinParts([str(f.shortGoals), str(f.midGoals), str(f.longGoal), str(f.ideology)]),
    clocks,
  };
}

function locationCard(l: LooseRecord): SnapshotLocation {
  const aspects = Array.isArray(l.aspects) ? (l.aspects as unknown[]).map(str).filter(Boolean) : [];
  return {
    id: str(l.id),
    name: str(l.name) || '(unnamed location)',
    description: str(l.description) || str(l.blurb) || joinParts([str(l.type), aspects.join(', ')]),
  };
}

function itemCard(i: LooseRecord | string): SnapshotItem {
  if (typeof i === 'string') return { id: '', name: i, description: '' };
  return {
    id: str(i.id),
    name: str(i.name) || '(unnamed)',
    description: str(i.description) || str(i.blurb),
  };
}

function secretCard(s: LooseRecord | string, idx: number): SnapshotSecret {
  if (typeof s === 'string') return { id: `secret-${idx}`, text: s };
  return { id: str(s.id) || `secret-${idx}`, text: str(s.text) };
}

function sessionCard(e: LooseRecord): SnapshotSession {
  const events = arr(e.events)
    .map((ev) => joinParts([str(ev.summary), str(ev.text), str(ev.detail)]))
    .filter(Boolean);
  const revealed = Array.isArray(e.secretsRevealed)
    ? (e.secretsRevealed as unknown[]).map(str).filter(Boolean)
    : [];
  const scenes = Array.isArray(e.scenesUsed)
    ? (e.scenesUsed as unknown[]).map(str).filter(Boolean)
    : [];
  // Legacy/test transcripts: array of { text }.
  const transcript = Array.isArray(e.transcript)
    ? (e.transcript as LooseRecord[]).map((t) => str(t.text)).filter(Boolean)
    : [];
  const text = [str(e.title), str(e.recap), ...events, ...revealed, ...scenes, ...transcript]
    .filter(Boolean)
    .join(' • ')
    .slice(0, MAX_SESSION_TEXT);
  return {
    number: num(e.number),
    date: str(e.date),
    title: str(e.title),
    recap: str(e.recap).slice(0, MAX_SESSION_TEXT),
    text,
  };
}

export function buildCampaignSnapshot(data: LooseRecord, campaignName = ''): CampaignSnapshot {
  const sessionsV2 = arr(data.sessionLogV2);
  const sessionsLegacy = arr(data.sessionLogs);
  const allSessions = (sessionsV2.length ? sessionsV2 : sessionsLegacy)
    .map(sessionCard)
    .sort((a, b) => b.number - a.number)
    .slice(0, MAX_SESSIONS);

  const pcs = arr(data.characters).map((c) => ({
    id: str(c.id),
    name: str(c.name) || '(unnamed PC)',
    summary: joinParts([
      str(c.ancestry) || str(c.race),
      str(c.class) || str(c.className),
      str(c.background),
      str(c.notes),
    ]),
  }));

  return {
    title: str(data.title) || str(data.name) || campaignName || 'Untitled Campaign',
    premise: str(data.pitch) || str(data.premise),
    settingSummary: joinParts([
      str(data.genre),
      Array.isArray(data.tone)
        ? (data.tone as unknown[]).map(str).filter(Boolean).join('/')
        : str(data.tone),
    ]),
    currentDay: str(data.worldDay) || str(data.currentDay) || '',
    npcs: arr(data.npcs).map(npcCard),
    factions: arr(data.factions).map(factionCard),
    locations: arr(data.locations).map(locationCard),
    secrets: (Array.isArray(data.secrets) ? (data.secrets as Array<LooseRecord | string>) : []).map(
      secretCard,
    ),
    pcs,
    magicItems: (Array.isArray(data.magicItems)
      ? data.magicItems
      : Array.isArray(data.items)
        ? data.items
        : []
    ).map((i) => itemCard(i as LooseRecord | string)),
    fantasticLocations: arr(data.fantasticLocations).map((l) => itemCard(l)),
    potentialScenes: Array.isArray(data.scenes)
      ? (data.scenes as unknown[]).map(str).filter(Boolean)
      : [],
    clocks: arr(data.clocks).map((c) => ({
      text: str(c.text) || str(c.name),
      faction: str(c.faction),
      filled: num(c.filled),
      max: num(c.max) || 6,
    })),
    sessions: allSessions,
  };
}
