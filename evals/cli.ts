#!/usr/bin/env node
// CLI Entrypoint for Automated Prompt Evaluation & Regression Harness (`evals/cli.ts`)
//
// Usage:
//   npm run eval
//   npm run eval -- --judge
//   npm run eval -- --suite customization --concurrency 6 --no-cache
//   npm run eval -- --update-baseline

import { runEvalHarness, type EvalProviderMode } from './runner';

interface ParsedCliArgs {
  judge: boolean;
  noCache: boolean;
  updateBaseline: boolean;
  suiteFilter?: string;
  caseFilter?: string;
  concurrency?: number;
  model?: string;
  judgeModel?: string;
  temperature?: number;
  provider?: EvalProviderMode;
  help: boolean;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = {
    judge: false,
    noCache: false,
    updateBaseline: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--judge') {
      parsed.judge = true;
    } else if (arg === '--no-cache') {
      parsed.noCache = true;
    } else if (arg === '--update-baseline') {
      parsed.updateBaseline = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--suite' && argv[i + 1]) {
      parsed.suiteFilter = argv[++i];
    } else if (arg.startsWith('--suite=')) {
      parsed.suiteFilter = arg.slice('--suite='.length);
    } else if (arg === '--filter' && argv[i + 1]) {
      parsed.caseFilter = argv[++i];
    } else if (arg.startsWith('--filter=')) {
      parsed.caseFilter = arg.slice('--filter='.length);
    } else if (arg === '--concurrency' && argv[i + 1]) {
      parsed.concurrency = Number(argv[++i]);
    } else if (arg.startsWith('--concurrency=')) {
      parsed.concurrency = Number(arg.slice('--concurrency='.length));
    } else if (arg === '--model' && argv[i + 1]) {
      parsed.model = argv[++i];
    } else if (arg.startsWith('--model=')) {
      parsed.model = arg.slice('--model='.length);
    } else if (arg === '--judge-model' && argv[i + 1]) {
      parsed.judgeModel = argv[++i];
    } else if (arg === '--temperature' && argv[i + 1]) {
      parsed.temperature = Number(argv[++i]);
    } else if (arg.startsWith('--temperature=')) {
      parsed.temperature = Number(arg.slice('--temperature='.length));
    } else if (arg === '--provider' && argv[i + 1]) {
      const p = argv[++i] as EvalProviderMode;
      if (p === 'auto' || p === 'anthropic' || p === 'local') {
        parsed.provider = p;
      }
    } else if (arg.startsWith('--provider=')) {
      const p = arg.slice('--provider='.length) as EvalProviderMode;
      if (p === 'auto' || p === 'anthropic' || p === 'local') {
        parsed.provider = p;
      }
    }
  }

  return parsed;
}

function printUsage(): void {
  console.log(`
gmAssistant Prompt Evaluation & Regression Harness

Usage:
  npm run eval [-- options]

Options:
  --judge                  Enable secondary LLM-as-a-Judge 1–5 rubric pass
  --suite <substring>      Run only YAML/JSON suite files matching <substring>
  --filter <substring>     Run only test case IDs matching <substring>
  --concurrency <n>        Max parallel test workers (default: 4)
  --no-cache               Bypass SQLite (prompt_hash, model, temperature, input_hash) cache
  --update-baseline        Save this run as evals/reports/baseline.json
  --model <name>           Override model identifier
  --temperature <0..1>     Override sampling temperature (default: 0)
  --provider <mode>        'auto' (default) | 'anthropic' | 'local'
  -h, --help               Show this help message
`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const result = await runEvalHarness({
    judge: args.judge,
    noCache: args.noCache,
    updateBaseline: args.updateBaseline,
    suiteFilter: args.suiteFilter,
    caseFilter: args.caseFilter,
    concurrency: args.concurrency,
    model: args.model,
    judgeModel: args.judgeModel,
    temperature: args.temperature,
    provider: args.provider,
  });

  process.stdout.write(result.terminalTable + '\n');
  console.log(`Saved Markdown diff report -> ${result.latestMarkdownPath}`);
  console.log(`Saved JSON run report      -> ${result.latestJsonPath}`);
  if (args.updateBaseline) {
    console.log('Updated baseline           -> evals/reports/baseline.json');
  }

  if (result.report.totals.failedCases > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Prompt evaluation harness failed:', err);
  process.exit(1);
});
