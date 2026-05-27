// Fuzzy `@NpcName` resolver. Supports `@"Quoted Name"` and `@bareword`, with a
// Levenshtein fallback so light typos still resolve. Returns the set of matched
// NPC ids and a marked-up copy of the text for rendering. Pure.

export type MentionNpc = { id: string; name: string };

export function resolveMentions(
  text: string,
  npcs: ReadonlyArray<MentionNpc>,
): { resolvedIds: string[]; markedText: string } {
  const resolvedIds: string[] = [];
  const re = /@(?:"([^"]+)"|([A-Za-z][\w-]*))/g;

  const markedText = text.replace(
    re,
    (m, quoted: string | undefined, plain: string | undefined) => {
      const target = (quoted ?? plain ?? '').toLowerCase();
      if (!target) return m;
      const npc =
        npcs.find((n) => n.name.toLowerCase() === target) ??
        npcs.find((n) => n.name.toLowerCase().replace(/\s+/g, '') === target) ??
        npcs
          .map((n) => ({ npc: n, d: levenshtein(n.name.toLowerCase(), target) }))
          .filter(({ d, npc }) => d <= Math.max(1, Math.floor(npc.name.length / 5)))
          .sort((a, b) => a.d - b.d)[0]?.npc;

      if (npc) {
        if (!resolvedIds.includes(npc.id)) resolvedIds.push(npc.id);
        return `<mention id="${npc.id}">${m}</mention>`;
      }
      return m;
    },
  );

  return { resolvedIds, markedText };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
