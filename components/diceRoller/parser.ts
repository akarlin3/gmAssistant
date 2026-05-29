// Pure dice-formula parser, evaluator, and supporting types.
// No 'use client' — this module has no React/browser dependencies beyond
// the Web Crypto API (available in both browser and Node ≥ 18).

// ---- Types ----------------------------------------------------------------

export type Macro = { id: string; name: string; formula: string };

type DieFactor = {
  type: 'die';
  count: number;
  sides: number;
  keep?: { mode: 'kh' | 'kl'; n: number };
};
type IntFactor = { type: 'int'; value: number };
export type Factor = DieFactor | IntFactor;
type Sign = 1 | -1;
export type Term = { factors: Factor[]; signs: Sign[] };
export type Expr = Term[];

export type ParseResult = { ok: true; expr: Expr } | { ok: false; error: string };

export type DieRoll = { sides: number; rolls: number[]; kept: number[] };
export type RollPart = {
  expr: string;
  dice: DieRoll[];
  modifier: number;
  subtotal: number;
  advMode: 'adv' | 'dis' | null;
};
export type Roll = {
  id: string;
  ts: number;
  label?: string;
  formula: string;
  parts: RollPart[];
  total: number;
};

export type AdvMode = 'adv' | 'dis' | null;

// ---- Parser ---------------------------------------------------------------

const MAX_COUNT = 100;
const MAX_SIDES = 1000;

function parseFactor(s: string): Factor | null {
  const dice = s.match(/^(\d+)d(\d+)(?:(kh|kl)(\d*))?$/);
  if (dice) {
    const count = Number(dice[1]);
    const sides = Number(dice[2]);
    if (count < 1 || count > MAX_COUNT) return null;
    if (sides < 2 || sides > MAX_SIDES) return null;
    if (dice[3]) {
      const keepN = dice[4] === '' || dice[4] === undefined ? 1 : Number(dice[4]);
      if (keepN < 0 || keepN > count) return null;
      return { type: 'die', count, sides, keep: { mode: dice[3] as 'kh' | 'kl', n: keepN } };
    }
    return { type: 'die', count, sides };
  }
  if (/^\d+$/.test(s)) return { type: 'int', value: Number(s) };
  return null;
}

function parseTerm(s: string): Term | null {
  if (!s.length) return null;
  const factors: Factor[] = [];
  const signs: Sign[] = [];
  const re = /([+-]?)([^+\-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    const sign: Sign = match[1] === '-' ? -1 : 1;
    const factor = parseFactor(match[2]);
    if (!factor) return null;
    factors.push(factor);
    signs.push(sign);
  }
  return factors.length ? { factors, signs } : null;
}

export function parseFormula(input: string): ParseResult {
  const cleaned = input.replace(/\s+/g, '').toLowerCase();
  if (!cleaned) return { ok: false, error: 'Enter a formula' };
  const termStrs = cleaned.split(';').filter(Boolean);
  if (!termStrs.length) return { ok: false, error: 'Enter a formula' };
  const expr: Expr = [];
  for (const ts of termStrs) {
    const term = parseTerm(ts);
    if (!term) return { ok: false, error: `Invalid: "${ts}"` };
    expr.push(term);
  }
  return { ok: true, expr };
}

// ---- RNG + evaluator ------------------------------------------------------

function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 2 ** 32) * sides) + 1;
}

export function stringifyFactor(f: Factor): string {
  if (f.type === 'int') return String(f.value);
  return `${f.count}d${f.sides}${f.keep ? `${f.keep.mode}${f.keep.n}` : ''}`;
}

export function stringifyTerm(t: Term): string {
  return t.factors
    .map((f, i) => {
      const str = stringifyFactor(f);
      if (i === 0) return t.signs[i] < 0 ? `-${str}` : str;
      return (t.signs[i] < 0 ? '-' : '+') + str;
    })
    .join('');
}

export function evalExpr(expr: Expr, adv: AdvMode): Omit<Roll, 'id' | 'ts' | 'formula' | 'label'> {
  const parts: RollPart[] = expr.map((term) => {
    const dice: DieRoll[] = [];
    let modifier = 0;
    let subtotal = 0;
    let advApplied: AdvMode = null;

    term.factors.forEach((factor, i) => {
      const sign = term.signs[i];
      if (factor.type === 'int') {
        modifier += sign * factor.value;
        subtotal += sign * factor.value;
        return;
      }
      let { count, sides, keep } = factor;
      // Adv/dis only affects an unmodified leading 1d20.
      if (adv && i === 0 && count === 1 && sides === 20 && !keep) {
        count = 2;
        keep = { mode: adv === 'adv' ? 'kh' : 'kl', n: 1 };
        advApplied = adv;
      }
      const rolls: number[] = [];
      for (let r = 0; r < count; r++) rolls.push(rollDie(sides));
      const kept = keep
        ? [...rolls].sort((a, b) => (keep!.mode === 'kh' ? b - a : a - b)).slice(0, keep.n)
        : [...rolls];
      dice.push({ sides, rolls, kept });
      subtotal += sign * kept.reduce((a, b) => a + b, 0);
    });

    return { expr: stringifyTerm(term), dice, modifier, subtotal, advMode: advApplied };
  });

  return { parts, total: parts.reduce((a, p) => a + p.subtotal, 0) };
}

// ---- Misc helpers ---------------------------------------------------------

export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
