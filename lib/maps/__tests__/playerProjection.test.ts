import { describe, it, expect } from 'vitest';
import { projectPlayerMaps } from '../playerProjection';

const data = {
  maps: [
    {
      id: 'm1',
      name: 'Region',
      type: 'region',
      imageUrl: 'http://img',
      width: 1000,
      height: 800,
      layers: [
        { id: 'gm', name: 'GM', color: '#000', visible: true, visibleToPlayers: false, order: 0 },
        { id: 'pub', name: 'Player', color: '#fff', visible: true, visibleToPlayers: true, order: 1 },
      ],
      markers: [
        { id: 'k1', x: 0.1, y: 0.1, layerId: 'gm', label: 'Secret', notes: 'hidden', entityType: 'npcs', entityId: 'n1' },
        { id: 'k2', x: 0.2, y: 0.2, layerId: 'pub', label: 'Town', icon: 'house', color: '#abc', notes: 'gm note' },
      ],
    },
    {
      id: 'm2',
      name: 'GM Only',
      type: 'region',
      layers: [{ id: 'g', name: 'GM', color: '#000', visible: true, visibleToPlayers: false, order: 0 }],
      markers: [{ id: 'z', x: 0.5, y: 0.5, layerId: 'g', label: 'nope' }],
    },
  ],
};

describe('projectPlayerMaps', () => {
  it('omits maps with no player-visible layer', () => {
    const maps = projectPlayerMaps(data);
    expect(maps.map((m) => m.id)).toEqual(['m1']);
  });

  it('includes only markers on player-visible layers and strips GM-only fields', () => {
    const [m] = projectPlayerMaps(data);
    expect(m.layers.map((l) => l.id)).toEqual(['pub']);
    expect(m.markers).toHaveLength(1);
    const marker = m.markers[0];
    expect(marker.id).toBe('k2');
    expect(marker.label).toBe('Town');
    expect(marker.icon).toBe('house');
    expect(marker.color).toBe('#abc');
    // GM-only fields must never reach players.
    expect('notes' in marker).toBe(false);
    expect('entityId' in marker).toBe(false);
    expect(m.imageUrl).toBe('http://img');
  });

  it('only keeps pointcrawl edges whose both endpoints are visible', () => {
    const pcData = {
      maps: [
        {
          id: 'p1',
          name: 'PC',
          type: 'pointcrawl',
          layers: [
            { id: 'pub', name: 'Player', color: '#fff', visible: true, visibleToPlayers: true, order: 0 },
            { id: 'gm', name: 'GM', color: '#000', visible: true, visibleToPlayers: false, order: 1 },
          ],
          pointcrawl: {
            nodes: [
              { id: 'a', x: 0.1, y: 0.1, label: 'A', layerId: 'pub' },
              { id: 'b', x: 0.2, y: 0.2, label: 'B', layerId: 'pub' },
              { id: 'c', x: 0.3, y: 0.3, label: 'C', layerId: 'gm' },
            ],
            edges: [
              { id: 'ab', fromNodeId: 'a', toNodeId: 'b', layerId: 'pub', label: 'road', travelTimeDays: 3 },
              { id: 'ac', fromNodeId: 'a', toNodeId: 'c', layerId: 'pub' },
            ],
          },
        },
      ],
    };
    const [m] = projectPlayerMaps(pcData);
    expect(m.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(m.edges.map((e) => e.id)).toEqual(['ab']);
    // Travel time is GM-only and must not leak.
    expect('travelTimeDays' in m.edges[0]).toBe(false);
    expect(m.edges[0].label).toBe('road');
  });
});
