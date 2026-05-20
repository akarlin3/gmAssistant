import { rollOn } from '@/lib/tables/roll';
import { makeRng, type SeededRng } from './rng';
import {
  EXIT_TYPE_WEIGHTS,
  HAZARD_TABLE,
  INHABITANTS_BY_THEME_TIER,
  ROOM_CONTENT_KINDS,
  ROOM_DESCRIPTIONS_BY_KIND,
  ROOM_DRESSING,
  ROOM_NAME_NOUNS,
  SIZE_TO_ROOM_COUNT,
  THEME_NAME_PREFIXES,
  THEME_NAME_SUFFIXES,
  type DungeonChallengeTier,
  type DungeonSize,
  type DungeonTheme,
  type RoomKind,
} from './tables/dungeon-tables';
import type {
  DungeonExit,
  DungeonExitDirection,
  DungeonResult,
  DungeonRoom,
  DungeonRoomKind,
} from './types';

const ALL_DIRS: DungeonExitDirection[] = ['N', 'S', 'E', 'W'];
const GAP_TILES = 1;
export const TILE_PX = 24;

function dungeonName(theme: DungeonTheme, rng: SeededRng): string {
  const prefix = rollOn(THEME_NAME_PREFIXES[theme], rng);
  const suffix = rollOn(THEME_NAME_SUFFIXES[theme], rng);
  return `${prefix} ${suffix}`;
}

function pickKind(rng: SeededRng): RoomKind {
  const totalWeight = ROOM_CONTENT_KINDS.reduce((s, k) => s + k.weight, 0);
  let r = rng.next() * totalWeight;
  for (const k of ROOM_CONTENT_KINDS) {
    r -= k.weight;
    if (r < 0) return k.value;
  }
  return 'empty';
}

function pickExitType(rng: SeededRng): { type: string; state?: string } {
  const total = EXIT_TYPE_WEIGHTS.reduce((s, e) => s + e.weight, 0);
  let r = rng.next() * total;
  for (const e of EXIT_TYPE_WEIGHTS) {
    r -= e.weight;
    if (r < 0) {
      return e.states ? { type: e.type, state: rollOn(e.states, rng) } : { type: e.type };
    }
  }
  return { type: 'corridor' };
}

function makeExitId(rng: SeededRng): string {
  return `e${rng.int(0, 0xffffff).toString(36)}${rng.int(0, 0xfff).toString(36)}`;
}

function makeRoom(
  index: number,
  theme: DungeonTheme,
  tier: DungeonChallengeTier,
  rng: SeededRng,
): DungeonRoom {
  const kind = pickKind(rng);
  let contents = rollOn(ROOM_DESCRIPTIONS_BY_KIND[kind], rng);
  if (kind === 'monster') {
    const inhabitantPool = INHABITANTS_BY_THEME_TIER[theme][tier];
    if (inhabitantPool && inhabitantPool.length) {
      contents = `${contents} (${rollOn(inhabitantPool, rng)})`;
    }
  }
  return {
    index,
    name: `${rollOn(ROOM_NAME_NOUNS, rng)} ${index}`,
    contents,
    dressing: rollOn(ROOM_DRESSING, rng),
    kind: kind as DungeonRoomKind,
  };
}

// Rooms are placed on a tile grid, growing outward from the entrance in a
// connected tree. Each room is 2 or 3 tiles square; rooms are separated by a
// 1-tile gap (the implied corridor).

type RoomDims = { w: number; h: number };

function rollDims(rng: SeededRng): RoomDims {
  return { w: rng.int(2, 3), h: rng.int(2, 3) };
}

function opposite(d: DungeonExitDirection): DungeonExitDirection {
  return ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[d];
}

function placementAt(
  parent: DungeonRoom,
  dir: DungeonExitDirection,
  dims: RoomDims,
): { x: number; y: number } {
  const px = parent.x ?? 0;
  const py = parent.y ?? 0;
  const pw = parent.w ?? 2;
  const ph = parent.h ?? 2;
  switch (dir) {
    case 'N': return { x: px + Math.floor((pw - dims.w) / 2), y: py - GAP_TILES - dims.h };
    case 'S': return { x: px + Math.floor((pw - dims.w) / 2), y: py + ph + GAP_TILES };
    case 'E': return { x: px + pw + GAP_TILES, y: py + Math.floor((ph - dims.h) / 2) };
    case 'W': return { x: px - GAP_TILES - dims.w, y: py + Math.floor((ph - dims.h) / 2) };
  }
}

function collides(
  candidate: { x: number; y: number; w: number; h: number },
  rooms: DungeonRoom[],
  ignoreIndex?: number,
): boolean {
  for (const r of rooms) {
    if (r.index === ignoreIndex) continue;
    if (r.x == null || r.y == null || r.w == null || r.h == null) continue;
    const overlapX = candidate.x < r.x + r.w && candidate.x + candidate.w > r.x;
    const overlapY = candidate.y < r.y + r.h && candidate.y + candidate.h > r.y;
    if (overlapX && overlapY) return true;
  }
  return false;
}

function directionsAvailable(room: DungeonRoom): DungeonExitDirection[] {
  const used = new Set<DungeonExitDirection>((room.exits ?? []).map((e) => e.direction));
  return ALL_DIRS.filter((d) => !used.has(d));
}

function attachExit(
  source: DungeonRoom,
  dir: DungeonExitDirection,
  type: string,
  state: string | undefined,
  toIndex: number | null,
  rng: SeededRng,
): DungeonExit {
  const exit: DungeonExit = {
    id: makeExitId(rng),
    direction: dir,
    type,
    state,
    toRoomIndex: toIndex,
  };
  source.exits = [...(source.exits ?? []), exit];
  return exit;
}

function layoutRooms(rooms: DungeonRoom[], rng: SeededRng): void {
  if (rooms.length === 0) return;

  const first = rooms[0];
  const firstDims = rollDims(rng);
  first.x = 0;
  first.y = 0;
  first.w = firstDims.w;
  first.h = firstDims.h;
  first.exits = [];

  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    room.exits = [];
    let placed = false;

    // Try parents in a shuffled order to avoid a long thin chain.
    const parentOrder = rng.shuffle(rooms.slice(0, i));

    for (const parent of parentOrder) {
      if (placed) break;
      const dirs = rng.shuffle(directionsAvailable(parent));
      for (const dir of dirs) {
        const candidates: RoomDims[] = [rollDims(rng), { w: 2, h: 2 }];
        for (const dims of candidates) {
          const pos = placementAt(parent, dir, dims);
          if (collides({ ...pos, ...dims }, rooms, room.index)) continue;
          room.x = pos.x;
          room.y = pos.y;
          room.w = dims.w;
          room.h = dims.h;
          const exitType = pickExitType(rng);
          attachExit(parent, dir, exitType.type, exitType.state, room.index, rng);
          attachExit(room, opposite(dir), exitType.type, exitType.state, parent.index, rng);
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    // If we couldn't place the room, it stays without coords. The SVG view
    // skips rooms without spatial data; the rooms list still shows it.
  }

  // Frontier exits: add 1–N unexplored exits on rooms with open dirs.
  const frontierTarget = Math.max(1, Math.floor(rooms.length / 6) + rng.int(0, 2));
  const candidatesByOpenDirs = rooms.filter(
    (r) => r.x != null && directionsAvailable(r).length > 0,
  );
  const shuffledCandidates = rng.shuffle(candidatesByOpenDirs);
  let added = 0;
  for (const room of shuffledCandidates) {
    if (added >= frontierTarget) break;
    const dirs = rng.shuffle(directionsAvailable(room));
    if (dirs.length === 0) continue;
    const exitType = pickExitType(rng);
    attachExit(room, dirs[0], exitType.type, exitType.state, null, rng);
    added++;
  }
}

export function generateDungeon(
  inputs: { size: DungeonSize; theme: DungeonTheme; challengeTier: DungeonChallengeTier },
  rng: SeededRng,
): DungeonResult {
  const count = SIZE_TO_ROOM_COUNT[inputs.size];

  const rooms: DungeonRoom[] = [];
  for (let i = 1; i <= count; i++) {
    rooms.push(makeRoom(i, inputs.theme, inputs.challengeTier, rng));
  }

  layoutRooms(rooms, rng);

  const hazardCount = rng.int(2, 4);
  const hazards: string[] = [];
  const usedHaz = new Set<string>();
  while (hazards.length < hazardCount) {
    const h = rollOn(HAZARD_TABLE, rng);
    if (usedHaz.has(h)) continue;
    usedHaz.add(h);
    hazards.push(h);
  }

  const pool = INHABITANTS_BY_THEME_TIER[inputs.theme][inputs.challengeTier];
  const inhabitants: string[] = [];
  const usedInh = new Set<string>();
  const wantedInh = Math.min(pool.length, rng.int(2, 4));
  while (inhabitants.length < wantedInh) {
    const e = rollOn(pool, rng);
    if (usedInh.has(e)) continue;
    usedInh.add(e);
    inhabitants.push(e);
  }

  return {
    kind: 'dungeon',
    id: `dungeon_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs,
    name: dungeonName(inputs.theme, rng),
    details: {
      size: inputs.size,
      theme: inputs.theme,
      challengeTier: inputs.challengeTier,
      rooms,
      hazards,
      inhabitants,
    },
    enhanced: false,
  };
}

// Click-to-grow: turn an unexplored exit into a fresh room placed beyond it.
// Returns 'placed' on success, 'collapsed' if no orientation fits (the exit
// becomes a dead end), 'noop' if the exit is invalid or already explored.

export type ExpandOutcome = 'placed' | 'collapsed' | 'noop';

export function expandFromExit(
  dungeon: DungeonResult,
  sourceRoomIndex: number,
  exitIdValue: string,
): { dungeon: DungeonResult; outcome: ExpandOutcome } {
  const rooms: DungeonRoom[] = dungeon.details.rooms.map((r) => ({
    ...r,
    exits: r.exits ? r.exits.map((e) => ({ ...e })) : undefined,
  }));
  const source = rooms.find((r) => r.index === sourceRoomIndex);
  if (!source || !source.exits) return { dungeon, outcome: 'noop' };

  const exit = source.exits.find((e) => e.id === exitIdValue);
  if (!exit || exit.toRoomIndex !== null) return { dungeon, outcome: 'noop' };
  if (source.x == null || source.y == null) return { dungeon, outcome: 'noop' };

  const rng = makeRng();
  const newIndex = rooms.reduce((m, r) => Math.max(m, r.index), 0) + 1;
  const newRoom = makeRoom(newIndex, dungeon.inputs.theme, dungeon.inputs.challengeTier, rng);
  newRoom.exits = [];

  const sizes: RoomDims[] = [rollDims(rng), { w: 2, h: 2 }];
  let placed = false;
  for (const dims of sizes) {
    const pos = placementAt(source, exit.direction, dims);
    if (collides({ ...pos, ...dims }, rooms)) continue;
    newRoom.x = pos.x;
    newRoom.y = pos.y;
    newRoom.w = dims.w;
    newRoom.h = dims.h;
    placed = true;
    break;
  }

  if (!placed) {
    exit.type = 'collapsed';
    exit.state = 'dead end — too tight to dig further';
    exit.toRoomIndex = -1;
    return {
      dungeon: { ...dungeon, details: { ...dungeon.details, rooms } },
      outcome: 'collapsed',
    };
  }

  exit.toRoomIndex = newRoom.index;
  attachExit(newRoom, opposite(exit.direction), exit.type, exit.state, source.index, rng);

  // Give the new room a frontier exit so the user can keep growing.
  const openDirs = directionsAvailable(newRoom);
  if (openDirs.length > 0 && rng.next() < 0.85) {
    const dir = rng.pick(openDirs);
    const exitType = pickExitType(rng);
    attachExit(newRoom, dir, exitType.type, exitType.state, null, rng);
  }

  rooms.push(newRoom);

  return {
    dungeon: { ...dungeon, details: { ...dungeon.details, rooms } },
    outcome: 'placed',
  };
}

export function computeMapBounds(rooms: DungeonRoom[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  empty: boolean;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const r of rooms) {
    if (r.x == null || r.y == null || r.w == null || r.h == null) continue;
    any = true;
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  if (!any) return { minX: 0, minY: 0, maxX: 8, maxY: 6, empty: true };
  return { minX: minX - 2, minY: minY - 2, maxX: maxX + 2, maxY: maxY + 2, empty: false };
}
