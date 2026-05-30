// Reusable fast-check generators for the redaction-invariant property suite
// (redaction.property.test.ts) and the CRDT merge-preserves-visibility property
// (lib/crdt/__tests__/writeback-merge.property.test.ts).
//
// The generators produce *adversarial* PlayerModeData: entities carrying a mix
// of known-public, known-private, structural, and unknown fields; entity
// visibility records spanning private/party/custom with arbitrary field
// overrides; PCs with random ownership; relationships between random (often
// hidden or dangling) endpoints; and a multi-slot roster. Feeding this to the
// real projection is the whole point — it exercises the security boundary
// across the leak vectors enumerated in Checkpoint 0 (nesting, partial reveals,
// the PC-ownership bypass, mismatched-visibility edges).

import fc from 'fast-check';
import { DEFAULT_FIELD_VISIBILITY } from '../fieldDefaults';
import {
  PLAYER_ENTITY_TYPES,
  type EntityVisibility,
  type FieldPrivacy,
  type FieldPrivacyMap,
  type PlayerConfig,
  type PlayerEntity,
  type PlayerEntityType,
  type PlayerModeData,
  type RosterSlot,
} from '../types';

// Structural keys the projection must never surface as content (projection.ts
// STRUCTURAL_FIELDS). We deliberately sprinkle these onto entities so a
// property can assert they never leak even when an override marks them public.
export const STRUCTURAL_KEYS = [
  'isSidekick', 'sidekickClass', 'sidekickSpellList', 'sidekickBase',
  'sidekickLevel', 'gestalt', 'pointBuy', 'isPublic',
] as const;

// Per type: a candidate field pool combining the canonical schema keys (a mix
// of public + private defaults) with unknown keys (fail-closed → private) and
// structural keys (never content). Each generated entity carries a random
// subset; the value encodes the field name so a leak is self-identifying.
function fieldPoolFor(type: PlayerEntityType): string[] {
  const schemaKeys = Object.keys(DEFAULT_FIELD_VISIBILITY[type]);
  return [...schemaKeys, 'unknownSecretA', 'unknownSecretB', ...STRUCTURAL_KEYS];
}

// Independent oracle mirroring resolveVisibility.resolveFieldPrivacy: an
// override wins over the type default; anything unspecified is private. Kept
// local (not imported) so the property checks the security property rather
// than re-asserting the projection's own helper against itself.
export function expectedFieldPrivacy(
  type: PlayerEntityType,
  field: string,
  overrides: FieldPrivacyMap | undefined,
): FieldPrivacy {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, field)) {
    return overrides[field];
  }
  const def = (DEFAULT_FIELD_VISIBILITY[type] as Record<string, FieldPrivacy>)[field];
  return def ?? 'private';
}

const slotIdArb = (n: number) => `slot-${n}`;

// A roster of 1..4 slots.
function rosterArb(): fc.Arbitrary<RosterSlot[]> {
  return fc.integer({ min: 1, max: 4 }).map((count) =>
    Array.from({ length: count }, (_v, i) => ({
      slotId: slotIdArb(i),
      displayName: `Player ${i}`,
    })),
  );
}

// A field-override map: a random subset of an entity's field pool flipped to an
// explicit public/private. This is the partial-reveal vector.
function fieldOverridesArb(type: PlayerEntityType): fc.Arbitrary<FieldPrivacyMap | undefined> {
  const pool = fieldPoolFor(type);
  return fc.option(
    fc.dictionary(
      fc.constantFrom(...pool),
      fc.constantFrom<FieldPrivacy>('public', 'private'),
    ),
    { nil: undefined },
  );
}

// An entity-visibility record over the roster slot ids.
function entityVisibilityArb(
  type: PlayerEntityType,
  slotIds: string[],
): fc.Arbitrary<EntityVisibility> {
  return fc.record({
    mode: fc.constantFrom<'private' | 'party' | 'custom'>('private', 'party', 'custom'),
    allowedSlotIds: fc.subarray(slotIds),
    fieldOverrides: fieldOverridesArb(type),
  });
}

// One entity: a stable id plus a random subset of its field pool. Values encode
// the field name so any leak is traceable to its source field.
function entityArb(type: PlayerEntityType, id: string): fc.Arbitrary<PlayerEntity> {
  const pool = fieldPoolFor(type);
  return fc.subarray(pool, { minLength: 0 }).map((fields) => {
    const e: PlayerEntity = { id };
    for (const f of fields) {
      // structural booleans stay boolean; everything else a tagged string.
      e[f] = (STRUCTURAL_KEYS as readonly string[]).includes(f)
        ? true
        : `${type}:${id}:${f}`;
    }
    return e;
  });
}

// PC ownership: either unowned, owned by a roster slot, or owned by a phantom
// slot not in the roster — so the property can prove the bypass is scoped.
function ownershipArb(slotIds: string[]): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.constant(undefined),
    fc.constant({ ownerType: 'gm' }),
    fc.constantFrom(...slotIds, 'phantom-slot').map((sid) => ({
      ownerType: 'player',
      playerSlotId: sid,
    })),
  );
}

const EDGE_TYPES = ['pc', 'npc', 'location', 'faction', 'factionClock', 'secret', 'monster'] as const;
const EDGE_KINDS = ['allyOf', 'enemyOf', 'memberOf', 'knows', 'locatedAt', 'related'] as const;

function relationshipArb(entityIds: string[], slotIds: string[]): fc.Arbitrary<Record<string, unknown>> {
  const idArb = entityIds.length ? fc.constantFrom(...entityIds) : fc.constant('ghost');
  return fc.record({
    id: fc.uuid(),
    fromType: fc.constantFrom(...EDGE_TYPES),
    fromId: idArb,
    toType: fc.constantFrom(...EDGE_TYPES),
    toId: idArb,
    kind: fc.constantFrom(...EDGE_KINDS),
    visibility: fc.constantFrom('private', 'party', 'custom'),
    customVisibleTo: fc.subarray(slotIds),
    notes: fc.constant('GM-ONLY-EDGE-NOTES'),
    weight: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
    suggested: fc.option(fc.boolean(), { nil: undefined }),
    proposed: fc.option(fc.boolean(), { nil: undefined }),
  });
}

export type ArbCampaign = {
  data: PlayerModeData;
  slotIds: string[];
  // A slot id NOT in the roster, for negative tests.
  outsiderSlotId: string;
};

// The headline generator: an arbitrary campaign + the slot ids in its roster.
export function arbCampaign(): fc.Arbitrary<ArbCampaign> {
  return rosterArb().chain((roster) => {
    const slotIds = roster.map((s) => s.slotId);

    // Per-type: 0..4 entities with shared ids drawn from a small pool so edges
    // and cross-type id collisions (the characters/pcs → 'pc' keyspace) occur.
    const idPool = ['e0', 'e1', 'e2', 'e3'];

    const perTypeArbs = PLAYER_ENTITY_TYPES.map((type) =>
      fc
        .subarray(idPool, { minLength: 0 })
        .chain((ids) =>
          fc.tuple(
            ...ids.map((id) =>
              type === 'pcs'
                ? fc
                    .tuple(entityArb(type, id), ownershipArb(slotIds))
                    .map(([e, ownership]) =>
                      ownership ? ({ ...e, ownership } as PlayerEntity) : e,
                    )
                : entityArb(type, id),
            ),
          ),
        )
        .map((entities) => ({ type, entities: entities as PlayerEntity[] })),
    );

    return fc.tuple(...perTypeArbs).chain((perType) => {
      const allIds = Array.from(new Set(perType.flatMap((p) => p.entities.map((e) => e.id))));

      // Visibility config for a random subset of (type,id) pairs. Pairs left
      // unconfigured exercise the fail-closed default.
      const visibilityEntries = perType.flatMap((p) =>
        p.entities.map((e) =>
          fc
            .option(entityVisibilityArb(p.type, slotIds), { nil: undefined })
            .map((vis) => ({ type: p.type, id: e.id, vis })),
        ),
      );

      const relsArb = fc.array(relationshipArb(allIds, slotIds), { maxLength: 6 });

      const logArb = fc.array(
        fc.record({
          id: fc.uuid(),
          text: fc.string(),
          secretNote: fc.constant('LOG-INTERNAL'),
          visibility: fc.option(
            fc.record({
              mode: fc.constantFrom<'private' | 'party' | 'custom'>('private', 'party', 'custom'),
              allowedSlotIds: fc.subarray(slotIds),
            }),
            { nil: undefined },
          ),
        }),
        { maxLength: 5 },
      );

      return fc.tuple(fc.tuple(...visibilityEntries), relsArb, logArb).map(
        ([visEntries, relationships, playerLog]) => {
          const entityVisibility: PlayerConfig['entityVisibility'] = {};
          for (const { type, id, vis } of visEntries) {
            if (!vis) continue;
            (entityVisibility[type] ??= {})[id] = vis;
          }

          const config: PlayerConfig = {
            shareToken: 'token-token-token-1234',
            tokenVersion: 1,
            roster,
            fieldDefaults: DEFAULT_FIELD_VISIBILITY,
            entityVisibility,
          };

          const data: PlayerModeData = { player: config } as PlayerModeData;
          for (const { type, entities } of perType) {
            (data as Record<string, unknown>)[type] = entities;
          }
          (data as Record<string, unknown>).relationships = relationships;
          (data as Record<string, unknown>).playerLog = playerLog;

          return { data, slotIds, outsiderSlotId: 'outsider-not-in-roster' };
        },
      );
    });
  });
}

// Convenience: a campaign together with one of its (or an outsider) slot ids.
export function arbCampaignAndSlot(): fc.Arbitrary<{ camp: ArbCampaign; slotId: string }> {
  return arbCampaign().chain((camp) =>
    fc
      .constantFrom(...camp.slotIds, camp.outsiderSlotId)
      .map((slotId) => ({ camp, slotId })),
  );
}
