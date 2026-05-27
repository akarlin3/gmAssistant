// Server-side prompt construction for the Scene Mode routes. As with Vivify,
// the client never supplies a raw system prompt — it sends structured scene
// context and the server assembles the instructions, so a Pro user can't turn
// these endpoints into an unrestricted Claude proxy.

import type { SceneTurnResponse } from './types';

export type SceneNpcCard = {
  id: string;
  name: string;
  traits: string;
  voice: string;
  goals: string;
};

export type SceneLocationCard = {
  id: string;
  name: string;
  description: string;
};

export type SceneTurnContextTurn = {
  pcAction: string;
  response: SceneTurnResponse;
  outcome?: string;
};

export type SceneTurnRequest = {
  location: SceneLocationCard;
  npcs: SceneNpcCard[];
  partyState: string;
  earlierSummary: string | null;
  recentTurns: SceneTurnContextTurn[];
  newAction: string;
};

const SCENE_TURN_PREAMBLE = `You are the narrator and voice-actor for a single scene in a tabletop role-playing game in the style of D&D 5e. The campaign is "The Last Wells" — a setting where magic has mostly faded from the world but small pockets remain.

Your responsibilities:
1. Voice the NPCs present in this scene, staying true to each NPC's traits and voice as described below.
2. Describe sensory beats — what the PC sees, hears, smells, feels — without taking PC actions.
3. Suggest what to roll when the action's outcome is uncertain, with a difficulty class (DC) calibrated to the SRD 5.1 scale.

Strict rules:
- NEVER take actions for the PC. The user controls the PC.
- NEVER introduce new NPCs not in the present roster below.
- NEVER advance time past this scene or invoke events outside the current location.
- Stay grounded in the location description and the established NPC traits.
- If the PC's action has no uncertain outcome, set suggestedRoll to null.
- Use exact NPC IDs as provided in the roster. Do not invent IDs.

SRD 5.1 DC reference:
- Very Easy: 5 (rarely worth rolling)
- Easy: 10
- Medium: 15
- Hard: 20
- Very Hard: 25
- Nearly Impossible: 30

Respond with valid JSON only, matching this exact schema:
{
  "dialogue": [
    { "npcId": "<id from present roster>", "line": "<spoken line>" }
  ],
  "sensory": "<2-3 sentences of sensory description>",
  "suggestedRoll": {
    "ability": "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA",
    "skill": "<optional skill name or null>",
    "dc": <integer 5-30>,
    "reason": "<one sentence explaining why this roll>"
  } | null
}

Output no preamble, no markdown fences, no explanatory text — just the JSON object.`;

function formatNpc(npc: SceneNpcCard): string {
  return [
    `ID: ${npc.id}`,
    `Name: ${npc.name}`,
    `Traits: ${npc.traits || '(none recorded)'}`,
    `Voice: ${npc.voice || '(none recorded)'}`,
    `Goals: ${npc.goals || '(none recorded)'}`,
  ].join('\n');
}

function formatRecentTurn(turn: SceneTurnContextTurn): string {
  return [
    `PC: ${turn.pcAction}`,
    `Response: ${JSON.stringify(turn.response)}`,
    `Outcome: ${turn.outcome?.trim() || '(no outcome recorded)'}`,
  ].join('\n');
}

export function buildSceneTurnPrompt(req: SceneTurnRequest): string {
  const npcs = req.npcs.map(formatNpc).join('\n\n');
  const recent = req.recentTurns.length
    ? req.recentTurns.map(formatRecentTurn).join('\n\n')
    : '(no turns yet — this is the first action of the scene)';

  return [
    SCENE_TURN_PREAMBLE,
    `--- LOCATION ---\n${req.location.name}: ${req.location.description || '(no description)'}`,
    `--- NPCS PRESENT ---\n${npcs || '(no NPCs present)'}`,
    `--- PARTY STATE ---\n${req.partyState.trim() || '(none recorded)'}`,
    `--- EARLIER IN THIS SCENE (SUMMARY) ---\n${req.earlierSummary?.trim() || '(none — this is early in the scene)'}`,
    `--- RECENT TURNS ---\n${recent}`,
    `--- NEW PC ACTION ---\n${req.newAction.trim()}`,
  ].join('\n\n');
}

export function buildSceneTurnRetryPrompt(errors: string[]): string {
  return `Your last response did not match the schema. Errors: ${errors.join('; ')}. Reply with valid JSON only.`;
}

// Appendix E — voice consistency check.
export function buildVoiceCheckPrompt(args: {
  traits: string;
  voice: string;
  line: string;
}): string {
  return `You evaluate whether a single line of NPC dialogue is consistent with the NPC's established traits and voice.

NPC traits: ${args.traits || '(none)'}
NPC voice: ${args.voice || '(none)'}
Generated line: "${args.line}"

If the line is consistent (or neutral), reply exactly: OK
If the line clearly contradicts the traits or voice, reply: WARN: <one-sentence reason>

Reply with one line only. No preamble.`;
}

// Appendix G — resume-flow summarization of older turns.
export function buildSummarizeTurnsPrompt(turnsJson: string): string {
  return `Summarize the following turns from an ongoing tabletop scene into 3-5 sentences that capture what has happened so far. Focus on: PC actions taken, NPC reactions, established facts, and unresolved tensions. Write in past tense, third person. Do NOT speculate beyond what is in the turns.

Turns:
${turnsJson}

Reply with just the summary paragraph. No preamble, no headers.`;
}
