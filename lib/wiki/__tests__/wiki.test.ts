import { describe, it, expect } from 'vitest';
import { validTargets, validKinds } from '@/lib/wiki/catalog';
import { buildEntityIndex, stableStringId, findEntity } from '@/lib/wiki/entities';
import { relationshipsFor } from '@/lib/wiki/lookup';
import {
  createRelationship,
  relationshipExists,
  acceptSuggestion,
  rejectSuggestion,
} from '@/lib/wiki/relationships';
import {
  scanTextForSuggestions,
  pruneExpiredSuggestions,
  THIRTY_DAYS_MS,
} from '@/lib/wiki/suggest';
import { extractAllMentions } from '@/lib/wiki/mentions';
import type { Relationship } from '@/lib/wiki/types';

describe('catalog', () => {
  it('filters valid targets by from-type and kind', () => {
    expect(validTargets('npc', 'memberOf')).toEqual(['faction']);
    // pc cannot lead a faction, so leaderOf is invalid from pc
    expect(validTargets('pc', 'leaderOf')).toEqual([]);
  });

  it('lists kinds valid for a from-type', () => {
    expect(validKinds('npc')).toContain('memberOf');
    expect(validKinds('npc')).toContain('knows');
    // factions are not members of factions
    expect(validKinds('faction')).not.toContain('memberOf');
  });
});

describe('entity index', () => {
  const data = {
    npcs: [{ id: 'npc-inka', name: 'Inka', goal: 'find the ledger' }],
    factions: [{ id: 'fac-wells', name: 'The Wells Guard' }],
    locations: [{ id: 'loc-pier', name: 'Old Salt Pier', aspects: ['briny', 'rotting'] }],
    secrets: ['The mayor is a doppelganger.', 'The mayor is a doppelganger.'],
    monsters: ['Sahuagin — CR 1/2'],
    items: [{ id: 'it-1', name: 'Tidecaller Horn' }, 'Bag of Rats'],
  };

  it('indexes object and string entities with stable ids', () => {
    const idx = buildEntityIndex(data);
    expect(findEntity(idx, 'npc', 'npc-inka')?.name).toBe('Inka');
    expect(findEntity(idx, 'faction', 'fac-wells')?.name).toBe('The Wells Guard');
    const secretId = stableStringId('The mayor is a doppelganger.');
    expect(findEntity(idx, 'secret', secretId)).toBeTruthy();
  });

  it('dedupes identical string entities', () => {
    const idx = buildEntityIndex(data);
    const secrets = idx.entities.filter((e) => e.type === 'secret');
    expect(secrets).toHaveLength(1);
  });

  it('handles both object and string magic items', () => {
    const idx = buildEntityIndex(data);
    const items = idx.entities.filter((e) => e.type === 'magicItem').map((e) => e.name);
    expect(items).toContain('Tidecaller Horn');
    expect(items).toContain('Bag of Rats');
  });
});

describe('symmetric-aware lookup', () => {
  it('shows the inverse label on the target side of an asymmetric link', () => {
    const rels: Relationship[] = [
      createRelationship(
        { type: 'npc', id: 'npc-inka' },
        { type: 'faction', id: 'fac-wells' },
        'memberOf',
      ),
    ];
    const fromSide = relationshipsFor('npc', 'npc-inka', rels);
    expect(fromSide[0].label).toBe('Member of');
    expect(fromSide[0].otherId).toBe('fac-wells');

    const toSide = relationshipsFor('faction', 'fac-wells', rels);
    expect(toSide[0].label).toBe('Has member');
    expect(toSide[0].otherId).toBe('npc-inka');
  });

  it('shows the same label on both sides of a symmetric link', () => {
    const rels: Relationship[] = [
      createRelationship({ type: 'faction', id: 'a' }, { type: 'faction', id: 'b' }, 'allyOf'),
    ];
    expect(relationshipsFor('faction', 'a', rels)[0].label).toBe('Ally of');
    expect(relationshipsFor('faction', 'b', rels)[0].label).toBe('Ally of');
  });
});

describe('relationship helpers', () => {
  it('detects an existing link in either direction', () => {
    const rels = [
      createRelationship({ type: 'npc', id: 'x' }, { type: 'npc', id: 'y' }, 'related'),
    ];
    expect(
      relationshipExists(rels, { type: 'npc', id: 'x' }, { type: 'npc', id: 'y' }, 'related'),
    ).toBe(true);
    expect(
      relationshipExists(rels, { type: 'npc', id: 'y' }, { type: 'npc', id: 'x' }, 'related'),
    ).toBe(true);
    expect(
      relationshipExists(rels, { type: 'npc', id: 'x' }, { type: 'npc', id: 'y' }, 'allyOf'),
    ).toBe(false);
  });

  it('accept clears the suggested flag; reject removes the link', () => {
    const sug: Relationship = {
      ...createRelationship({ type: 'npc', id: 'x' }, { type: 'npc', id: 'y' }, 'related'),
      suggested: true,
    };
    const accepted = acceptSuggestion([sug], sug.id);
    expect(accepted[0].suggested).toBe(false);
    expect(rejectSuggestion([sug], sug.id)).toHaveLength(0);
  });
});

describe('mention extraction', () => {
  const idx = buildEntityIndex({
    npcs: [{ id: 'npc-inka', name: 'Inka' }],
    locations: [{ id: 'loc-pier', name: 'Salt Pier' }],
  });

  it('resolves bare and trailing-word mentions', () => {
    const hits = extractAllMentions('@Inka was found at @Salt Pier at dawn.', idx);
    const names = hits.map((h) => h.name);
    expect(names).toContain('Inka');
    expect(names).toContain('Salt Pier');
  });

  it('resolves quoted mentions', () => {
    const hits = extractAllMentions('We met @"Salt Pier" again.', idx);
    expect(hits.map((h) => h.id)).toContain('loc-pier');
  });
});

describe('suggestion scanner', () => {
  const idx = buildEntityIndex({
    npcs: [
      { id: 'npc-inka', name: 'Inka' },
      { id: 'npc-stranger', name: 'Stranger' },
    ],
    locations: [{ id: 'loc-pier', name: 'Salt Pier' }],
  });

  it('proposes locatedAt for an NPC seen with a location', () => {
    const found = scanTextForSuggestions('@Inka met @Stranger at @Salt Pier.', idx, []);
    const located = found.find((r) => r.kind === 'locatedAt');
    expect(located).toBeTruthy();
    expect(located!.suggested).toBe(true);
    // NPC↔NPC co-mention becomes a generic related link
    expect(found.some((r) => r.kind === 'related')).toBe(true);
  });

  it('does not re-propose an existing relationship', () => {
    const existing = [
      createRelationship(
        { type: 'npc', id: 'npc-inka' },
        { type: 'location', id: 'loc-pier' },
        'locatedAt',
      ),
    ];
    const found = scanTextForSuggestions('@Inka at @Salt Pier.', idx, existing);
    expect(found.some((r) => r.kind === 'locatedAt')).toBe(false);
  });

  it('prunes suggestions older than 30 days but keeps confirmed links', () => {
    const old: Relationship = {
      ...createRelationship({ type: 'npc', id: 'a' }, { type: 'npc', id: 'b' }, 'related'),
      suggested: true,
      createdAt: Date.now() - THIRTY_DAYS_MS - 1000,
    };
    const confirmedOld: Relationship = {
      ...createRelationship({ type: 'npc', id: 'c' }, { type: 'npc', id: 'd' }, 'related'),
      createdAt: Date.now() - THIRTY_DAYS_MS - 1000,
    };
    const { relationships, changed } = pruneExpiredSuggestions([old, confirmedOld]);
    expect(changed).toBe(true);
    expect(relationships).toHaveLength(1);
    expect(relationships[0].fromId).toBe('c');
  });
});
