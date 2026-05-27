// Pointcrawl travel → World Clock integration.
//
// Travelling from one pointcrawl node to another advances the in-world clock by
// the summed `travelTimeDays` of the shortest path between them, reusing the
// Living World tick engine so faction clocks, downtime, and NPC agendas all move
// forward and a "While You Were Away" briefing is recorded. Pure apart from the
// `applyTicks` call, which is itself pure.

import { applyTicks } from '@/lib/world/tick';
import type { PointcrawlData, PointcrawlEdge } from './types';

export type ShortestPath = { totalDays: number; edges: PointcrawlEdge[]; nodeIds: string[] };

// Dijkstra over the undirected pointcrawl graph weighted by edge travel time.
// Edges with no `travelTimeDays` count as 0 days (free movement). Returns null
// when no path connects the two nodes.
export function shortestPath(
  pc: PointcrawlData,
  from: string,
  to: string,
): ShortestPath | null {
  if (from === to) return { totalDays: 0, edges: [], nodeIds: [from] };

  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edge: PointcrawlEdge }>();
  const visited = new Set<string>();
  const queue = new Set<string>([from]);
  dist.set(from, 0);

  while (queue.size) {
    let cur: string | null = null;
    let best = Infinity;
    for (const id of queue) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        cur = id;
      }
    }
    if (cur === null) break;
    queue.delete(cur);
    if (cur === to) break;
    if (visited.has(cur)) continue;
    visited.add(cur);

    for (const e of pc.edges) {
      let next: string | null = null;
      if (e.fromNodeId === cur) next = e.toNodeId;
      else if (e.toNodeId === cur) next = e.fromNodeId;
      if (!next || visited.has(next)) continue;

      const weight = typeof e.travelTimeDays === 'number' ? Math.max(0, e.travelTimeDays) : 0;
      const newDist = (dist.get(cur) ?? Infinity) + weight;
      if (newDist < (dist.get(next) ?? Infinity)) {
        dist.set(next, newDist);
        prev.set(next, { node: cur, edge: e });
        queue.add(next);
      }
    }
  }

  if (!dist.has(to)) return null;

  const edges: PointcrawlEdge[] = [];
  const nodeIds: string[] = [to];
  let cur = to;
  while (cur !== from) {
    const step = prev.get(cur);
    if (!step) return null;
    edges.unshift(step.edge);
    nodeIds.unshift(step.node);
    cur = step.node;
  }
  return { totalDays: dist.get(to)!, edges, nodeIds };
}

export type TravelResult = {
  data: Record<string, any>;
  daysElapsed: number;
  // The briefing the tick produced, when days actually elapsed. Absent for a
  // zero-day move (no time passes, nothing to brief).
  briefingId?: string;
};

// Travel between two nodes on a pointcrawl map. Returns the next campaign `data`
// blob (with the World Clock advanced and a briefing appended) plus how many
// days elapsed. Throws when the map isn't a pointcrawl or no path exists.
export function travelToNode(args: {
  data: Record<string, any>;
  mapId: string;
  fromNodeId: string;
  toNodeId: string;
  now?: number;
}): TravelResult {
  const maps = Array.isArray(args.data?.maps) ? args.data.maps : [];
  const map = maps.find((m: any) => m?.id === args.mapId);
  if (!map?.pointcrawl) throw new Error('Not a pointcrawl map');

  const path = shortestPath(map.pointcrawl, args.fromNodeId, args.toNodeId);
  if (!path) throw new Error('No path between nodes');

  const daysElapsed = path.totalDays;
  if (daysElapsed <= 0) return { data: args.data, daysElapsed: 0 };

  const currentDay =
    typeof args.data?.worldClock?.currentDay === 'number' ? args.data.worldClock.currentDay : 1;
  const result = applyTicks({
    data: args.data,
    toDay: currentDay + daysElapsed,
    now: args.now,
  });
  return { data: result.data, daysElapsed, briefingId: result.briefing.id };
}
