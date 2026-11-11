// Prompt Evaluation & Regression Harness Types & Schemas (`evals/types.ts`)

import { z } from 'zod';

export const EvalTargetSchema = z.enum([
  'customize',
  'scene_turn',
  'session_load',
]);
export type EvalTarget = z.infer<typeof EvalTargetSchema>;

export const StructuredFieldAssertionSchema = z
  .object({
    path: z.string().min(1),
    op: z
      .enum([
        'eq',
        'neq',
        'in',
        'contains',
        'not_contains',
        'gte',
        'lte',
        'exists',
        'matches',
      ])
      .default('eq'),
    value: z.unknown().optional(),
  })
  .strict();

export type StructuredFieldAssertion = z.infer<
  typeof StructuredFieldAssertionSchema
>;

export const FieldAssertionInputSchema = z.union([
  z.string().min(1),
  StructuredFieldAssertionSchema,
]);
export type FieldAssertionInput = z.infer<typeof FieldAssertionInputSchema>;

export const EvalAssertionsSpecSchema = z
  .object({
    json_parse: z.boolean().default(true),
    schema: z
      .enum([
        'customize_response',
        'customize_mutation',
        'scene_turn',
        'session_load',
      ])
      .optional(),
    forbidden_tokens: z.array(z.string().min(1)).optional(),
    max_latency_ms: z.number().positive().optional(),
    exact_fields: z.array(FieldAssertionInputSchema).optional(),
    judge_rubric: z
      .object({
        min_score: z.number().min(1).max(5).default(4),
        criteria: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type EvalAssertionsSpec = z.infer<typeof EvalAssertionsSpecSchema>;

export const EvalTestCaseSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    target: EvalTargetSchema.optional(),
    context_state: z.record(z.string(), z.unknown()).default({}),
    user_input: z.string().min(1),
    /** Optional deterministic mock LLM output for offline regression testing of malformed/adversarial model replies. */
    mock_llm_output: z.unknown().optional(),
    assertions: EvalAssertionsSpecSchema,
  })
  .strict();

export type EvalTestCase = z.infer<typeof EvalTestCaseSchema>;

export const EvalSuiteFileSchema = z
  .object({
    suite: z.string().min(1),
    description: z.string().min(1),
    default_target: EvalTargetSchema.default('customize'),
    cases: z.array(EvalTestCaseSchema).min(1),
  })
  .strict();

export type EvalSuiteFile = z.infer<typeof EvalSuiteFileSchema>;

export interface SingleCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface JudgeScorecard {
  provider: 'anthropic_judge' | 'heuristic_judge';
  tone: number; // 1..5
  instructionAdherence: number; // 1..5
  zeroHallucination: number; // 1..5
  overall: number; // 1..5
  minRequired: number;
  passed: boolean;
  rationale: string;
}

export interface EvalCaseRunResult {
  suite: string;
  id: string;
  description: string;
  target: EvalTarget;
  passed: boolean;
  cacheHit: boolean;
  provider: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  checks: SingleCheckResult[];
  judge?: JudgeScorecard;
  rawOutputSnippet: string;
}

export interface EvalRunReport {
  runId: string;
  timestampIso: string;
  model: string;
  temperature: number;
  judgeEnabled: boolean;
  concurrency: number;
  totals: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRatePct: number;
    cacheHits: number;
    cacheMisses: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalDurationMs: number;
    avgLatencyMs: number;
    avgJudgeScore?: number;
  };
  cases: EvalCaseRunResult[];
}
