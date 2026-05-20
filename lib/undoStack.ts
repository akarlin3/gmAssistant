export type Snapshot = {
  state: Record<string, any>;
  done: Record<string, boolean>;
  name: string;
  ts: number;
  description?: string;
};

const MAX_SNAPSHOTS = 20;

export function pushSnapshot(
  stack: Snapshot[],
  snap: Snapshot,
  minIntervalMs = 800
): Snapshot[] {
  const last = stack[stack.length - 1];
  if (last && snap.ts - last.ts < minIntervalMs) {
    return [...stack.slice(0, -1), snap];
  }
  const next = [...stack, snap];
  return next.length > MAX_SNAPSHOTS ? next.slice(next.length - MAX_SNAPSHOTS) : next;
}

export function popSnapshot(stack: Snapshot[]): { snap: Snapshot | null; next: Snapshot[] } {
  if (stack.length === 0) return { snap: null, next: stack };
  return { snap: stack[stack.length - 1], next: stack.slice(0, -1) };
}
