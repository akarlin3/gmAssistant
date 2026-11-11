// Automated Prompt Evaluation & Regression Runner (`evals/runner.ts`)
//
// Features:
// - Loads `evals/suites/*.{yaml,yml,json}` validated via `EvalSuiteFileSchema`
// - Concurrent execution pool (`runWithConcurrency`) with exponential rate-limit backoff (`withRateLimitBackoff`)
// - Local SQLite completion cache keyed on `(prompt_hash, model, temperature, input_hash)`
// - Multi-layer deterministic assertions + optional `--judge` 1–5 rubric pass
// - Clean ANSI/ASCII terminal summary table + baseline diff report (`evals/reports/latest.md` & `latest.json`)

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import Anthropic from '@anthropic-ai/sdk';
import YAML from 'yaml';
import { extractJson } from '@/lib/scene/schema';
import {
  runDeterministicAssertions,
  runJudgeRubricEvaluation,
} from './assertions';
import {
  sha256Hex,
  SqliteEvalCache,
  type EvalCacheKeyTuple,
} from './cache';
import {
  buildTargetPromptBundle,
  evaluateTargetPipelineOutput,
  synthesizeLocalStructuredOutput,
} from './targets';
import {
  EvalSuiteFileSchema,
  type EvalCaseRunResult,
  type EvalRunReport,
  type EvalSuiteFile,
  type EvalTarget,
  type EvalTestCase,
} from './types';

export type EvalProviderMode = 'auto' | 'anthropic' | 'local';

export interface RunEvalHarnessOptions {
  suitesDir?: string;
  reportsDir?: string;
  cacheDbPath?: string;
  suiteFilter?: string;
  caseFilter?: string;
  concurrency?: number;
  judge?: boolean;
  noCache?: boolean;
  updateBaseline?: boolean;
  model?: string;
  judgeModel?: string;
  temperature?: number;
  provider?: EvalProviderMode;
  anthropicApiKey?: string;
  /** Optional injectable LLM completion function for unit testing backoff/caching. */
  customInvokeModel?: (args: {
    systemPrompt: string;
    userPrompt: string;
    jsonSchema: Record<string, unknown>;
    model: string;
    temperature: number;
  }) => Promise<{
    rawOutput: string;
    inputTokens: number;
    outputTokens: number;
    provider: string;
  }>;
}

// ---------------------------------------------------------------------------
// 1. Exponential Backoff for Rate Limits (HTTP 429 / 529 / 503)
// ---------------------------------------------------------------------------

export interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRateLimitOrTransientError(err: unknown): {
  retryable: boolean;
  retryAfterMs?: number;
} {
  if (!err || typeof err !== 'object') {
    return { retryable: false };
  }
  const anyErr = err as Record<string, any>;
  const status = Number(anyErr.status ?? anyErr.statusCode ?? 0);
  const errType = String(anyErr?.error?.type ?? anyErr.name ?? '').toLowerCase();
  const msg = String(anyErr.message ?? '').toLowerCase();

  const retryable =
    status === 429 ||
    status === 529 ||
    status === 502 ||
    status === 503 ||
    errType.includes('rate_limit') ||
    errType.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('overloaded');

  if (!retryable) {
    return { retryable: false };
  }

  let retryAfterMs: number | undefined;
  const headers = anyErr.headers;
  if (headers) {
    const rawRetryMs =
      typeof headers.get === 'function'
        ? headers.get('retry-after-ms')
        : headers['retry-after-ms'];
    const rawRetrySec =
      typeof headers.get === 'function'
        ? headers.get('retry-after')
        : headers['retry-after'];
    if (rawRetryMs && !Number.isNaN(Number(rawRetryMs))) {
      retryAfterMs = Number(rawRetryMs);
    } else if (rawRetrySec && !Number.isNaN(Number(rawRetrySec))) {
      retryAfterMs = Number(rawRetrySec) * 1000;
    }
  }

  return { retryable: true, retryAfterMs };
}

export async function withRateLimitBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 15_000;
  const sleep = opts.sleepFn ?? defaultSleep;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const check = isRetryableRateLimitOrTransientError(err);
      if (!check.retryable || attempt >= maxRetries) {
        throw err;
      }
      const expDelay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 120),
      );
      const waitMs =
        check.retryAfterMs !== undefined
          ? Math.min(maxDelayMs, Math.max(check.retryAfterMs, baseDelayMs))
          : expDelay;
      attempt += 1;
      await sleep(waitMs);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Bounded Concurrent Worker Pool
// ---------------------------------------------------------------------------

export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function nextWorker(): Promise<void> {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => nextWorker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// 3. Suite Discovery & YAML/JSON Parsing
// ---------------------------------------------------------------------------

export function loadEvalSuites(
  suitesDir: string,
  suiteFilter?: string,
): Array<{ filePath: string; suite: EvalSuiteFile }> {
  if (!fs.existsSync(suitesDir)) {
    throw new Error(`Eval suites directory not found: ${suitesDir}`);
  }

  const entries = fs
    .readdirSync(suitesDir)
    .filter((f) => /\.(?:ya?ml|json)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  const loaded: Array<{ filePath: string; suite: EvalSuiteFile }> = [];
  for (const fileName of entries) {
    if (
      suiteFilter &&
      !fileName.toLowerCase().includes(suiteFilter.toLowerCase())
    ) {
      continue;
    }
    const fullPath = path.join(suitesDir, fileName);
    const rawContent = fs.readFileSync(fullPath, 'utf8');
    const parsedRaw = fileName.toLowerCase().endsWith('.json')
      ? JSON.parse(rawContent)
      : YAML.parse(rawContent);
    const validated = EvalSuiteFileSchema.parse(parsedRaw);
    loaded.push({ filePath: fullPath, suite: validated });
  }

  return loaded;
}

// ---------------------------------------------------------------------------
// 4. Token Estimation & Live Anthropic Structured Invocation
// ---------------------------------------------------------------------------

function estimateTokensApprox(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function invokeAnthropicStructured(args: {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
}): Promise<{
  rawOutput: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
}> {
  const client = new Anthropic({ apiKey: args.apiKey });
  const msg = await withRateLimitBackoff(() =>
    client.messages.create({
      model: args.model,
      max_tokens: 1400,
      temperature: args.temperature,
      system: args.systemPrompt,
      output_config: {
        format: {
          type: 'json_schema',
          schema: args.jsonSchema,
        },
      },
      messages: [{ role: 'user', content: args.userPrompt }],
    }),
  );

  const rawOutput = Array.isArray(msg.content)
    ? msg.content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('\n')
    : '';

  return {
    rawOutput,
    inputTokens: Number(msg.usage?.input_tokens ?? estimateTokensApprox(args.systemPrompt + args.userPrompt)),
    outputTokens: Number(msg.usage?.output_tokens ?? estimateTokensApprox(rawOutput)),
    provider: 'anthropic',
  };
}

// ---------------------------------------------------------------------------
// 5. Terminal Summary Table & Markdown Diff Report Builders
// ---------------------------------------------------------------------------

function padCell(str: string, width: number, align: 'left' | 'right' = 'left'): string {
  const truncated =
    str.length > width ? `${str.slice(0, Math.max(1, width - 1))}…` : str;
  return align === 'right'
    ? truncated.padStart(width, ' ')
    : truncated.padEnd(width, ' ');
}

export function formatTerminalSummaryTable(
  report: EvalRunReport,
  baseline?: EvalRunReport | null,
): string {
  const cols = [
    { header: 'Suite', width: 22, align: 'left' as const },
    { header: 'Case ID', width: 28, align: 'left' as const },
    { header: 'Status', width: 6, align: 'left' as const },
    { header: 'Checks', width: 7, align: 'right' as const },
    { header: 'Judge', width: 7, align: 'right' as const },
    { header: 'Cache', width: 5, align: 'left' as const },
    { header: 'Latency', width: 9, align: 'right' as const },
    { header: 'Tokens', width: 7, align: 'right' as const },
  ];

  const sepLine =
    '+-' + cols.map((c) => '-'.repeat(c.width)).join('-+-') + '-+';
  const headerLine =
    '| ' +
    cols.map((c) => padCell(c.header, c.width, c.align)).join(' | ') +
    ' |';

  const lines: string[] = [
    '',
    `Prompt Evaluation & Regression Summary (model=${report.model}, temp=${report.temperature}, concurrency=${report.concurrency})`,
    sepLine,
    headerLine,
    sepLine,
  ];

  for (const c of report.cases) {
    const passedChecks = c.checks.filter((chk) => chk.passed).length;
    const judgeCell = c.judge ? `${c.judge.overall.toFixed(1)}/5` : '  n/a';
    const row = [
      padCell(c.suite, cols[0].width),
      padCell(c.id, cols[1].width),
      padCell(c.passed ? 'PASS' : 'FAIL', cols[2].width),
      padCell(`${passedChecks}/${c.checks.length}`, cols[3].width, 'right'),
      padCell(judgeCell, cols[4].width, 'right'),
      padCell(c.cacheHit ? 'HIT' : 'MISS', cols[5].width),
      padCell(`${c.latencyMs.toFixed(1)}ms`, cols[6].width, 'right'),
      padCell(String(c.totalTokens), cols[7].width, 'right'),
    ];
    lines.push('| ' + row.join(' | ') + ' |');

    if (!c.passed) {
      for (const failed of c.checks.filter((chk) => !chk.passed)) {
        lines.push(`  ↳ [FAIL] ${failed.name}: ${failed.detail}`);
      }
    }
  }

  lines.push(sepLine);

  const t = report.totals;
  const passDelta = baseline
    ? (() => {
        const diff = t.passRatePct - baseline.totals.passRatePct;
        const sign = diff > 0 ? '+' : '';
        return ` (vs baseline: ${sign}${diff.toFixed(1)}%)`;
      })()
    : ' (no prior baseline)';
  const tokenDelta = baseline
    ? (() => {
        const diff = t.totalTokens - baseline.totals.totalTokens;
        const sign = diff > 0 ? '+' : '';
        return ` (vs baseline: ${sign}${diff} tok)`;
      })()
    : '';

  lines.push(
    `Totals: ${t.passedCases}/${t.totalCases} passed (${t.passRatePct.toFixed(1)}%)${passDelta} | Cache: ${t.cacheHits} HIT / ${t.cacheMisses} MISS | Tokens: ${t.totalTokens}${tokenDelta} | Avg Latency: ${t.avgLatencyMs.toFixed(1)}ms`,
  );
  if (report.judgeEnabled && typeof t.avgJudgeScore === 'number') {
    lines.push(`LLM-as-a-Judge Avg Rubric Score: ${t.avgJudgeScore.toFixed(2)} / 5.00`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatSignedDelta(current: number, previous: number, decimals = 1, unit = ''): string {
  const diff = current - previous;
  const sign = diff > 0 ? '+' : '';
  const formatted = decimals === 0 ? String(Math.round(diff)) : diff.toFixed(decimals);
  return `${sign}${formatted}${unit}`;
}

export function buildMarkdownDiffReport(
  report: EvalRunReport,
  baseline?: EvalRunReport | null,
): string {
  const t = report.totals;
  const lines: string[] = [
    '# Prompt Evaluation & Regression Diff Report',
    '',
    `- **Run ID:** \`${report.runId}\``,
    `- **Timestamp:** \`${report.timestampIso}\``,
    `- **Model / Temperature:** \`${report.model}\` @ \`temperature=${report.temperature}\``,
    `- **Concurrency:** \`${report.concurrency}\``,
    `- **Judge Rubric Enabled (\`--judge\`):** \`${report.judgeEnabled}\``,
    `- **Baseline Compared:** ${baseline ? `\`${baseline.runId}\` (${baseline.timestampIso})` : '_None (initial baseline run)_'}`,
    '',
    '## Aggregate Metrics vs. Baseline',
    '',
    '| Metric | Current Run | Previous Baseline | Delta |',
    '| :--- | ---: | ---: | ---: |',
    `| **Pass Rate** | **${t.passRatePct.toFixed(1)}%** (${t.passedCases}/${t.totalCases}) | ${baseline ? `${baseline.totals.passRatePct.toFixed(1)}% (${baseline.totals.passedCases}/${baseline.totals.totalCases})` : '—'} | ${baseline ? formatSignedDelta(t.passRatePct, baseline.totals.passRatePct, 1, '%') : '—'} |`,
    `| **Total Tokens** | ${t.totalTokens} | ${baseline ? String(baseline.totals.totalTokens) : '—'} | ${baseline ? formatSignedDelta(t.totalTokens, baseline.totals.totalTokens, 0) : '—'} |`,
    `| **Input / Output Tokens** | ${t.totalInputTokens} / ${t.totalOutputTokens} | ${baseline ? `${baseline.totals.totalInputTokens} / ${baseline.totals.totalOutputTokens}` : '—'} | ${baseline ? `${formatSignedDelta(t.totalInputTokens, baseline.totals.totalInputTokens, 0)} / ${formatSignedDelta(t.totalOutputTokens, baseline.totals.totalOutputTokens, 0)}` : '—'} |`,
    `| **Avg Latency** | ${t.avgLatencyMs.toFixed(1)} ms | ${baseline ? `${baseline.totals.avgLatencyMs.toFixed(1)} ms` : '—'} | ${baseline ? formatSignedDelta(t.avgLatencyMs, baseline.totals.avgLatencyMs, 1, ' ms') : '—'} |`,
    `| **SQLite Cache Hits** | ${t.cacheHits} / ${t.totalCases} | ${baseline ? `${baseline.totals.cacheHits} / ${baseline.totals.totalCases}` : '—'} | — |`,
  ];

  if (report.judgeEnabled && typeof t.avgJudgeScore === 'number') {
    const baseJudge = baseline?.totals.avgJudgeScore;
    lines.push(
      `| **Avg Judge Score (1–5)** | ${t.avgJudgeScore.toFixed(2)} / 5 | ${typeof baseJudge === 'number' ? `${baseJudge.toFixed(2)} / 5` : '—'} | ${typeof baseJudge === 'number' ? formatSignedDelta(t.avgJudgeScore, baseJudge, 2) : '—'} |`,
    );
  }

  const baseCaseMap = new Map<string, EvalCaseRunResult>();
  if (baseline) {
    for (const bc of baseline.cases) {
      baseCaseMap.set(`${bc.suite}::${bc.id}`, bc);
    }
  }

  const regressions: string[] = [];
  const fixes: string[] = [];

  lines.push('');
  lines.push('## Test Case Results & Regression Diff');
  lines.push('');
  lines.push(
    '| Suite | Case ID | Status | Baseline Diff | Checks | Judge | Cache | Latency | Tokens (Δ) |',
  );
  lines.push(
    '| :--- | :--- | :---: | :---: | ---: | ---: | :---: | ---: | ---: |',
  );

  for (const c of report.cases) {
    const key = `${c.suite}::${c.id}`;
    const prev = baseCaseMap.get(key);
    let diffTag = 'NEW';
    if (prev) {
      if (prev.passed && !c.passed) {
        diffTag = 'REGRESSED';
        regressions.push(`\`${key}\``);
      } else if (!prev.passed && c.passed) {
        diffTag = 'FIXED';
        fixes.push(`\`${key}\``);
      } else {
        diffTag = 'UNCHANGED';
      }
    }

    const passedChecks = c.checks.filter((chk) => chk.passed).length;
    const judgeStr = c.judge ? `${c.judge.overall.toFixed(2)}/5` : '—';
    const tokDeltaStr = prev
      ? `${c.totalTokens} (${formatSignedDelta(c.totalTokens, prev.totalTokens, 0)})`
      : String(c.totalTokens);

    lines.push(
      `| \`${c.suite}\` | \`${c.id}\` | ${c.passed ? 'PASS' : 'FAIL'} | ${diffTag} | ${passedChecks}/${c.checks.length} | ${judgeStr} | ${c.cacheHit ? 'HIT' : 'MISS'} | ${c.latencyMs.toFixed(1)} ms | ${tokDeltaStr} |`,
    );
  }

  lines.push('');
  lines.push('## Regression & Failure Diagnostics');
  lines.push('');
  if (regressions.length > 0) {
    lines.push(`- **Regressions (${regressions.length}):** ${regressions.join(', ')}`);
  } else {
    lines.push('- **Regressions:** 0');
  }
  if (fixes.length > 0) {
    lines.push(`- **Newly Fixed (${fixes.length}):** ${fixes.join(', ')}`);
  }

  const failedCases = report.cases.filter((c) => !c.passed);
  if (failedCases.length > 0) {
    lines.push('');
    lines.push('### Failed Assertions');
    for (const fc of failedCases) {
      lines.push(`- **\`${fc.suite}::${fc.id}\`** — ${fc.description}`);
      for (const chk of fc.checks.filter((k) => !k.passed)) {
        lines.push(`  - \`${chk.name}\`: ${chk.detail}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 6. Main Harness Execution Entrypoint (`runEvalHarness`)
// ---------------------------------------------------------------------------

export async function runEvalHarness(
  options: RunEvalHarnessOptions = {},
): Promise<{
  report: EvalRunReport;
  baseline: EvalRunReport | null;
  terminalTable: string;
  markdownReport: string;
  latestMarkdownPath: string;
  latestJsonPath: string;
}> {
  const suitesDir =
    options.suitesDir ?? path.resolve(process.cwd(), 'evals', 'suites');
  const reportsDir =
    options.reportsDir ?? path.resolve(process.cwd(), 'evals', 'reports');
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const judgeEnabled = Boolean(options.judge);
  const noCache = Boolean(options.noCache);
  const temperature = options.temperature ?? 0;
  const providerMode: EvalProviderMode = options.provider ?? 'auto';
  const apiKey = options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  const useLiveAnthropic =
    !options.customInvokeModel &&
    (providerMode === 'anthropic' ||
      (providerMode === 'auto' && Boolean(apiKey)));
  const model =
    options.model ??
    (useLiveAnthropic ? 'claude-sonnet-4-6' : 'deterministic-local-v1');

  if (providerMode === 'anthropic' && !apiKey && !options.customInvokeModel) {
    throw new Error(
      'ANTHROPIC_API_KEY is required when --provider anthropic is explicitly requested.',
    );
  }

  const loadedSuites = loadEvalSuites(suitesDir, options.suiteFilter);
  const workItems: Array<{
    suiteName: string;
    target: EvalTarget;
    testCase: EvalTestCase;
  }> = [];

  for (const { suite } of loadedSuites) {
    for (const tc of suite.cases) {
      if (
        options.caseFilter &&
        !tc.id.toLowerCase().includes(options.caseFilter.toLowerCase())
      ) {
        continue;
      }
      workItems.push({
        suiteName: suite.suite,
        target: tc.target ?? suite.default_target,
        testCase: tc,
      });
    }
  }

  if (workItems.length === 0) {
    throw new Error('No evaluation test cases matched the provided filters.');
  }

  const cache = new SqliteEvalCache(options.cacheDbPath);
  const suiteStartMs = performance.now();

  try {
    const caseResults = await runWithConcurrency(
      workItems,
      concurrency,
      async ({ suiteName, target, testCase }) => {
        const bundle = buildTargetPromptBundle(
          target,
          testCase.context_state,
          testCase.user_input,
        );

        const hasExplicitMock = testCase.mock_llm_output !== undefined;
        const effectiveModel = hasExplicitMock ? `${model}:fixture-mock` : model;
        const promptHash = sha256Hex(
          `${bundle.systemPrompt}\n---SCHEMA---\n${JSON.stringify(bundle.jsonSchema)}`,
        );
        const inputHash = sha256Hex(
          hasExplicitMock
            ? `${bundle.userPrompt}\n---MOCK---\n${JSON.stringify(testCase.mock_llm_output)}`
            : bundle.userPrompt,
        );

        const cacheKey: EvalCacheKeyTuple = {
          promptHash,
          model: effectiveModel,
          temperature,
          inputHash,
        };

        let rawOutput = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let latencyMs = 0;
        let providerLabel = 'unknown';
        let cacheHit = false;

        const cached = !noCache ? cache.get(cacheKey) : null;
        if (cached) {
          cacheHit = true;
          rawOutput = cached.rawOutput;
          inputTokens = cached.inputTokens;
          outputTokens = cached.outputTokens;
          latencyMs = 0.2;
          providerLabel = `${cached.provider}:cached`;
        } else {
          const t0 = performance.now();
          if (hasExplicitMock) {
            rawOutput =
              typeof testCase.mock_llm_output === 'string'
                ? testCase.mock_llm_output
                : JSON.stringify(testCase.mock_llm_output);
            inputTokens = estimateTokensApprox(
              bundle.systemPrompt + bundle.userPrompt,
            );
            outputTokens = estimateTokensApprox(rawOutput);
            providerLabel = 'fixture_mock';
          } else if (options.customInvokeModel) {
            const res = await withRateLimitBackoff(() =>
              options.customInvokeModel!({
                systemPrompt: bundle.systemPrompt,
                userPrompt: bundle.userPrompt,
                jsonSchema: bundle.jsonSchema,
                model,
                temperature,
              }),
            );
            rawOutput = res.rawOutput;
            inputTokens = res.inputTokens;
            outputTokens = res.outputTokens;
            providerLabel = res.provider;
          } else if (useLiveAnthropic && apiKey) {
            const res = await invokeAnthropicStructured({
              apiKey,
              model,
              temperature,
              systemPrompt: bundle.systemPrompt,
              userPrompt: bundle.userPrompt,
              jsonSchema: bundle.jsonSchema,
            });
            rawOutput = res.rawOutput;
            inputTokens = res.inputTokens;
            outputTokens = res.outputTokens;
            providerLabel = res.provider;
          } else {
            rawOutput = await synthesizeLocalStructuredOutput(
              target,
              testCase.context_state,
              testCase.user_input,
            );
            inputTokens = estimateTokensApprox(
              bundle.systemPrompt + bundle.userPrompt,
            );
            outputTokens = estimateTokensApprox(rawOutput);
            providerLabel = 'local_synthesizer';
          }
          latencyMs = Number((performance.now() - t0).toFixed(2));

          if (!noCache) {
            cache.set(cacheKey, {
              rawOutput,
              inputTokens,
              outputTokens,
              latencyMs,
              provider: providerLabel,
              createdAtMs: Date.now(),
            });
          }
        }

        const parsedJson = extractJson(rawOutput);
        const pipelineOutput = await evaluateTargetPipelineOutput(
          target,
          testCase.context_state,
          testCase.user_input,
          parsedJson,
        );

        const checks = runDeterministicAssertions({
          rawOutput,
          parsedJson,
          pipelineOutput,
          latencyMs,
          target,
          contextState: testCase.context_state,
          spec: testCase.assertions,
        });

        let judgeScorecard: EvalCaseRunResult['judge'];
        if (judgeEnabled) {
          judgeScorecard = await withRateLimitBackoff(() =>
            runJudgeRubricEvaluation({
              target,
              contextState: testCase.context_state,
              userInput: testCase.user_input,
              rawOutput,
              deterministicChecks: checks,
              minScore: testCase.assertions.judge_rubric?.min_score ?? 4,
              criteria: testCase.assertions.judge_rubric?.criteria,
              anthropicApiKey: useLiveAnthropic ? apiKey : undefined,
              judgeModel: options.judgeModel,
            }),
          );
          checks.push({
            name: 'judge_rubric',
            passed: judgeScorecard.passed,
            detail: `score=${judgeScorecard.overall}/5 (min=${judgeScorecard.minRequired}) [tone=${judgeScorecard.tone}, adherence=${judgeScorecard.instructionAdherence}, grounding=${judgeScorecard.zeroHallucination}] — ${judgeScorecard.rationale}`,
          });
        }

        const passed = checks.every((c) => c.passed);

        return {
          suite: suiteName,
          id: testCase.id,
          description: testCase.description,
          target,
          passed,
          cacheHit,
          provider: providerLabel,
          latencyMs,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          checks,
          ...(judgeScorecard ? { judge: judgeScorecard } : {}),
          rawOutputSnippet: rawOutput.slice(0, 240),
        } satisfies EvalCaseRunResult;
      },
    );

    const totalDurationMs = Number((performance.now() - suiteStartMs).toFixed(2));
    const totalCases = caseResults.length;
    const passedCases = caseResults.filter((c) => c.passed).length;
    const failedCases = totalCases - passedCases;
    const cacheHits = caseResults.filter((c) => c.cacheHit).length;
    const cacheMisses = totalCases - cacheHits;
    const totalInputTokens = caseResults.reduce((s, c) => s + c.inputTokens, 0);
    const totalOutputTokens = caseResults.reduce((s, c) => s + c.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const avgLatencyMs =
      totalCases > 0
        ? Number(
            (
              caseResults.reduce((s, c) => s + c.latencyMs, 0) / totalCases
            ).toFixed(2),
          )
        : 0;

    const judgeScores = caseResults
      .map((c) => c.judge?.overall)
      .filter((n): n is number => typeof n === 'number');
    const avgJudgeScore =
      judgeScores.length > 0
        ? Number(
            (
              judgeScores.reduce((s, n) => s + n, 0) / judgeScores.length
            ).toFixed(2),
          )
        : undefined;

    const report: EvalRunReport = {
      runId: `eval_${Date.now()}`,
      timestampIso: new Date().toISOString(),
      model,
      temperature,
      judgeEnabled,
      concurrency,
      totals: {
        totalCases,
        passedCases,
        failedCases,
        passRatePct:
          totalCases > 0 ? Number(((passedCases / totalCases) * 100).toFixed(2)) : 0,
        cacheHits,
        cacheMisses,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalDurationMs,
        avgLatencyMs,
        ...(avgJudgeScore !== undefined ? { avgJudgeScore } : {}),
      },
      cases: caseResults,
    };

    fs.mkdirSync(reportsDir, { recursive: true });
    const baselinePath = path.join(reportsDir, 'baseline.json');
    const latestJsonPath = path.join(reportsDir, 'latest.json');
    const latestMarkdownPath = path.join(reportsDir, 'latest.md');

    let baseline: EvalRunReport | null = null;
    if (fs.existsSync(baselinePath)) {
      try {
        baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as EvalRunReport;
      } catch {
        baseline = null;
      }
    } else if (fs.existsSync(latestJsonPath)) {
      try {
        baseline = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8')) as EvalRunReport;
      } catch {
        baseline = null;
      }
    }

    const terminalTable = formatTerminalSummaryTable(report, baseline);
    const markdownReport = buildMarkdownDiffReport(report, baseline);

    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    fs.writeFileSync(latestMarkdownPath, markdownReport, 'utf8');

    if (options.updateBaseline) {
      fs.writeFileSync(
        baselinePath,
        JSON.stringify(report, null, 2) + '\n',
        'utf8',
      );
    }

    return {
      report,
      baseline,
      terminalTable,
      markdownReport,
      latestMarkdownPath,
      latestJsonPath,
    };
  } finally {
    cache.close();
  }
}
