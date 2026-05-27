import { levenshtein } from '../scene/mentions';

export type ParsedNpcLine = {
  npcId: string;
  npcName: string;
  line: string;
};

type NpcLike = { id?: string; name?: string };

// Detects `@NpcName: "spoken line"` patterns in free text (session-log recaps,
// notes) and pairs each with the NPC it names. Supports `@"Quoted Name"` and
// bare `@Name Surname`, straight or curly quotes, with a Levenshtein fallback
// for light typos (mirrors lib/scene/mentions.ts resolution). Unresolved names
// are dropped so callers only ever get speakable lines.
const RE = /@(?:"([^"\n]{1,60})"|([^\n:"]{1,60}?))\s*:\s*["“]([^"”\n]{1,500})["”]/g;

export function parseNpcDialogueLines(text: string, npcs: NpcLike[]): ParsedNpcLine[] {
  if (!text) return [];
  const candidates = npcs
    .map((n) => ({ id: String(n.id ?? ''), name: String(n.name ?? '') }))
    .filter((n) => n.id && n.name);
  if (candidates.length === 0) return [];

  const out: ParsedNpcLine[] = [];
  for (const match of text.matchAll(RE)) {
    const rawName = (match[1] ?? match[2] ?? '').trim();
    const line = (match[3] ?? '').trim();
    if (!rawName || !line) continue;
    const npc = resolveNpc(rawName, candidates);
    if (npc) out.push({ npcId: npc.id, npcName: npc.name, line });
  }
  return out;
}

function resolveNpc(
  rawName: string,
  candidates: { id: string; name: string }[],
): { id: string; name: string } | null {
  const target = rawName.toLowerCase();
  const exact = candidates.find((n) => n.name.toLowerCase() === target);
  if (exact) return exact;
  const collapsed = candidates.find(
    (n) => n.name.toLowerCase().replace(/\s+/g, '') === target.replace(/\s+/g, ''),
  );
  if (collapsed) return collapsed;
  const fuzzy = candidates
    .map((n) => ({ n, d: levenshtein(n.name.toLowerCase(), target) }))
    .filter(({ d, n }) => d <= Math.max(1, Math.floor(n.name.length / 5)))
    .sort((a, b) => a.d - b.d)[0]?.n;
  return fuzzy ?? null;
}
