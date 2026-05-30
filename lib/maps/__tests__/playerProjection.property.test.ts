// Property-based proof of the map redaction invariant.
//
// playerProjection.ts declares itself the security boundary for what map data
// reaches players: only layers flagged `visibleToPlayers`, only the markers /
// pointcrawl nodes & edges on those layers, and GM-only fields (marker notes,
// entity links, edge travel times) stripped. These properties run the *real*
// projectPlayerMaps over arbitrary maps and assert nothing GM-only survives.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { projectPlayerMaps } from '../playerProjection';
import type { CampaignMap, MapLayer } from '../types';

const ALLOWED_LAYER_KEYS = new Set(['id', 'name', 'color', 'order']);
const ALLOWED_MARKER_KEYS = new Set(['id', 'x', 'y', 'layerId', 'label', 'color', 'icon']);
const ALLOWED_NODE_KEYS = new Set(['id', 'x', 'y', 'label', 'layerId']);
const ALLOWED_EDGE_KEYS = new Set(['id', 'fromNodeId', 'toNodeId', 'layerId', 'label', 'hazardous']);

function layerArb(i: number): fc.Arbitrary<MapLayer> {
  return fc.record({
    id: fc.constant(`layer-${i}`),
    name: fc.constant(`Layer ${i}`),
    color: fc.constant('#abcdef'),
    visible: fc.boolean(),
    visibleToPlayers: fc.boolean(),
    order: fc.integer({ min: 0, max: 9 }),
  });
}

function mapArb(): fc.Arbitrary<CampaignMap> {
  return fc.integer({ min: 1, max: 4 }).chain((layerCount) => {
    const layerIds = Array.from({ length: layerCount }, (_v, i) => `layer-${i}`);
    const nodeIds = ['n0', 'n1', 'n2'];
    return fc.record({
      id: fc.uuid(),
      name: fc.constant('Map'),
      type: fc.constantFrom('pointcrawl', 'region', 'encounter', 'dungeon'),
      imageUrl: fc.option(fc.constant('https://example/img.png'), { nil: undefined }),
      width: fc.constant(100),
      height: fc.constant(100),
      createdAt: fc.constant(0),
      layers: fc.tuple(...layerIds.map((_id, i) => layerArb(i))),
      markers: fc.array(
        fc.record({
          id: fc.uuid(),
          x: fc.float({ min: 0, max: 1, noNaN: true }),
          y: fc.float({ min: 0, max: 1, noNaN: true }),
          layerId: fc.constantFrom(...layerIds, 'ghost-layer'),
          label: fc.constant('M'),
          // GM-only fields that must never reach players:
          notes: fc.constant('GM-ONLY-MARKER-NOTES'),
          entityType: fc.constant('npcs'),
          entityId: fc.constant('secret-npc'),
        }),
        { maxLength: 5 },
      ),
      pointcrawl: fc.record({
        nodes: fc.subarray(nodeIds, { minLength: 0 }).chain((ids) =>
          fc.tuple(
            ...ids.map((nid) =>
              fc.record({
                id: fc.constant(nid),
                x: fc.float({ min: 0, max: 1, noNaN: true }),
                y: fc.float({ min: 0, max: 1, noNaN: true }),
                label: fc.constant('N'),
                layerId: fc.constantFrom(...layerIds, 'ghost-layer'),
                locationId: fc.constant('secret-location'),
              }),
            ),
          ),
        ),
        edges: fc.array(
          fc.record({
            id: fc.uuid(),
            fromNodeId: fc.constantFrom(...nodeIds),
            toNodeId: fc.constantFrom(...nodeIds),
            layerId: fc.constantFrom(...layerIds, 'ghost-layer'),
            label: fc.option(fc.constant('road'), { nil: undefined }),
            travelTimeDays: fc.constant(7),
            hazardous: fc.option(fc.boolean(), { nil: undefined }),
          }),
          { maxLength: 5 },
        ),
      }),
    }) as fc.Arbitrary<CampaignMap>;
  });
}

const RUNS = { numRuns: 300 } as const;

describe('map redaction invariant (property-based)', () => {
  it('M1–M5 — only visible layers, on-layer features, GM fields stripped', () => {
    fc.assert(
      fc.property(fc.array(mapArb(), { maxLength: 4 }), (maps) => {
        const projected = projectPlayerMaps(maps as CampaignMap[]);

        for (const pm of projected) {
          const src = maps.find((m) => m.id === pm.id)!;
          const visibleIds = new Set(src.layers.filter((l) => l.visibleToPlayers).map((l) => l.id));

          // M5: a projected map always has at least one visible layer.
          expect(visibleIds.size).toBeGreaterThan(0);

          // M1: every output layer was visibleToPlayers and carries no GM keys.
          for (const l of pm.layers) {
            expect(visibleIds.has(l.id)).toBe(true);
            for (const k of Object.keys(l)) expect(ALLOWED_LAYER_KEYS).toContain(k);
          }

          // M2: markers only on visible layers; GM fields stripped.
          for (const mk of pm.markers) {
            expect(visibleIds.has(mk.layerId)).toBe(true);
            for (const k of Object.keys(mk)) expect(ALLOWED_MARKER_KEYS).toContain(k);
          }

          // M3: nodes only on visible layers; no FK links.
          const nodeIds = new Set(pm.nodes.map((n) => n.id));
          for (const n of pm.nodes) {
            expect(visibleIds.has(n.layerId)).toBe(true);
            for (const k of Object.keys(n)) expect(ALLOWED_NODE_KEYS).toContain(k);
          }

          // M4: edges only on visible layers, both endpoints visible, no travel time.
          for (const ed of pm.edges) {
            expect(visibleIds.has(ed.layerId)).toBe(true);
            expect(nodeIds.has(ed.fromNodeId)).toBe(true);
            expect(nodeIds.has(ed.toNodeId)).toBe(true);
            for (const k of Object.keys(ed)) expect(ALLOWED_EDGE_KEYS).toContain(k);
          }
        }

        // M5 (contrapositive): a source map with no visible layer is omitted.
        for (const m of maps) {
          const hasVisible = m.layers.some((l) => l.visibleToPlayers);
          if (!hasVisible) {
            expect(projected.find((p) => p.id === m.id)).toBeUndefined();
          }
        }
      }),
      RUNS,
    );
  });
});
