import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

type IndexField = { fieldPath: string; order?: string };
type CompositeIndex = { collectionGroup: string; fields: IndexField[] };

function loadIndexes(): CompositeIndex[] {
  const raw = readFileSync(path.join(repoRoot, 'firestore.indexes.json'), 'utf8');
  return JSON.parse(raw).indexes as CompositeIndex[];
}

// Both the campaigns list and the worlds list run
//   where('userId','==',uid) + orderBy('updatedAt','desc')
// which Firestore can only serve with a (userId ASC, updatedAt DESC) composite
// index. A missing worlds index threw "The query requires an index" and wedged
// the campaign list / delete flow (B-01 / B-02).
function hasUserIdUpdatedAtIndex(indexes: CompositeIndex[], collectionGroup: string): boolean {
  return indexes.some((idx) => {
    if (idx.collectionGroup !== collectionGroup) return false;
    const userId = idx.fields.find((f) => f.fieldPath === 'userId');
    const updatedAt = idx.fields.find((f) => f.fieldPath === 'updatedAt');
    return userId?.order === 'ASCENDING' && updatedAt?.order === 'DESCENDING';
  });
}

describe('firestore composite indexes (B-01)', () => {
  test('worlds collection has a userId ASC / updatedAt DESC index', () => {
    assert.ok(hasUserIdUpdatedAtIndex(loadIndexes(), 'worlds'));
  });

  test('campaigns collection still has its userId ASC / updatedAt DESC index', () => {
    assert.ok(hasUserIdUpdatedAtIndex(loadIndexes(), 'campaigns'));
  });
});
