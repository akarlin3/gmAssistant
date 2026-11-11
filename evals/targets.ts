// Prompt & Structured Output Target Adapters (`evals/targets.ts`)
//
// Connects YAML evaluation suites to gmAssistant's real system prompts,
// Zod schemas, and structured output pipelines:
//   1. `customize`    — Conversational Customization Layer (`lib/customization`)
//   2. `scene_turn`   — Scene Mode Narrator & Voice Actor (`lib/scene`)
//   3. `session_load` — Session Prep Capacity & Encounter Load Triage

import { z } from 'zod';
import {
  buildCustomizationSystemPrompt,
  buildCustomizationUserPrompt,
  CUSTOMIZATION_RESPONSE_JSON_SCHEMA,
  hydrateActiveCustomizationConfig,
  parseCustomizationDirectiveDeterministic,
  processCustomizationDirective,
  validateCustomizationMutation,
  type ActiveCustomizationConfig,
  type CustomizationHistoryEntry,
} from '@/lib/customization';
import {
  buildSceneTurnPrompt,
  type SceneLocationCard,
  type SceneNpcCard,
} from '@/lib/scene/prompt';
import { ABILITIES } from '@/lib/scene/types';
import type { EvalTarget } from './types';

// ---------------------------------------------------------------------------
// Session Load & Prep Capacity Triage Schema (`session_load` target)
// ---------------------------------------------------------------------------

export const SessionLoadPlanSchema = z
  .object({
    loadMode: z.enum(['Tier 1', 'Tier 2', 'Tier 3']),
    allocatedBlocks: z.number().int().min(1).max(24),
    blockDurationMinutes: z.number().int().min(5).max(60),
    stickyChannels: z.array(z.string().min(1)).max(8),
    prioritizedTasks: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1),
            blocks: z.number().int().min(1).max(8),
          })
          .strict(),
      )
      .max(10),
    rationale: z.string().min(5).max(600),
  })
  .strict();

export type SessionLoadPlan = z.infer<typeof SessionLoadPlanSchema>;

export const SESSION_LOAD_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'loadMode',
    'allocatedBlocks',
    'blockDurationMinutes',
    'stickyChannels',
    'prioritizedTasks',
    'rationale',
  ],
  properties: {
    loadMode: { type: 'string', enum: ['Tier 1', 'Tier 2', 'Tier 3'] },
    allocatedBlocks: { type: 'integer' },
    blockDurationMinutes: { type: 'integer' },
    stickyChannels: { type: 'array', items: { type: 'string' } },
    prioritizedTasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'blocks'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          blocks: { type: 'integer' },
        },
      },
    },
    rationale: { type: 'string' },
  },
};

export const SCENE_TURN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['dialogue', 'sensory', 'suggestedRoll'],
  properties: {
    dialogue: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['npcId', 'line'],
        properties: {
          npcId: { type: 'string' },
          line: { type: 'string' },
        },
      },
    },
    sensory: { type: 'string' },
    suggestedRoll: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['ability', 'skill', 'dc', 'reason'],
          properties: {
            ability: { type: 'string', enum: [...ABILITIES] },
            skill: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            dc: { type: 'integer' },
            reason: { type: 'string' },
          },
        },
      ],
    },
  },
};

export function buildSessionLoadSystemPrompt(): string {
  return [
    'You are the Session Prep Capacity & Encounter Load Triage planner for gmAssistant.',
    'Given the GM or user context_state (remaining energy/capacity, pending prep tasks, encounter readiness, and session countdown) and user_input:',
    '- Select `loadMode`:',
    '  * `"Tier 1"` when energy is low/exhausted, session starts in <60m, or user requests minimal/recovery load (cap `allocatedBlocks` <= 3).',
    '  * `"Tier 2"` for standard balanced Cruise prep (4 to 8 blocks).',
    '  * `"Tier 3"` ONLY when energy is high AND deep worldbuilding / multi-dungeon surge prep is explicitly requested (>8 blocks).',
    '- Enforce `blockDurationMinutes` strictly between 5 and 60.',
    '- Never include redacted GM spoiler tags (`||...||`) or invent task IDs not grounded in context_state.',
    '- Output valid JSON matching the schema with no markdown fences.',
  ].join('\n');
}

export interface TargetPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
}

/**
 * Builds the exact `(systemPrompt, userPrompt, jsonSchema)` bundle for a test case.
 * `prompt_hash` in SQLite is computed over `systemPrompt + JSON.stringify(jsonSchema)`,
 * while `input_hash` is computed over `userPrompt`.
 */
export function buildTargetPromptBundle(
  target: EvalTarget,
  contextState: Record<string, unknown>,
  userInput: string,
): TargetPromptBundle {
  if (target === 'customize') {
    const role: 'gm' | 'player' =
      contextState.role === 'player' ? 'player' : 'gm';
    const isCampaignOwner =
      typeof contextState.isCampaignOwner === 'boolean'
        ? contextState.isCampaignOwner
        : role === 'gm';
    const activeCfg = hydrateActiveCustomizationConfig(
      (contextState.currentConfig ?? contextState) as Partial<ActiveCustomizationConfig>,
    );
    return {
      systemPrompt: buildCustomizationSystemPrompt(role, isCampaignOwner),
      userPrompt: buildCustomizationUserPrompt(userInput, activeCfg),
      jsonSchema: CUSTOMIZATION_RESPONSE_JSON_SCHEMA,
    };
  }

  if (target === 'scene_turn') {
    const locRaw = (contextState.location ?? {}) as Record<string, unknown>;
    const location: SceneLocationCard = {
      id: String(locRaw.id ?? 'loc_default'),
      name: String(locRaw.name ?? 'Candlekeep Vault'),
      description: String(
        locRaw.description ?? 'Stone arches, damp parchment, flickering lanterns.',
      ),
    };
    const npcsRaw = Array.isArray(contextState.npcs) ? contextState.npcs : [];
    const npcs: SceneNpcCard[] = npcsRaw.map((n: any, idx: number) => ({
      id: String(n?.id ?? `npc_${idx + 1}`),
      name: String(n?.name ?? `NPC ${idx + 1}`),
      traits: String(n?.traits ?? 'watchful'),
      voice: String(n?.voice ?? 'measured, quiet'),
      goals: String(n?.goals ?? 'protect the archive'),
    }));
    const fullScenePrompt = buildSceneTurnPrompt({
      location,
      npcs,
      partyState: String(contextState.partyState ?? 'HP full, torches lit'),
      earlierSummary:
        typeof contextState.earlierSummary === 'string'
          ? contextState.earlierSummary
          : null,
      recentTurns: [],
      newAction: userInput,
    });
    return {
      systemPrompt:
        'You are the Scene Mode structured JSON narrator. Follow all constraints in the user prompt and output bare JSON only.',
      userPrompt: fullScenePrompt,
      jsonSchema: SCENE_TURN_JSON_SCHEMA,
    };
  }

  // `session_load`
  const systemPrompt = buildSessionLoadSystemPrompt();
  const userPrompt = [
    '--- CONTEXT STATE ---',
    JSON.stringify(contextState, null, 2),
    '',
    '--- USER REQUEST ---',
    userInput.trim(),
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    jsonSchema: SESSION_LOAD_JSON_SCHEMA,
  };
}

/**
 * Deterministic local structured-output synthesizer used when running in offline CI
 * without `ANTHROPIC_API_KEY` (and no explicit `mock_llm_output` override was provided).
 */
export async function synthesizeLocalStructuredOutput(
  target: EvalTarget,
  contextState: Record<string, unknown>,
  userInput: string,
): Promise<string> {
  if (target === 'customize') {
    const role: 'gm' | 'player' =
      contextState.role === 'player' ? 'player' : 'gm';
    const isCampaignOwner =
      typeof contextState.isCampaignOwner === 'boolean'
        ? contextState.isCampaignOwner
        : role === 'gm';
    const currentConfig = (contextState.currentConfig ??
      contextState) as Partial<ActiveCustomizationConfig>;
    const parsed = parseCustomizationDirectiveDeterministic(userInput, {
      role,
      isCampaignOwner,
    });
    if (parsed.rawCandidateMutation) {
      const check = validateCustomizationMutation(parsed.rawCandidateMutation, {
        role,
        isCampaignOwner,
        existingConfig: hydrateActiveCustomizationConfig(currentConfig),
      });
      if (!check.valid) {
        return JSON.stringify({
          intent: 'reject',
          reply: `Rejected by domain guardrails: ${check.violations.join('; ')}`,
        });
      }
    }
    const envelope: Record<string, unknown> = {
      intent: parsed.intent,
      reply: parsed.reply,
      ...(parsed.rawCandidateMutation
        ? { mutation: parsed.rawCandidateMutation }
        : {}),
      ...(parsed.clarificationOptions
        ? { clarificationOptions: parsed.clarificationOptions }
        : {}),
    };
    return JSON.stringify(envelope);
  }

  if (target === 'scene_turn') {
    const npcs = Array.isArray(contextState.npcs) ? contextState.npcs : [];
    const primaryNpc = npcs[0] as Record<string, unknown> | undefined;
    const npcId = primaryNpc?.id ? String(primaryNpc.id) : null;
    const isPassiveLook = /\b(?:look\s+around|observe\s+quietly|wait|listen\s+passively)\b/i.test(
      userInput,
    );
    const asksPersuadeOrLie = /\b(?:persuade|convince|bluff|deceive|intimidate|demand)\b/i.test(
      userInput,
    );
    const asksLockOrStealth = /\b(?:pick\s+the\s+lock|sneak|hide|disarm|vault)\b/i.test(
      userInput,
    );

    const dialogue = npcId
      ? [
          {
            npcId,
            line: asksPersuadeOrLie
              ? 'Choose your next words carefully; these halls remember every oath.'
              : 'Keep your lantern low—something shifted behind the reliquary.',
          },
        ]
      : [];

    const suggestedRoll = isPassiveLook
      ? null
      : asksPersuadeOrLie
        ? {
            ability: 'CHA',
            skill: 'Persuasion',
            dc: 15,
            reason: 'Convincing the cautious NPC to share restricted lore requires a steady appeal.',
          }
        : asksLockOrStealth
          ? {
              ability: 'DEX',
              skill: 'Sleight of Hand',
              dc: 15,
              reason: 'Working the ancient mechanism silently carries risk of snapping a ward.',
            }
          : {
              ability: 'WIS',
              skill: 'Perception',
              dc: 12,
              reason: 'Spotting subtle disturbances in the dim chamber is uncertain.',
            };

    return JSON.stringify({
      dialogue,
      sensory:
        'Cold drafts curl across the flagstones, carrying the scent of old vellum and damp iron while lantern shadows sway along the arches.',
      suggestedRoll,
    });
  }

  // `session_load`
  const energy = String(contextState.energy ?? 'medium').toLowerCase();
  const minutesUntilSession = Number(contextState.minutesUntilSession ?? 120);
  const rawTasks = Array.isArray(contextState.tasks) ? contextState.tasks : [];

  const isLowCapacity =
    energy === 'low' ||
    energy === 'exhausted' ||
    minutesUntilSession <= 45 ||
    /\b(?:low\s+energy|burned\s+out|exhausted|quick\s+minimum|tier\s*1|minimal\s+prep|15\s*min)\b/i.test(
      userInput,
    );
  const isHighSurge =
    !isLowCapacity &&
    (energy === 'high' || /\b(?:surge|deep\s+prep|tier\s*3|marathon|full\s+weekend)\b/i.test(userInput));

  const loadMode: 'Tier 1' | 'Tier 2' | 'Tier 3' = isLowCapacity
    ? 'Tier 1'
    : isHighSurge
      ? 'Tier 3'
      : 'Tier 2';

  const allocatedBlocks =
    loadMode === 'Tier 1' ? 2 : loadMode === 'Tier 3' ? 10 : 5;
  const blockDurationMinutes = Number(contextState.blockDurationMinutes)
    ? Math.max(5, Math.min(60, Math.round(Number(contextState.blockDurationMinutes))))
    : loadMode === 'Tier 1'
      ? 15
      : 25;

  const selectedTasks = rawTasks
    .slice(0, loadMode === 'Tier 1' ? 2 : 4)
    .map((t: any, idx: number) => ({
      id: String(t?.id ?? `task_${idx + 1}`),
      title: String(t?.title ?? `Prep Step ${idx + 1}`).replace(/\|\|[\s\S]*?\|\|/g, '').trim(),
      blocks: 1,
    }));

  return JSON.stringify({
    loadMode,
    allocatedBlocks,
    blockDurationMinutes,
    stickyChannels:
      loadMode === 'Tier 1' ? ['clocks', 'initiative'] : ['prepNotes', 'clocks'],
    prioritizedTasks: selectedTasks,
    rationale:
      loadMode === 'Tier 1'
        ? 'Calibrated to Tier 1 minimal prep load to protect GM stamina and focus strictly on immediate table-ready essentials.'
        : loadMode === 'Tier 3'
          ? 'Allocated Tier 3 deep-prep surge blocks across worldbuilding and encounter rosters.'
          : 'Balanced Tier 2 Cruise schedule covering core session hooks and NPC beats.',
  });
}

/**
 * Enriches the parsed LLM JSON output for target-specific downstream pipelines
 * (e.g., running `processCustomizationDirective` so `customize` assertions can
 * inspect `status`, `jsonPatch`, `previewConfig`, and `guardrailReport` alongside
 * the LLM envelope fields!).
 */
export async function evaluateTargetPipelineOutput(
  target: EvalTarget,
  contextState: Record<string, unknown>,
  userInput: string,
  parsedJson: unknown,
): Promise<unknown> {
  if (target !== 'customize' || !parsedJson || typeof parsedJson !== 'object') {
    return parsedJson;
  }

  const role: 'gm' | 'player' =
    contextState.role === 'player' ? 'player' : 'gm';
  const isCampaignOwner =
    typeof contextState.isCampaignOwner === 'boolean'
      ? contextState.isCampaignOwner
      : role === 'gm';
  const currentConfig = (contextState.currentConfig ??
    contextState) as Partial<ActiveCustomizationConfig>;
  const historyEntries = Array.isArray(contextState.customization_history)
    ? (contextState.customization_history as CustomizationHistoryEntry<ActiveCustomizationConfig>[])
    : undefined;

  const preview = await processCustomizationDirective({
    directive: userInput,
    currentConfig,
    role,
    isCampaignOwner,
    historyEntries,
    invokeStructuredLlm: async () => parsedJson as Record<string, unknown>,
  });

  return {
    ...(parsedJson as Record<string, unknown>),
    ...preview,
  };
}
