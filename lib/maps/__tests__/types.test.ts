import { describe, it, expect } from 'vitest';
import { makeMap, readMaps, MAPS_CAP } from '../types';

describe('makeMap', () => {
  it('creates a region map with a default layer and no pointcrawl', () => {
    const m = makeMap({ name: 'The Wells', type: 'region', imageUrl: 'u', imageStoragePath: 'p', width: 1000, height: 800 });
    expect(m.type).toBe('region');
    expect(m.layers).toHaveLength(1);
    expect(m.layers[0].name).toBe('Markers');
    expect(m.layers[0].visibleToPlayers).toBe(false);
    expect(m.markers).toEqual([]);
    expect(m.pointcrawl).toBeUndefined();
    expect(m.imageUrl).toBe('u');
    expect(m.width).toBe(1000);
  });

  it('seeds an empty pointcrawl graph for pointcrawl maps', () => {
    const m = makeMap({ name: 'Region', type: 'pointcrawl' });
    expect(m.pointcrawl).toEqual({ nodes: [], edges: [] });
    expect(m.imageUrl).toBeUndefined();
  });

  it('falls back to a non-empty name', () => {
    expect(makeMap({ name: '   ', type: 'region', imageUrl: 'u' }).name).toBe('Untitled Map');
  });
});

describe('readMaps', () => {
  it('returns [] for absent or malformed data', () => {
    expect(readMaps(undefined)).toEqual([]);
    expect(readMaps({})).toEqual([]);
    expect(readMaps({ maps: 'nope' })).toEqual([]);
  });

  it('drops entries without an id and normalizes the rest', () => {
    const maps = readMaps({
      maps: [
        { id: 'm1', name: 'A', type: 'region', width: 100, height: 50, markers: [{ id: 'x', x: 2, y: -1 }] },
        { name: 'no id' },
        { id: 'm2', type: 'pointcrawl' },
      ],
    });
    expect(maps).toHaveLength(2);
    // Coordinates clamped to 0–1.
    expect(maps[0].markers[0].x).toBe(1);
    expect(maps[0].markers[0].y).toBe(0);
    // Markers inherit the fallback layer when layerId is missing.
    expect(maps[0].markers[0].layerId).toBe(maps[0].layers[0].id);
    // Pointcrawl map gets a graph even if absent on disk.
    expect(maps[1].pointcrawl).toEqual({ nodes: [], edges: [] });
  });

  it('defaults an unknown type to region', () => {
    expect(readMaps({ maps: [{ id: 'm', type: 'bogus' }] })[0].type).toBe('region');
  });

  it('exposes a 20-map cap constant', () => {
    expect(MAPS_CAP).toBe(20);
  });
});
