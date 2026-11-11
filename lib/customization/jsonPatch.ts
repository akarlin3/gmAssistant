// Deterministic RFC 6902 JSON Patch & Structured Key-Value Diff Engine
// (`lib/customization/jsonPatch.ts`)
//
// Guarantees:
// 1. Pure & non-destructive: never mutates `before` or `after` inputs.
// 2. Deterministic ordering: object keys are traversed in canonical lexicographic order.
// 3. Prototype-pollution safe: rejects `__proto__`, `constructor`, and `prototype` segments.
// 4. Reversible: `invertJsonPatch(before, ops)` produces an exact rollback patch.

export type JsonPatchOpType = 'add' | 'replace' | 'remove';

export interface JsonPatchOp {
  op: JsonPatchOpType;
  path: string;
  value?: unknown;
}

export interface KeyValueDiffEntry {
  path: string;
  label: string;
  previousValue: unknown;
  proposedValue: unknown;
  /** Canonical human-readable diff token: `[previous_value -> proposed_value]` */
  formatted: string;
}

const FORBIDDEN_POINTER_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export function escapeJsonPointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapeJsonPointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function splitJsonPointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new Error(`Invalid RFC 6901 JSON Pointer "${pointer}": must start with "/" or be empty.`);
  }
  const segments = pointer.slice(1).split('/').map(unescapeJsonPointer);
  for (const seg of segments) {
    if (FORBIDDEN_POINTER_SEGMENTS.has(seg)) {
      throw new Error(`Forbidden prototype-pollution segment "${seg}" in JSON Pointer.`);
    }
  }
  return segments;
}

export function deepCloneJson<T>(val: T): T {
  if (val === undefined || val === null || typeof val !== 'object') {
    return val;
  }
  return JSON.parse(JSON.stringify(val)) as T;
}

export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualJson(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA)
    .filter((k) => objA[k] !== undefined && !FORBIDDEN_POINTER_SEGMENTS.has(k))
    .sort();
  const keysB = Object.keys(objB)
    .filter((k) => objB[k] !== undefined && !FORBIDDEN_POINTER_SEGMENTS.has(k))
    .sort();

  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (!deepEqualJson(objA[keysA[i]], objB[keysB[i]])) return false;
  }
  return true;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Generates a deterministic RFC 6902 JSON Patch (`add` | `replace` | `remove`)
 * transforming `before` into `after`.
 */
export function computeJsonPatch(before: unknown, after: unknown, basePath = ''): JsonPatchOp[] {
  if (deepEqualJson(before, after)) {
    return [];
  }

  // Array handling: emit element-level replace/add/remove so non-destructive list appends
  // produce clean `/houseRules/2` `add` operations rather than replacing the entire array.
  if (Array.isArray(before) && Array.isArray(after)) {
    const ops: JsonPatchOp[] = [];
    const minLen = Math.min(before.length, after.length);
    for (let i = 0; i < minLen; i++) {
      const elemPath = `${basePath}/${i}`;
      if (!deepEqualJson(before[i], after[i])) {
        if (isPlainObject(before[i]) && isPlainObject(after[i])) {
          const prevId = (before[i] as Record<string, unknown>).id ?? (before[i] as Record<string, unknown>).key;
          const nextId = (after[i] as Record<string, unknown>).id ?? (after[i] as Record<string, unknown>).key;
          if (prevId !== undefined && prevId === nextId) {
            ops.push(...computeJsonPatch(before[i], after[i], elemPath));
            continue;
          }
        }
        ops.push({
          op: 'replace',
          path: elemPath,
          value: deepCloneJson(after[i]),
        });
      }
    }
    if (after.length > before.length) {
      for (let i = before.length; i < after.length; i++) {
        ops.push({
          op: 'add',
          path: `${basePath}/${i}`,
          value: deepCloneJson(after[i]),
        });
      }
    } else if (before.length > after.length) {
      // Remove from highest index downward so indices remain valid during sequential RFC 6902 application!
      for (let i = before.length - 1; i >= after.length; i--) {
        ops.push({
          op: 'remove',
          path: `${basePath}/${i}`,
        });
      }
    }
    return ops;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const ops: JsonPatchOp[] = [];
    const allKeys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)]),
    )
      .filter((k) => !FORBIDDEN_POINTER_SEGMENTS.has(k))
      .sort();

    for (const key of allKeys) {
      const hasPrev = Object.prototype.hasOwnProperty.call(before, key) && before[key] !== undefined;
      const hasNext = Object.prototype.hasOwnProperty.call(after, key) && after[key] !== undefined;
      const childPath = `${basePath}/${escapeJsonPointer(key)}`;

      if (!hasPrev && hasNext) {
        ops.push({
          op: 'add',
          path: childPath,
          value: deepCloneJson(after[key]),
        });
      } else if (hasPrev && !hasNext) {
        ops.push({
          op: 'remove',
          path: childPath,
        });
      } else if (hasPrev && hasNext && !deepEqualJson(before[key], after[key])) {
        ops.push(...computeJsonPatch(before[key], after[key], childPath));
      }
    }
    return ops;
  }

  return [
    {
      op: before === undefined ? 'add' : 'replace',
      path: basePath || '/',
      value: deepCloneJson(after),
    },
  ];
}

export function getValueAtPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '') return doc;
  const segments = splitJsonPointer(pointer);
  let cur: any = doc;
  for (const seg of segments) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else {
      cur = cur[seg];
    }
  }
  return cur;
}

/**
 * Applies an RFC 6902 JSON Patch deterministically on a deep clone of `base`.
 * Never mutates `base` in place.
 */
export function applyJsonPatch<T>(base: T, patch: readonly JsonPatchOp[]): T {
  let root: any = deepCloneJson(base);

  for (const op of patch) {
    if (op.path === '' || op.path === '/') {
      if (op.op === 'add' || op.op === 'replace') {
        root = deepCloneJson(op.value);
        continue;
      }
      throw new Error('Cannot remove root document in JSON Patch.');
    }

    const segments = splitJsonPointer(op.path);
    const lastSeg = segments[segments.length - 1];
    let parent: any = root;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (parent === null || parent === undefined || typeof parent !== 'object') {
        throw new Error(`Invalid JSON Patch path "${op.path}": parent at "${seg}" is not an object.`);
      }
      parent = Array.isArray(parent) ? parent[Number(seg)] : parent[seg];
    }

    if (parent === null || parent === undefined || typeof parent !== 'object') {
      throw new Error(`Invalid JSON Patch target parent for "${op.path}".`);
    }

    if (Array.isArray(parent)) {
      if (lastSeg === '-') {
        if (op.op !== 'add') {
          throw new Error(`"-" index is only valid for "add" operation at "${op.path}".`);
        }
        parent.push(deepCloneJson(op.value));
        continue;
      }
      const idx = Number(lastSeg);
      if (!Number.isInteger(idx) || idx < 0) {
        throw new Error(`Invalid array index "${lastSeg}" at "${op.path}".`);
      }
      if (op.op === 'add') {
        if (idx > parent.length) {
          throw new Error(`Array add index ${idx} out of bounds (${parent.length}) at "${op.path}".`);
        }
        parent.splice(idx, 0, deepCloneJson(op.value));
      } else if (op.op === 'replace') {
        if (idx >= parent.length) {
          throw new Error(`Array replace index ${idx} out of bounds (${parent.length}) at "${op.path}".`);
        }
        parent[idx] = deepCloneJson(op.value);
      } else if (op.op === 'remove') {
        if (idx >= parent.length) {
          throw new Error(`Array remove index ${idx} out of bounds (${parent.length}) at "${op.path}".`);
        }
        parent.splice(idx, 1);
      }
    } else {
      if (op.op === 'add') {
        parent[lastSeg] = deepCloneJson(op.value);
      } else if (op.op === 'replace') {
        if (!Object.prototype.hasOwnProperty.call(parent, lastSeg)) {
          throw new Error(`Cannot replace non-existent key "${lastSeg}" at "${op.path}".`);
        }
        parent[lastSeg] = deepCloneJson(op.value);
      } else if (op.op === 'remove') {
        delete parent[lastSeg];
      }
    }
  }

  return root as T;
}

/**
 * Computes the exact inverse RFC 6902 JSON Patch that reverts `applyJsonPatch(before, patch)`
 * back to `before`.
 */
export function invertJsonPatch(before: unknown, patch: readonly JsonPatchOp[]): JsonPatchOp[] {
  const after = applyJsonPatch(before, patch);
  return computeJsonPatch(after, before);
}

export function formatDiffScalar(val: unknown): string {
  if (val === undefined) return 'unset';
  if (val === null) return 'null';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return val
      .map((item) => {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          if (typeof rec.title === 'string') {
            return rec.enabled === false ? `${rec.title} (disabled)` : rec.title;
          }
          if (typeof rec.name === 'string') {
            return rec.max !== undefined ? `${rec.name} (max ${rec.max})` : rec.name;
          }
          if (typeof rec.key === 'string') {
            return rec.sticky ? `${rec.key} (sticky)` : rec.key;
          }
        }
        return JSON.stringify(item);
      })
      .join(', ');
  }
  if (typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    if (typeof rec.title === 'string') {
      return rec.enabled === false
        ? `${rec.title} (disabled)`
        : `${rec.title}: ${String(rec.ruleText ?? '').slice(0, 80)}`;
    }
    if (typeof rec.key === 'string' && typeof rec.sticky === 'boolean') {
      return `${rec.key} (${rec.sticky ? 'sticky' : 'unpinned'})`;
    }
    return JSON.stringify(val);
  }
  return String(val);
}

function humanizePointerLabel(pointer: string): string {
  const segments = splitJsonPointer(pointer);
  if (segments.length === 0) return 'Root Config';
  return segments.join(' › ');
}

/**
 * Generates structured `[previous_value -> proposed_value]` diff entries from `before` and `after`.
 */
export function buildKeyValueDiff(
  before: unknown,
  after: unknown,
  patchOverride?: readonly JsonPatchOp[],
): KeyValueDiffEntry[] {
  const patch = patchOverride ?? computeJsonPatch(before, after);
  return patch.map((op) => {
    const prevVal = op.op === 'add' ? undefined : getValueAtPointer(before, op.path);
    const nextVal = op.op === 'remove' ? undefined : op.value;
    const prevStr = formatDiffScalar(prevVal);
    const nextStr = formatDiffScalar(nextVal);
    return {
      path: op.path,
      label: humanizePointerLabel(op.path),
      previousValue: deepCloneJson(prevVal),
      proposedValue: deepCloneJson(nextVal),
      formatted: `[${prevStr} -> ${nextStr}]`,
    };
  });
}
