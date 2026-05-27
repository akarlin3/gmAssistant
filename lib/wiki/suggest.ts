// Auto-suggestion scanner. Walks prose (session-log recaps, scene transcripts,
// the session scratchpad) one sentence at a time and proposes relationships
// between co-mentioned entities: NPC + Location → `locatedAt`, any other pair
// → `related`. Suggestions are appended to `data.relationships` with
// `suggested: true` and surface in the Wiki tab's Pending list for the GM to
// Accept (→ suggested:false) or Reject (→ deleted). Ignored suggestions
// auto-reject after 30 days.

import type { EntityIndex } from './entities';
import { extractAllMentions, type MentionHit } from './mentions';
import { relationshipExists } from './relationships';
import type { EntityType, Relationship, RelationshipKind } from './types';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const LOCATION_TYPES: EntityType[] = ['location', 'fantasticLocation'];

function makeSuggestion(a: MentionHit, b: MentionHit, kind: RelationshipKind): Relationship {
  return {
    id: makeId(),
    fromType: a.type,
    fromId: a.id,
    toType: b.type,
    toId: b.id,
    kind,
    suggested: true,
    createdAt: Date.now(),
  };
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function dedupeKey(r: Relationship): string {
  return [r.kind, ...[`${r.fromType}:${r.fromId}`, `${r.toType}:${r.toId}`].sort()].join('|');
}

export function scanTextForSuggestions(
  text: string,
  index: EntityIndex,
  existing: ReadonlyArray<Relationship>,
): Relationship[] {
  if (!text || !text.trim()) return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const suggestions: Relationship[] = [];
  const seen = new Set<string>();

  const consider = (a: MentionHit, b: MentionHit, kind: RelationshipKind) => {
    if (a.type === b.type && a.id === b.id) return;
    if (relationshipExists(existing, { type: a.type, id: a.id }, { type: b.type, id: b.id }, kind))
      return;
    const sug = makeSuggestion(a, b, kind);
    const key = dedupeKey(sug);
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(sug);
  };

  for (const sentence of sentences) {
    const mentioned = extractAllMentions(sentence, index);
    if (mentioned.length < 2) continue;

    const npcs = mentioned.filter((m) => m.type === 'npc');
    const locs = mentioned.filter((m) => LOCATION_TYPES.includes(m.type));

    // NPC seen with a Location → propose locatedAt.
    for (const npc of npcs) {
      for (const loc of locs) consider(npc, loc, 'locatedAt');
    }

    // Every other co-mentioned pair → propose a generic `related` link.
    for (let i = 0; i < mentioned.length; i++) {
      for (let j = i + 1; j < mentioned.length; j++) {
        const a = mentioned[i];
        const b = mentioned[j];
        const aIsNpc = a.type === 'npc';
        const bIsNpc = b.type === 'npc';
        const aIsLoc = LOCATION_TYPES.includes(a.type);
        const bIsLoc = LOCATION_TYPES.includes(b.type);
        if ((aIsNpc && bIsLoc) || (bIsNpc && aIsLoc)) continue; // covered by locatedAt
        consider(a, b, 'related');
      }
    }
  }

  return suggestions;
}

// Drop suggested-but-unconfirmed relationships older than 30 days. Confirmed
// relationships (suggested falsy) are never touched. Returns the same array
// reference when nothing changed so callers can skip a write.
export function pruneExpiredSuggestions(
  rels: ReadonlyArray<Relationship>,
  now: number = Date.now(),
): { relationships: Relationship[]; changed: boolean } {
  const kept = rels.filter((r) => !r.suggested || now - r.createdAt < THIRTY_DAYS_MS);
  return { relationships: kept as Relationship[], changed: kept.length !== rels.length };
}
