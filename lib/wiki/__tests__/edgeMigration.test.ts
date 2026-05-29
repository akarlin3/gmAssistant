import { describe, it, expect } from 'vitest';
import { migrateImpliedEdges } from '../edgeMigration';
import type { Relationship } from '../types';

function baseData() {
  return {
    factions: [
      { id: 'f-crown', name: 'The Crown' },
      { id: 'f-thieves', name: 'Thieves Guild' },
    ],
    npcs: [
      { id: 'n1', name: 'Sera', faction: 'The Crown' },
      { id: 'n2', name: 'Vex', faction: 'thieves guild' }, // case-insensitive match
      { id: 'n3', name: 'Loner' }, // no faction
    ],
    clocks: [
      { id: 'c1', text: 'Coup', faction: 'The Crown' },
    ],
  } as Record<string, any>;
}

describe('migrateImpliedEdges', () => {
  it('derives memberOf edges from npc.faction and related edges from clock.faction', () => {
    const { relationships, stats, changed } = migrateImpliedEdges(baseData(), 1000);
    expect(changed).toBe(true);
    // 2 npc memberships + 1 clock relation
    expect(stats.edgesCreated).toBe(3);
    expect(stats.entitiesScanned).toBe(3); // n1, n2 (npcs w/ faction) + c1 (clock)
    expect(stats.ambiguousSkipped).toBe(0);

    const membership = relationships.find(
      (r) => r.fromType === 'npc' && r.fromId === 'n1' && r.kind === 'memberOf',
    );
    expect(membership?.toType).toBe('faction');
    expect(membership?.toId).toBe('f-crown');
    expect(membership?.visibility).toBe('private'); // fail-closed default
    expect(membership?.updatedAt).toBe(1000);

    expect(
      relationships.some(
        (r) => r.fromType === 'factionClock' && r.fromId === 'c1' && r.kind === 'related',
      ),
    ).toBe(true);
  });

  it('is idempotent — re-running adds nothing and returns the same array reference', () => {
    const data = baseData();
    const first = migrateImpliedEdges(data, 1000);
    const data2 = { ...data, relationships: first.relationships };
    const second = migrateImpliedEdges(data2, 2000);
    expect(second.changed).toBe(false);
    expect(second.stats.edgesCreated).toBe(0);
    expect(second.relationships).toBe(first.relationships); // unchanged ref
  });

  it('does not duplicate an edge that already exists (even flipped/manual)', () => {
    const existing: Relationship[] = [
      { id: 'manual', fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'f-crown', kind: 'memberOf', createdAt: 0 },
    ];
    const data = { ...baseData(), relationships: existing };
    const { stats } = migrateImpliedEdges(data, 1000);
    // n1's membership already present → only n2 + clock are new
    expect(stats.edgesCreated).toBe(2);
  });

  it('counts unresolved / blank-id references as ambiguous, not edges', () => {
    const data = {
      factions: [
        { id: 'dup', name: 'Twins' },
        { id: 'dup2', name: 'Twins' }, // duplicate name → ambiguous
      ],
      npcs: [
        { id: 'n1', name: 'A', faction: 'Nonexistent' }, // unknown faction
        { id: 'n2', name: 'B', faction: 'Twins' }, // ambiguous (dup name)
        { name: 'NoId', faction: 'Twins' }, // missing npc id
      ],
    } as Record<string, any>;
    const { stats, changed } = migrateImpliedEdges(data, 1000);
    expect(changed).toBe(false);
    expect(stats.edgesCreated).toBe(0);
    expect(stats.ambiguousSkipped).toBe(3);
  });

  it('handles empty / missing data without throwing', () => {
    expect(migrateImpliedEdges(null).stats.edgesCreated).toBe(0);
    expect(migrateImpliedEdges({}).changed).toBe(false);
  });
});
