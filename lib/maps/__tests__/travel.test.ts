import { describe, it, expect } from 'vitest';
import { shortestPath, travelToNode } from '../travel';
import type { PointcrawlData } from '../types';

// A ── 2d ── B ── 3d ── C, plus a hazardous A ── 10d ── C shortcut.
const graph: PointcrawlData = {
  nodes: [
    { id: 'A', x: 0.1, y: 0.1, label: 'A', layerId: 'L' },
    { id: 'B', x: 0.5, y: 0.5, label: 'B', layerId: 'L' },
    { id: 'C', x: 0.9, y: 0.9, label: 'C', layerId: 'L' },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'A', toNodeId: 'B', travelTimeDays: 2, layerId: 'L' },
    { id: 'e2', fromNodeId: 'B', toNodeId: 'C', travelTimeDays: 3, layerId: 'L' },
    { id: 'e3', fromNodeId: 'A', toNodeId: 'C', travelTimeDays: 10, hazardous: true, layerId: 'L' },
  ],
};

describe('shortestPath', () => {
  it('sums travel time along the cheapest route', () => {
    const p = shortestPath(graph, 'A', 'C');
    expect(p?.totalDays).toBe(5);
    expect(p?.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(p?.nodeIds).toEqual(['A', 'B', 'C']);
  });

  it('returns a zero-day, edgeless path to self', () => {
    const p = shortestPath(graph, 'A', 'A');
    expect(p).toEqual({ totalDays: 0, edges: [], nodeIds: ['A'] });
  });

  it('treats edges as undirected', () => {
    expect(shortestPath(graph, 'C', 'A')?.totalDays).toBe(5);
  });

  it('returns null when no path exists', () => {
    const isolated: PointcrawlData = {
      nodes: [...graph.nodes, { id: 'Z', x: 0, y: 0, label: 'Z', layerId: 'L' }],
      edges: graph.edges,
    };
    expect(shortestPath(isolated, 'A', 'Z')).toBeNull();
  });

  it('treats missing travel times as zero-weight', () => {
    const free: PointcrawlData = {
      nodes: graph.nodes,
      edges: [{ id: 'f', fromNodeId: 'A', toNodeId: 'C', layerId: 'L' }],
    };
    expect(shortestPath(free, 'A', 'C')?.totalDays).toBe(0);
  });
});

describe('travelToNode', () => {
  function baseData() {
    return {
      worldClock: { currentDay: 1, lastTickAt: 0, tickRules: [], agendas: [], briefingLog: [] },
      maps: [{ id: 'm1', type: 'pointcrawl', pointcrawl: graph }],
    };
  }

  it('advances the World Clock by the summed travel time', () => {
    const res = travelToNode({ data: baseData(), mapId: 'm1', fromNodeId: 'A', toNodeId: 'C', now: 1000 });
    expect(res.daysElapsed).toBe(5);
    expect(res.data.worldClock.currentDay).toBe(6);
    expect(res.briefingId).toBeTruthy();
    expect(res.data.worldClock.briefingLog).toHaveLength(1);
  });

  it('is a no-op for a zero-day move', () => {
    const data = baseData();
    const res = travelToNode({ data, mapId: 'm1', fromNodeId: 'A', toNodeId: 'A' });
    expect(res.daysElapsed).toBe(0);
    expect(res.data).toBe(data);
    expect(res.data.worldClock.currentDay).toBe(1);
  });

  it('throws on a non-pointcrawl map', () => {
    const data = { worldClock: { currentDay: 1 }, maps: [{ id: 'm1', type: 'region' }] };
    expect(() => travelToNode({ data, mapId: 'm1', fromNodeId: 'A', toNodeId: 'C' })).toThrow();
  });

  it('throws when no path connects the nodes', () => {
    const data = baseData();
    data.maps[0].pointcrawl = { nodes: [...graph.nodes, { id: 'Z', x: 0, y: 0, label: 'Z', layerId: 'L' }], edges: graph.edges };
    expect(() => travelToNode({ data, mapId: 'm1', fromNodeId: 'A', toNodeId: 'Z' })).toThrow();
  });
});
