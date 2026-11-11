// Multi-Layer Assertion Engine + LLM-as-a-Judge Rubric (`evals/assertions.ts`)
//
// Layer 1 (Hard Deterministic Checks):
//   - JSON parse success
//   - Strict Zod / Domain Schema validity (`customize_response`, `customize_mutation`, `scene_turn`, `session_load`)
//   - Forbidden token / regex leak checks
//   - Latency threshold enforcement (`max_latency_ms`)
//   - Programmatic exact field & expression assertions (e.g. `output.loadMode == "Tier 1"`)
//
// Layer 2 (Optional `--judge` 1–5 Rubric Pass):
//   - Scores `tone`, `instructionAdherence`, and `zeroHallucination` on a 1–5 scale.

import Anthropic from '@anthropic-ai/sdk';
import {
  StructuredLlmCustomizationEnvelopeSchema,
  validateCustomizationMutation,
} from '@/lib/customization';
import { extractJson, validateSceneTurnResponse } from '@/lib/scene/schema';
import { SessionLoadPlanSchema } from './targets';
import type {
  EvalAssertionsSpec,
  EvalTarget,
  FieldAssertionInput,
  JudgeScorecard,
  SingleCheckResult,
  StructuredFieldAssertion,
} from './types';

// ---------------------------------------------------------------------------
// 1. Dotted & Bracket Path Resolver + Expression Parser
// ---------------------------------------------------------------------------

export function resolveFieldPath(root: unknown, rawPath: string): unknown {
  const cleaned = rawPath.trim().replace(/^output\./, '');
  if (cleaned === 'output' || cleaned === '') return root;

  // Tokenize `a.b[0].c` -> `['a', 'b', '0', 'c']`
  const tokens: string[] = [];
  const tokenRx = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRx.exec(cleaned)) !== null) {
    tokens.push(m[1] ?? m[2]);
  }

  let cur: any = root;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (tok === 'length' && (Array.isArray(cur) || typeof cur === 'string')) {
      cur = cur.length;
      continue;
    }
    if (Array.isArray(cur)) {
      const idx = Number(tok);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = cur[tok];
    } else {
      return undefined;
    }
  }
  return cur;
}

function parseLiteralRhs(rawRhs: string): unknown {
  const s = rawRhs.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (s === 'undefined') return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return Number(s);
  }
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

/**
 * Parses string assertions like:
 *   - `output.loadMode == "Tier 1"`
 *   - `output.guardrailReport.valid == false`
 *   - `output.jsonPatch.length >= 1`
 *   - `output.dialogue[0].npcId != "npc_hallucinated"`
 */
export function normalizeFieldAssertion(
  input: FieldAssertionInput,
): StructuredFieldAssertion {
  if (typeof input !== 'string') {
    return input;
  }
  const expr = input.trim();
  const opMatch = expr.match(
    /^([a-zA-Z0-9_.[\]]+)\s*(===|==|!==|!=|>=|<=|>|<|\bcontains\b)\s*(.+)$/,
  );
  if (!opMatch) {
    throw new Error(
      `Invalid field assertion expression "${expr}". Expected e.g. 'output.loadMode == "Tier 1"'.`,
    );
  }

  const [, lhsPath, rawOp, rhsRaw] = opMatch;
  const parsedVal = parseLiteralRhs(rhsRaw);

  if (rawOp === '==' || rawOp === '===') {
    return { path: lhsPath, op: 'eq', value: parsedVal };
  }
  if (rawOp === '!=' || rawOp === '!==') {
    return { path: lhsPath, op: 'neq', value: parsedVal };
  }
  if (rawOp === '>=') {
    return { path: lhsPath, op: 'gte', value: parsedVal };
  }
  if (rawOp === '<=') {
    return { path: lhsPath, op: 'lte', value: parsedVal };
  }
  if (rawOp === '>') {
    return {
      path: lhsPath,
      op: 'gte',
      value: typeof parsedVal === 'number' ? parsedVal + 1e-9 : parsedVal,
    };
  }
  if (rawOp === '<') {
    return {
      path: lhsPath,
      op: 'lte',
      value: typeof parsedVal === 'number' ? parsedVal - 1e-9 : parsedVal,
    };
  }
  return { path: lhsPath, op: 'contains', value: parsedVal };
}

export function evaluateSingleFieldAssertion(
  outputObj: unknown,
  rawAssertion: FieldAssertionInput,
): SingleCheckResult {
  const label =
    typeof rawAssertion === 'string'
      ? rawAssertion
      : `${rawAssertion.path} ${rawAssertion.op} ${JSON.stringify(rawAssertion.value)}`;

  let rule: StructuredFieldAssertion;
  try {
    rule = normalizeFieldAssertion(rawAssertion);
  } catch (err: any) {
    return {
      name: `field:${label}`,
      passed: false,
      detail: err?.message || 'Malformed field assertion',
    };
  }

  const actual = resolveFieldPath(outputObj, rule.path);
  let passed = false;

  switch (rule.op) {
    case 'eq':
      passed = JSON.stringify(actual) === JSON.stringify(rule.value);
      break;
    case 'neq':
      passed = JSON.stringify(actual) !== JSON.stringify(rule.value);
      break;
    case 'exists':
      passed =
        rule.value === false ? actual === undefined : actual !== undefined && actual !== null;
      break;
    case 'in':
      passed = Array.isArray(rule.value) && rule.value.includes(actual);
      break;
    case 'contains':
      if (typeof actual === 'string') {
        passed = actual
          .toLowerCase()
          .includes(String(rule.value ?? '').toLowerCase());
      } else if (Array.isArray(actual)) {
        passed = actual.some(
          (el) =>
            JSON.stringify(el) === JSON.stringify(rule.value) ||
            (typeof el === 'string' &&
              el.toLowerCase() === String(rule.value ?? '').toLowerCase()),
        );
      }
      break;
    case 'not_contains':
      if (typeof actual === 'string') {
        passed = !actual
          .toLowerCase()
          .includes(String(rule.value ?? '').toLowerCase());
      } else if (Array.isArray(actual)) {
        passed = !actual.some(
          (el) => JSON.stringify(el) === JSON.stringify(rule.value),
        );
      } else {
        passed = true;
      }
      break;
    case 'gte':
      passed = typeof actual === 'number' && actual >= Number(rule.value);
      break;
    case 'lte':
      passed = typeof actual === 'number' && actual <= Number(rule.value);
      break;
    case 'matches': {
      const rx = new RegExp(String(rule.value ?? ''), 'i');
      passed = typeof actual === 'string' && rx.test(actual);
      break;
    }
  }

  return {
    name: `field:${label}`,
    passed,
    detail: passed
      ? `Matched (${rule.path} = ${JSON.stringify(actual)})`
      : `Expected ${label}, got ${JSON.stringify(actual)}`,
  };
}

// ---------------------------------------------------------------------------
// 2. Hard Deterministic Assertion Suite
// ---------------------------------------------------------------------------

export function runDeterministicAssertions(args: {
  rawOutput: string;
  parsedJson: unknown;
  pipelineOutput: unknown;
  latencyMs: number;
  target: EvalTarget;
  contextState: Record<string, unknown>;
  spec: EvalAssertionsSpec;
}): SingleCheckResult[] {
  const {
    rawOutput,
    parsedJson,
    pipelineOutput,
    latencyMs,
    contextState,
    spec,
  } = args;
  const results: SingleCheckResult[] = [];

  // 1. JSON Parse Check
  if (spec.json_parse !== false) {
    const ok = parsedJson !== undefined;
    results.push({
      name: 'json_parse',
      passed: ok,
      detail: ok
        ? 'Valid JSON object parsed'
        : `Failed to parse JSON from raw output: ${rawOutput.slice(0, 120)}`,
    });
  }

  // 2. Schema Validation Check (Zod / Domain Validators)
  if (spec.schema) {
    if (parsedJson === undefined) {
      results.push({
        name: `schema:${spec.schema}`,
        passed: false,
        detail: 'Cannot validate schema because JSON parsing failed.',
      });
    } else if (spec.schema === 'customize_response') {
      const check = StructuredLlmCustomizationEnvelopeSchema.safeParse(parsedJson);
      results.push({
        name: 'schema:customize_response',
        passed: check.success,
        detail: check.success
          ? 'Passed StructuredLlmCustomizationEnvelopeSchema'
          : check.error.issues
              .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
              .join('; '),
      });
    } else if (spec.schema === 'customize_mutation') {
      const mutCandidate =
        (parsedJson as Record<string, unknown>)?.mutation ?? parsedJson;
      const report = validateCustomizationMutation(mutCandidate, {
        role: contextState.role === 'player' ? 'player' : 'gm',
        isCampaignOwner:
          typeof contextState.isCampaignOwner === 'boolean'
            ? contextState.isCampaignOwner
            : contextState.role !== 'player',
      });
      results.push({
        name: 'schema:customize_mutation',
        passed: report.valid,
        detail: report.valid
          ? 'Passed StrictCustomizationMutationSchema + domain invariants'
          : report.violations.join('; '),
      });
    } else if (spec.schema === 'scene_turn') {
      const presentNpcs = Array.isArray(contextState.npcs)
        ? contextState.npcs.map((n: any) => String(n?.id)).filter(Boolean)
        : undefined;
      const sceneRes = validateSceneTurnResponse(parsedJson, presentNpcs);
      results.push({
        name: 'schema:scene_turn',
        passed: sceneRes.ok,
        detail: sceneRes.ok
          ? 'Passed validateSceneTurnResponse + NPC roster grounding'
          : sceneRes.errors.join('; '),
      });
    } else if (spec.schema === 'session_load') {
      const loadCheck = SessionLoadPlanSchema.safeParse(parsedJson);
      results.push({
        name: 'schema:session_load',
        passed: loadCheck.success,
        detail: loadCheck.success
          ? 'Passed SessionLoadPlanSchema'
          : loadCheck.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
      });
    }
  }

  // 3. Forbidden Token Checks (inspects model raw output + sanitized pipeline output, excluding echoed user input)
  if (spec.forbidden_tokens && spec.forbidden_tokens.length > 0) {
    let sanitizedPipeline = pipelineOutput;
    if (
      pipelineOutput &&
      typeof pipelineOutput === 'object' &&
      !Array.isArray(pipelineOutput) &&
      'directive' in (pipelineOutput as Record<string, unknown>)
    ) {
      const { directive: _echoedDirective, ...rest } =
        pipelineOutput as Record<string, unknown>;
      sanitizedPipeline = rest;
    }
    const combinedCorpus = `${rawOutput}\n${JSON.stringify(sanitizedPipeline ?? '')}`;
    const foundForbidden: string[] = [];
    for (const token of spec.forbidden_tokens) {
      if (token.startsWith('/') && token.lastIndexOf('/') > 0) {
        const lastSlash = token.lastIndexOf('/');
        const rx = new RegExp(
          token.slice(1, lastSlash),
          token.slice(lastSlash + 1) || 'i',
        );
        if (rx.test(combinedCorpus)) foundForbidden.push(token);
      } else if (combinedCorpus.toLowerCase().includes(token.toLowerCase())) {
        foundForbidden.push(token);
      }
    }
    results.push({
      name: 'forbidden_tokens',
      passed: foundForbidden.length === 0,
      detail:
        foundForbidden.length === 0
          ? `0/${spec.forbidden_tokens.length} forbidden tokens present`
          : `Detected forbidden token(s): ${foundForbidden.join(', ')}`,
    });
  }

  // 4. Latency Threshold Check
  if (typeof spec.max_latency_ms === 'number') {
    const ok = latencyMs <= spec.max_latency_ms;
    results.push({
      name: 'latency_threshold',
      passed: ok,
      detail: `${latencyMs.toFixed(1)}ms <= ${spec.max_latency_ms}ms`,
    });
  }

  // 5. Exact Field / Programmatic Assertions
  if (spec.exact_fields && spec.exact_fields.length > 0) {
    for (const fieldAssert of spec.exact_fields) {
      results.push(evaluateSingleFieldAssertion(pipelineOutput, fieldAssert));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Secondary LLM-as-a-Judge Rubric Pass (`--judge`, 1–5 Scale)
// ---------------------------------------------------------------------------

const JudgeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tone',
    'instructionAdherence',
    'zeroHallucination',
    'rationale',
  ],
  properties: {
    tone: { type: 'integer', description: '1 to 5 score for concise, helpful tabletop/assistant tone' },
    instructionAdherence: {
      type: 'integer',
      description: '1 to 5 score for strict adherence to system prompt rules and domain boundaries',
    },
    zeroHallucination: {
      type: 'integer',
      description: '1 to 5 score verifying zero invented IDs, leaked secrets, or unrequested destructive edits',
    },
    rationale: { type: 'string' },
  },
};

export function buildJudgePrompt(args: {
  target: EvalTarget;
  contextState: Record<string, unknown>;
  userInput: string;
  rawOutput: string;
  criteria?: string;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You are an impartial LLM-as-a-Judge evaluator grading structured AI outputs on a strict 1–5 integer rubric.',
    'Dimensions:',
    '- tone (1-5): Concise, constructive, appropriate to tabletop GM/player workflow without preachy filler.',
    '- instructionAdherence (1-5): Follows schema, authority boundaries, 5-60m block bounds, and user instructions.',
    '- zeroHallucination (1-5): Invents zero non-existent NPC/task IDs, leaks zero GM spoilers, and mutates only requested fields.',
    'Return ONLY JSON matching the schema.',
  ].join('\n');

  const userPrompt = [
    `Target Pipeline: ${args.target}`,
    args.criteria ? `Additional Rubric Criteria: ${args.criteria}` : '',
    `Context State:\n${JSON.stringify(args.contextState, null, 2)}`,
    `User Input:\n${args.userInput}`,
    `Model Output:\n${args.rawOutput}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { systemPrompt, userPrompt };
}

export async function runJudgeRubricEvaluation(args: {
  target: EvalTarget;
  contextState: Record<string, unknown>;
  userInput: string;
  rawOutput: string;
  deterministicChecks: SingleCheckResult[];
  minScore?: number;
  criteria?: string;
  anthropicApiKey?: string;
  judgeModel?: string;
}): Promise<JudgeScorecard> {
  const minRequired = args.minScore ?? 4;

  if (args.anthropicApiKey) {
    try {
      const client = new Anthropic({ apiKey: args.anthropicApiKey });
      const { systemPrompt, userPrompt } = buildJudgePrompt(args);
      const msg = await client.messages.create({
        model: args.judgeModel || 'claude-haiku-4-5',
        max_tokens: 450,
        temperature: 0,
        system: systemPrompt,
        output_config: {
          format: {
            type: 'json_schema',
            schema: JudgeJsonSchema,
          },
        },
        messages: [{ role: 'user', content: userPrompt }],
      });
      const text = Array.isArray(msg.content)
        ? msg.content
            .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
            .map((b: any) => b.text)
            .join('\n')
        : '';
      const parsed = extractJson(text) as Record<string, unknown> | undefined;
      if (parsed) {
        const tone = Math.max(1, Math.min(5, Number(parsed.tone) || 4));
        const instructionAdherence = Math.max(
          1,
          Math.min(5, Number(parsed.instructionAdherence) || 4),
        );
        const zeroHallucination = Math.max(
          1,
          Math.min(5, Number(parsed.zeroHallucination) || 4),
        );
        const overall = Number(
          ((tone + instructionAdherence + zeroHallucination) / 3).toFixed(2),
        );
        return {
          provider: 'anthropic_judge',
          tone,
          instructionAdherence,
          zeroHallucination,
          overall,
          minRequired,
          passed: overall >= minRequired,
          rationale: String(parsed.rationale ?? 'Evaluated via Claude rubric judge.'),
        };
      }
    } catch {
      // Fall back cleanly to deterministic rubric judge
    }
  }

  // Deterministic offline rubric judge (scores 1–5 grounded on output structure, grounding, and tone)
  const parsed = extractJson(args.rawOutput) as Record<string, any> | undefined;
  const failedHard = args.deterministicChecks.filter((c) => !c.passed);

  let tone = parsed ? 5 : 2;
  const proseField = String(
    parsed?.reply ?? parsed?.sensory ?? parsed?.rationale ?? '',
  );
  if (!proseField || proseField.length < 10) tone = Math.min(tone, 3);
  if (/as an ai language model/i.test(proseField)) tone = Math.min(tone, 2);

  let instructionAdherence = failedHard.length === 0 ? 5 : Math.max(1, 4 - failedHard.length);
  if (!parsed) instructionAdherence = 1;

  let zeroHallucination = 5;
  if (/\|\|[\s\S]*?\|\|/.test(args.rawOutput)) {
    zeroHallucination = 1;
  }
  if (args.target === 'scene_turn' && Array.isArray(parsed?.dialogue)) {
    const validIds = new Set(
      (Array.isArray(args.contextState.npcs) ? args.contextState.npcs : []).map(
        (n: any) => String(n?.id),
      ),
    );
    for (const d of parsed.dialogue) {
      if (!validIds.has(String(d?.npcId))) {
        zeroHallucination = 1;
      }
    }
  }

  const overall = Number(
    ((tone + instructionAdherence + zeroHallucination) / 3).toFixed(2),
  );

  return {
    provider: 'heuristic_judge',
    tone,
    instructionAdherence,
    zeroHallucination,
    overall,
    minRequired,
    passed: overall >= minRequired,
    rationale:
      failedHard.length === 0
        ? 'Concise tone, full instruction & boundary adherence, and zero ungrounded entity hallucinations.'
        : `Penalized for ${failedHard.length} deterministic violation(s): ${failedHard.map((f) => f.name).join(', ')}.`,
  };
}
