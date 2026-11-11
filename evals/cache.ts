// SQLite Local Completion Cache (`evals/cache.ts`)
//
// Caches identical `(prompt_hash, model, temperature, input_hash)` tuples
// locally in SQLite (`node:sqlite`) to eliminate redundant LLM API spend
// during rapid prompt and schema iteration.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface EvalCacheKeyTuple {
  promptHash: string;
  model: string;
  temperature: number;
  inputHash: string;
}

export interface CachedEvalCompletion {
  rawOutput: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  provider: string;
  createdAtMs: number;
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export class SqliteEvalCache {
  private readonly db: DatabaseSync;
  public readonly dbPath: string;

  constructor(customDbPath?: string) {
    this.dbPath =
      customDbPath ??
      path.resolve(process.cwd(), 'evals', '.cache', 'eval_cache.sqlite');
    if (this.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS eval_completion_cache (
        prompt_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        temperature REAL NOT NULL,
        input_hash TEXT NOT NULL,
        raw_output TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        latency_ms REAL NOT NULL DEFAULT 0,
        provider TEXT NOT NULL DEFAULT 'unknown',
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (prompt_hash, model, temperature, input_hash)
      );
    `);
  }

  public get(tuple: EvalCacheKeyTuple): CachedEvalCompletion | null {
    const stmt = this.db.prepare(`
      SELECT raw_output, input_tokens, output_tokens, latency_ms, provider, created_at_ms
      FROM eval_completion_cache
      WHERE prompt_hash = ? AND model = ? AND temperature = ? AND input_hash = ?
    `);
    const row = stmt.get(
      tuple.promptHash,
      tuple.model,
      tuple.temperature,
      tuple.inputHash,
    ) as
      | {
          raw_output: string;
          input_tokens: number;
          output_tokens: number;
          latency_ms: number;
          provider: string;
          created_at_ms: number;
        }
      | undefined;

    if (!row) return null;
    return {
      rawOutput: row.raw_output,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
      latencyMs: Number(row.latency_ms) || 0,
      provider: row.provider,
      createdAtMs: Number(row.created_at_ms) || 0,
    };
  }

  public set(tuple: EvalCacheKeyTuple, entry: CachedEvalCompletion): void {
    const stmt = this.db.prepare(`
      INSERT INTO eval_completion_cache (
        prompt_hash, model, temperature, input_hash,
        raw_output, input_tokens, output_tokens, latency_ms, provider, created_at_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(prompt_hash, model, temperature, input_hash) DO UPDATE SET
        raw_output = excluded.raw_output,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        latency_ms = excluded.latency_ms,
        provider = excluded.provider,
        created_at_ms = excluded.created_at_ms
    `);
    stmt.run(
      tuple.promptHash,
      tuple.model,
      tuple.temperature,
      tuple.inputHash,
      entry.rawOutput,
      Math.round(entry.inputTokens),
      Math.round(entry.outputTokens),
      entry.latencyMs,
      entry.provider,
      entry.createdAtMs,
    );
  }

  public countEntries(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM eval_completion_cache')
      .get() as { cnt: number };
    return Number(row?.cnt ?? 0);
  }

  public clear(): void {
    this.db.exec('DELETE FROM eval_completion_cache;');
  }

  public close(): void {
    this.db.close();
  }
}
