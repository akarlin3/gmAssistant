// Scene Mode — stateful, multi-turn conversational play on top of Vivify.
//
// IMPORTANT: Scene Mode entries are stored under `data.sceneSessions`, NOT
// `data.scenes`. `data.scenes` is already in use as the "Potential Scenes"
// prep list (an array of strings; see lib/sessionLog.ts `cleanPrepLists` and
// RunSessionView). Reusing that key would corrupt the prep list, so Scene
// Mode is namespaced separately.

export const SCENE_SESSIONS_KEY = 'sceneSessions' as const;
export const SCENE_SESSIONS_CAP = 20;

export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export const ABILITIES: readonly Ability[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export type SuggestedRoll = {
  ability: Ability;
  skill?: string | null;
  dc: number;
  reason: string;
};

export type SceneDialogueLine = {
  npcId: string;
  line: string;
};

export type SceneTurnResponse = {
  dialogue: SceneDialogueLine[];
  sensory: string;
  suggestedRoll: SuggestedRoll | null;
};

export type VoiceWarning = {
  npcId: string;
  reason: string;
};

export type RolledResult = {
  expr: string;
  result: number;
  success: boolean | null;
};

export type SceneTurn = {
  id: string;
  pcAction: string;
  response: SceneTurnResponse;
  voiceWarnings?: VoiceWarning[];
  outcome?: string;
  rolled?: RolledResult;
  createdAt: number;
};

export type SceneStatus = 'active' | 'ended';

export type SceneEntry = {
  id: string;
  startedAt: number;
  endedAt?: number;
  locationId: string;
  presentNpcIds: string[];
  partyState: string;
  turns: SceneTurn[];
  status: SceneStatus;
  summary?: string;
  savedToLog?: boolean;
};

export function makeSceneId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// FIFO eviction keeping the most-recent SCENE_SESSIONS_CAP scenes. Active
// scenes are never evicted (they're in-progress); only ended ones are dropped
// once the cap is exceeded, oldest-ended first.
export function capScenes(scenes: SceneEntry[], cap = SCENE_SESSIONS_CAP): SceneEntry[] {
  if (scenes.length <= cap) return scenes;
  const active = scenes.filter((s) => s.status === 'active');
  const ended = scenes.filter((s) => s.status !== 'active');
  const room = Math.max(0, cap - active.length);
  // Keep the newest `room` ended scenes by startedAt.
  const keptEnded = [...ended].sort((a, b) => b.startedAt - a.startedAt).slice(0, room);
  const keptIds = new Set([...active, ...keptEnded].map((s) => s.id));
  // Preserve original ordering for the kept set.
  return scenes.filter((s) => keptIds.has(s.id));
}
