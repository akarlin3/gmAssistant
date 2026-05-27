// Client-side context assembly for a scene turn. Derives the NPC/location
// "cards" the prompt needs from the loose campaign-data shapes (NPCs and
// locations are stored as `Record<string, any>` with no rigid schema), slices
// the last VERBATIM_TURNS turns, and summarizes anything older via the
// summarize endpoint. The card-derivation helpers are pure so they can be unit
// tested without a campaign or network.

import type { SceneEntry, SceneTurn } from './types';
import type {
  SceneLocationCard,
  SceneNpcCard,
  SceneTurnContextTurn,
  SceneTurnRequest,
} from './prompt';

export const VERBATIM_TURNS = 6;

type LooseRecord = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function joinParts(parts: Array<string | undefined | null>, sep = '. '): string {
  return parts
    .map((p) => str(p))
    .filter(Boolean)
    .join(sep);
}

// NPC cards: real NPCs are { id, name, type, faction, archetype, goal, method }
// and may also carry `traits`/`voice`/`goals` if added later. Map gracefully so
// the prompt always has something for Traits / Voice / Goals.
export function deriveNpcCard(npc: LooseRecord): SceneNpcCard {
  const traits =
    str(npc.traits) ||
    joinParts([
      str(npc.archetype),
      str(npc.type),
      str(npc.faction) && `aligned with ${str(npc.faction)}`,
    ]);
  const voice = str(npc.voice);
  const goals =
    str(npc.goals) || joinParts([str(npc.goal), str(npc.method) && `Method: ${str(npc.method)}`]);
  return {
    id: str(npc.id),
    name: str(npc.name) || '(unnamed NPC)',
    traits,
    voice,
    goals,
  };
}

// Location cards: real locations are { id, name, type, aspects: string[],
// factions } with no `description`. Compose one from the available fields.
export function deriveLocationCard(loc: LooseRecord): SceneLocationCard {
  const aspects = Array.isArray(loc.aspects)
    ? (loc.aspects as unknown[]).map(str).filter(Boolean)
    : [];
  const description =
    str(loc.description) ||
    joinParts([
      str(loc.type),
      aspects.length ? aspects.join('; ') : '',
      str(loc.factions) && `Factions: ${str(loc.factions)}`,
    ]);
  return {
    id: str(loc.id),
    name: str(loc.name) || '(unnamed location)',
    description,
  };
}

export function toContextTurn(turn: SceneTurn): SceneTurnContextTurn {
  return { pcAction: turn.pcAction, response: turn.response, outcome: turn.outcome };
}

export type BuildSceneContextArgs = {
  location: LooseRecord;
  npcs: LooseRecord[];
  scene: Pick<SceneEntry, 'partyState' | 'turns'>;
  newAction: string;
  // Injected so the builder stays testable; the panel passes a fetch wrapper
  // that hits /api/scene/summarize-turns.
  summarizeTurns?: (turns: SceneTurn[]) => Promise<string>;
};

export async function buildSceneTurnRequest(
  args: BuildSceneContextArgs,
): Promise<SceneTurnRequest> {
  const { location, npcs, scene, newAction, summarizeTurns } = args;

  const recent = scene.turns.slice(-VERBATIM_TURNS);
  const earlier = scene.turns.slice(0, -VERBATIM_TURNS);

  let earlierSummary: string | null = null;
  if (earlier.length > 0 && summarizeTurns) {
    earlierSummary = (await summarizeTurns(earlier)).trim() || null;
  }

  return {
    location: deriveLocationCard(location),
    npcs: npcs.map(deriveNpcCard),
    partyState: scene.partyState,
    earlierSummary,
    recentTurns: recent.map(toContextTurn),
    newAction,
  };
}
