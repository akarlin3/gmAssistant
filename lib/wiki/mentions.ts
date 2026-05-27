// Multi-entity `@mention` extractor. lib/scene/mentions.ts resolves @names
// against NPCs only; the wiki scanner needs to resolve them against every
// entity type, so this reuses the same matching strategy (exact → whitespace-
// normalized → light Levenshtein fallback) over the full entity index.

import { levenshtein } from '@/lib/scene/mentions';
import type { EntityIndex, WikiEntity } from './entities';

const MENTION_RE = /@(?:"([^"]+)"|([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)*))/g;

export type MentionHit = Pick<WikiEntity, 'type' | 'id' | 'name'>;

function matchEntity(target: string, entities: WikiEntity[]): WikiEntity | undefined {
  const t = target.toLowerCase();
  return (
    entities.find((e) => e.name.toLowerCase() === t) ??
    entities.find((e) => e.name.toLowerCase().replace(/\s+/g, '') === t.replace(/\s+/g, '')) ??
    entities
      .map((e) => ({ e, d: levenshtein(e.name.toLowerCase(), t) }))
      .filter(({ d, e }) => d <= Math.max(1, Math.floor(e.name.length / 5)))
      .sort((a, b) => a.d - b.d)[0]?.e
  );
}

// Extract distinct entity mentions from a single span of text, in order of
// first appearance. Bare-word mentions are matched greedily but the regex stops
// at punctuation, so "@Salt Pier at dawn" resolves "Salt Pier" then falls back
// through shorter prefixes if the full phrase doesn't match an entity.
export function extractAllMentions(text: string, index: EntityIndex): MentionHit[] {
  const hits: MentionHit[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const raw = (m[1] ?? m[2] ?? '').trim();
    if (!raw) continue;
    let entity = matchEntity(raw, index.entities);
    // Greedy bare-word capture may swallow trailing words ("Salt Pier at
    // dawn"); peel words off the end until something resolves.
    if (!entity && !m[1]) {
      const words = raw.split(/\s+/);
      for (let take = words.length - 1; take >= 1 && !entity; take--) {
        entity = matchEntity(words.slice(0, take).join(' '), index.entities);
      }
    }
    if (!entity) continue;
    const key = `${entity.type}:${entity.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ type: entity.type, id: entity.id, name: entity.name });
  }
  return hits;
}
