import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateSingleFieldAssertion,
  runDeterministicAssertions,
  runJudgeRubricEvaluation,
} from '../assertions';
import { sha256Hex, SqliteEvalCache } from '../cache';
import {
  buildMarkdownDiffReport,
  runEvalHarness,
  withRateLimitBackoff,
} from '../runner';

describe('Automated Prompt Evaluation & Regression Harness (`evals/`)', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmassistant-eval-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  describe('SQLite Local Completion Cache (`SqliteEvalCache`)', () => {
    it('caches and retrieves completions keyed strictly on (prompt_hash, model, temperature, input_hash)', () => {
      const cache = new SqliteEvalCache(':memory:');
      try {
        const key = {
          promptHash: sha256Hex('sys-prompt-v1'),
          model: 'claude-sonnet-4-6',
          temperature: 0,
          inputHash: sha256Hex('user-input-1'),
        };

        expect(cache.get(key)).toBeNull();

        cache.set(key, {
          rawOutput: '{"loadMode":"Tier 1"}',
          inputTokens: 320,
          outputTokens: 45,
          latencyMs: 412.5,
          provider: 'anthropic',
          createdAtMs: 1730000000000,
        });

        const hit = cache.get(key);
        expect(hit).not.toBeNull();
        expect(hit?.rawOutput).toBe('{"loadMode":"Tier 1"}');
        expect(hit?.inputTokens).toBe(320);

        // Changing prompt_hash, model, temperature, or input_hash misses cache
        expect(cache.get({ ...key, temperature: 0.2 })).toBeNull();
        expect(cache.get({ ...key, model: 'claude-haiku-4-5' })).toBeNull();
        expect(
          cache.get({ ...key, promptHash: sha256Hex('sys-prompt-v2') }),
        ).toBeNull();
        expect(cache.countEntries()).toBe(1);
      } finally {
        cache.close();
      }
    });
  });

  describe('Exponential Backoff Rate-Limit Handler (`withRateLimitBackoff`)', () => {
    it('retries transient 429 rate-limit errors with backoff and succeeds', async () => {
      const delays: number[] = [];
      let calls = 0;

      const result = await withRateLimitBackoff(
        async () => {
          calls += 1;
          if (calls < 3) {
            const err: any = new Error('429 rate_limit_error');
            err.status = 429;
            err.headers = { 'retry-after-ms': '25' };
            throw err;
          }
          return 'ok-after-retries';
        },
        {
          maxRetries: 4,
          baseDelayMs: 10,
          sleepFn: async (ms) => {
            delays.push(ms);
          },
        },
      );

      expect(result).toBe('ok-after-retries');
      expect(calls).toBe(3);
      expect(delays).toEqual([25, 25]);
    });
  });

  describe('Multi-Layer Assertion Engine & LLM-as-a-Judge Rubric', () => {
    it('evaluates exact string expressions (output.loadMode == "Tier 1") and structured checks', () => {
      const sample = {
        loadMode: 'Tier 1',
        allocatedBlocks: 2,
        blockDurationMinutes: 15,
        stickyChannels: ['clocks', 'initiative'],
        prioritizedTasks: [{ id: 't1', title: 'Prep tavern hooks', blocks: 1 }],
        rationale: 'Minimal load mode for imminent session.',
      };

      expect(
        evaluateSingleFieldAssertion(sample, 'output.loadMode == "Tier 1"')
          .passed,
      ).toBe(true);
      expect(
        evaluateSingleFieldAssertion(sample, 'output.allocatedBlocks <= 3')
          .passed,
      ).toBe(true);
      expect(
        evaluateSingleFieldAssertion(
          sample,
          'output.prioritizedTasks[0].id == "t1"',
        ).passed,
      ).toBe(true);

      const checks = runDeterministicAssertions({
        rawOutput: JSON.stringify(sample),
        parsedJson: sample,
        pipelineOutput: sample,
        latencyMs: 120,
        target: 'session_load',
        contextState: {},
        spec: {
          json_parse: true,
          schema: 'session_load',
          forbidden_tokens: ['||', 'secret'],
          max_latency_ms: 1000,
          exact_fields: ['output.loadMode == "Tier 1"'],
        },
      });
      expect(checks.every((c) => c.passed)).toBe(true);
    });

    it('scores 1–5 rubric dimensions via --judge and penalizes ungrounded NPC hallucinations', async () => {
      const cleanRaw = JSON.stringify({
        dialogue: [
          {
            npcId: 'npc_seren',
            line: 'Step softly near the warded bronze reliquary.',
          },
        ],
        sensory: 'Ozone and cold dust hang beneath the vaulted stone arches.',
        suggestedRoll: null,
      });

      const goodScore = await runJudgeRubricEvaluation({
        target: 'scene_turn',
        contextState: { npcs: [{ id: 'npc_seren', name: 'Seren' }] },
        userInput: 'I look around quietly.',
        rawOutput: cleanRaw,
        deterministicChecks: [{ name: 'json_parse', passed: true, detail: 'ok' }],
        minScore: 4,
      });
      expect(goodScore.passed).toBe(true);
      expect(goodScore.overall).toBeGreaterThanOrEqual(4);

      const hallucinatedRaw = JSON.stringify({
        dialogue: [{ npcId: 'npc_invented_ghost', line: 'Boo!' }],
        sensory: ' ||gm spoiler|| ',
        suggestedRoll: null,
      });
      const badScore = await runJudgeRubricEvaluation({
        target: 'scene_turn',
        contextState: { npcs: [{ id: 'npc_seren', name: 'Seren' }] },
        userInput: 'I look around quietly.',
        rawOutput: hallucinatedRaw,
        deterministicChecks: [
          { name: 'schema:scene_turn', passed: false, detail: 'Unknown npcId' },
        ],
        minScore: 4,
      });
      expect(badScore.passed).toBe(false);
      expect(badScore.zeroHallucination).toBe(1);
    });
  });

  describe('Concurrent Runner, Caching & Baseline Diff Report (`runEvalHarness`)', () => {
    it('executes YAML suites concurrently, caches completions across runs, and reports baseline diffs', async () => {
      const tmp = createTempDir();
      const suitesDir = path.join(tmp, 'suites');
      const reportsDir = path.join(tmp, 'reports');
      const cacheDbPath = path.join(tmp, 'cache.sqlite');
      fs.mkdirSync(suitesDir, { recursive: true });

      fs.writeFileSync(
        path.join(suitesDir, 'mini_suite.yaml'),
        [
          'suite: mini_suite',
          'description: Temp suite for runner + cache + diff verification',
          'default_target: session_load',
          'cases:',
          '  - id: low_cap_tier1',
          '    description: Selects Tier 1 on low energy',
          '    context_state:',
          '      energy: low',
          '      minutesUntilSession: 20',
          '    user_input: "Low energy, session starts in 20m"',
          '    assertions:',
          '      json_parse: true',
          '      schema: session_load',
          '      exact_fields:',
          '        - output.loadMode == "Tier 1"',
        ].join('\n'),
        'utf8',
      );

      const invokeSpy = vi.fn(async () => ({
        rawOutput: JSON.stringify({
          loadMode: 'Tier 1',
          allocatedBlocks: 2,
          blockDurationMinutes: 15,
          stickyChannels: ['clocks'],
          prioritizedTasks: [],
          rationale: 'Minimal Tier 1 prep load.',
        }),
        inputTokens: 200,
        outputTokens: 50,
        provider: 'mock_model',
      }));

      // Run 1: Cache MISS + save baseline
      const run1 = await runEvalHarness({
        suitesDir,
        reportsDir,
        cacheDbPath,
        updateBaseline: true,
        customInvokeModel: invokeSpy,
        model: 'test-model-v1',
      });
      expect(run1.report.totals.passedCases).toBe(1);
      expect(run1.report.totals.cacheMisses).toBe(1);
      expect(invokeSpy).toHaveBeenCalledTimes(1);

      // Run 2: Identical tuple -> SQLite Cache HIT (zero extra model calls!) + --judge
      const run2 = await runEvalHarness({
        suitesDir,
        reportsDir,
        cacheDbPath,
        judge: true,
        customInvokeModel: invokeSpy,
        model: 'test-model-v1',
      });
      expect(run2.report.totals.cacheHits).toBe(1);
      expect(invokeSpy).toHaveBeenCalledTimes(1);
      expect(run2.markdownReport).toContain('UNCHANGED');
      expect(fs.existsSync(path.join(reportsDir, 'latest.md'))).toBe(true);

      // Verify regression detection in Markdown diff builder
      const regressedReport = {
        ...run2.report,
        totals: {
          ...run2.report.totals,
          passedCases: 0,
          failedCases: 1,
          passRatePct: 0,
        },
        cases: run2.report.cases.map((c) => ({ ...c, passed: false })),
      };
      const diffMd = buildMarkdownDiffReport(regressedReport, run1.report);
      expect(diffMd).toContain('REGRESSED');
      expect(diffMd).toContain('-100.0%');
    });
  });
});
