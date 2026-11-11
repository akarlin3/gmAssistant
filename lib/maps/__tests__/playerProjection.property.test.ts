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

  it('M6–M9 — unrevealed fog regions, private map tokens, trap pins, and GM map notes NEVER appear in player projections', () => {
    const ALLOWED_TOKEN_KEYS = new Set(['id', 'label', 'x', 'y', 'size', 'color', 'pcId', 'icon', 'visibility']);
    const ALLOWED_FOG_KEYS = new Set(['id', 'shape', 'x', 'y', 'width', 'height', 'radius', 'w', 'h', 'r', 'points', 'label', 'revealed']);

    const vttMapArb = mapArb().chain((baseMap) =>
      fc.record({
        tokens: fc.array(
          fc.record({
            id: fc.uuid(),
            label: fc.constantFrom('Party Hero', 'SECRET_ASSASSIN_TOKEN'),
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
            size: fc.constantFrom(1, 1.5, 2),
            color: fc.constant('#ef4444'),
            pcId: fc.option(fc.constant('pc-1'), { nil: undefined }),
            visibility: fc.constantFrom<'private' | 'party'>('private', 'party'),
            gmNotes: fc.constant('GM_SECRET_TOKEN_NOTE'),
            entityId: fc.constant('secret-monster-id'),
          }),
          { maxLength: 6 },
        ),
        fogRevealedRegions: fc.array(
          fc.record({
            id: fc.uuid(),
            shape: fc.constantFrom<'rect' | 'brush' | 'polygon'>('rect', 'brush', 'polygon'),
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
            width: fc.double({ min: 0.05, max: 0.5, noNaN: true }),
            height: fc.double({ min: 0.05, max: 0.5, noNaN: true }),
            radius: fc.double({ min: 0.05, max: 0.3, noNaN: true }),
            label: fc.constantFrom('Entry Hall', 'UNREVEALED_VAULT_ROOM'),
            gmNotes: fc.constant('GM_SECRET_FOG_ROOM_NOTE'),
            revealed: fc.boolean(),
          }),
          { maxLength: 6 },
        ),
        traps: fc.array(
          fc.record({
            id: fc.uuid(),
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
            label: fc.constant('DEADLY_POISON_NEEDLE_TRAP'),
            dc: fc.constant(18),
            damage: fc.constant('4d10 poison'),
            notes: fc.constant('GM_TRAP_SECRET_TRIGGER'),
            triggered: fc.boolean(),
          }),
          { maxLength: 4 },
        ),
        gmMapNotes: fc.constant('GM_SECRET_DUNGEON_KEY_NOTES'),
        fogEnabled: fc.boolean(),
      }).map((extra) => ({
        ...baseMap,
        ...extra,
      })),
    );

    fc.assert(
      fc.property(fc.array(vttMapArb, { maxLength: 4 }), (maps) => {
        const projected = projectPlayerMaps(maps as CampaignMap[]);
        const serialized = JSON.stringify(projected);

        // GM map notes, trap pins, and secret token/fog notes must never appear anywhere in output JSON
        expect(serialized).not.toContain('GM_SECRET_DUNGEON_KEY_NOTES');
        expect(serialized).not.toContain('DEADLY_POISON_NEEDLE_TRAP');
        expect(serialized).not.toContain('GM_TRAP_SECRET_TRIGGER');
        expect(serialized).not.toContain('GM_SECRET_TOKEN_NOTE');
        expect(serialized).not.toContain('GM_SECRET_FOG_ROOM_NOTE');
        expect(serialized).not.toContain('secret-monster-id');

        for (const pm of projected) {
          const src = maps.find((m) => m.id === pm.id)!;

          // M6: No traps or gmMapNotes property on projected map
          expect(pm).not.toHaveProperty('traps');
          expect(pm).not.toHaveProperty('trapPins');
          expect(pm).not.toHaveProperty('gmMapNotes');
          expect(pm).not.toHaveProperty('gmNotes');

          // M7: Every projected token must have had visibility === 'party' in source, and only allowed keys survive
          const srcTokensById = new Map((src.tokens ?? []).map((t) => [t.id, t]));
          for (const tk of pm.tokens ?? []) {
            const orig = srcTokensById.get(tk.id);
            expect(orig).toBeDefined();
            expect(orig!.visibility).toBe('party');
            for (const k of Object.keys(tk)) {
              expect(ALLOWED_TOKEN_KEYS.has(k)).toBe(true);
            }
          }
          // Every private token from source is absent
          for (const orig of src.tokens ?? []) {
            if (orig.visibility !== 'party') {
              expect((pm.tokens ?? []).find((t) => t.id === orig.id)).toBeUndefined();
            }
          }

          // M8: Every projected fog region must have had revealed === true in source, and only allowed keys survive
          const srcFogById = new Map((src.fogRevealedRegions ?? []).map((f) => [f.id, f]));
          for (const fg of pm.fogRevealedRegions ?? []) {
            const orig = srcFogById.get(fg.id);
            expect(orig).toBeDefined();
            expect(orig!.revealed).toBe(true);
            for (const k of Object.keys(fg)) {
              expect(ALLOWED_FOG_KEYS.has(k)).toBe(true);
            }
          }
          // Every unrevealed fog region from source is absent
          for (const orig of src.fogRevealedRegions ?? []) {
            if (orig.revealed !== true) {
              expect((pm.fogRevealedRegions ?? []).find((f) => f.id === orig.id)).toBeUndefined();
            }
          }
        }
      }),
      RUNS,
    );
  });

  it('M10 — live player map pings preserve { id, pcId, x, y, color, timestamp }, clamp [0, 1], and strip secret keys', () => {
    const ALLOWED_PING_KEYS = new Set(['id', 'pcId', 'x', 'y', 'color', 'timestamp']);
    fc.assert(
      fc.property(
        mapArb(),
        fc.array(
          fc.record({
            id: fc.uuid(),
            pcId: fc.constantFrom('pc-1', 'pc-2'),
            x: fc.double({ min: -0.5, max: 1.5, noNaN: true }),
            y: fc.double({ min: -0.5, max: 1.5, noNaN: true }),
            color: fc.constant('#38bdf8'),
            timestamp: fc.integer({ min: 1000, max: 999999 }),
            gmSecretPingNote: fc.constant('SECRET_GM_PING_METADATA'),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (baseMap, rawPings) => {
          const mapWithVisibleLayer: CampaignMap = {
            ...baseMap,
            layers: baseMap.layers.map((l, idx) =>
              idx === 0 ? { ...l, visibleToPlayers: true } : l,
            ),
            pings: rawPings as any,
          };

          const projected = projectPlayerMaps({
            maps: [mapWithVisibleLayer],
            pcs: [
              {
                id: 'pc-1',
                mapPing: {
                  id: 'wb-ping-1',
                  mapId: mapWithVisibleLayer.id,
                  pcId: 'pc-1',
                  x: 0.42,
                  y: 0.73,
                  color: '#10b981',
                  timestamp: 55555,
                  secretExtra: 'STRIP_ME',
                },
              },
            ],
          });

          expect(projected).toHaveLength(1);
          const json = JSON.stringify(projected);
          expect(json).not.toContain('SECRET_GM_PING_METADATA');
          expect(json).not.toContain('STRIP_ME');

          for (const ping of projected[0].pings ?? []) {
            for (const k of Object.keys(ping)) {
              expect(ALLOWED_PING_KEYS.has(k)).toBe(true);
            }
            expect(typeof ping.id).toBe('string');
            expect(ping.id.length).toBeGreaterThan(0);
            expect(ping.x).toBeGreaterThanOrEqual(0);
            expect(ping.x).toBeLessThanOrEqual(1);
            expect(ping.y).toBeGreaterThanOrEqual(0);
            expect(ping.y).toBeLessThanOrEqual(1);
          }
        },
      ),
      RUNS,
    );
  });
});

