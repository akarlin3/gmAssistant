'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dice6, Plus, X, Check, Trash2, RotateCcw, Pencil } from 'lucide-react';

// ---- Types --------------------------------------------------------------

export type Macro = { id: string; name: string; formula: string };

type DieFactor = {
  type: 'die';
  count: number;
  sides: number;
  keep?: { mode: 'kh' | 'kl'; n: number };
};
type IntFactor = { type: 'int'; value: number };
type Factor = DieFactor | IntFactor;
type Sign = 1 | -1;
type Term = { factors: Factor[]; signs: Sign[] };
type Expr = Term[];

type ParseResult = { ok: true; expr: Expr } | { ok: false; error: string };

type DieRoll = { sides: number; rolls: number[]; kept: number[] };
type RollPart = {
  expr: string;
  dice: DieRoll[];
  modifier: number;
  subtotal: number;
  advMode: 'adv' | 'dis' | null;
};
type Roll = {
  id: string;
  ts: number;
  label?: string;
  formula: string;
  parts: RollPart[];
  total: number;
};

type AdvMode = 'adv' | 'dis' | null;

// ---- Parser -------------------------------------------------------------

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

// ---- RNG + evaluator ----------------------------------------------------

function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 2 ** 32) * sides) + 1;
}

function stringifyFactor(f: Factor): string {
  if (f.type === 'int') return String(f.value);
  return `${f.count}d${f.sides}${f.keep ? `${f.keep.mode}${f.keep.n}` : ''}`;
}

function stringifyTerm(t: Term): string {
  return t.factors
    .map((f, i) => {
      const str = stringifyFactor(f);
      if (i === 0) return t.signs[i] < 0 ? `-${str}` : str;
      return (t.signs[i] < 0 ? '-' : '+') + str;
    })
    .join('');
}

function evalExpr(expr: Expr, adv: AdvMode): Omit<Roll, 'id' | 'ts' | 'formula' | 'label'> {
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

// ---- Helpers ------------------------------------------------------------

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const QUICK_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_HISTORY = 50;

// ---- Component ----------------------------------------------------------

export default function DiceRoller({
  macros,
  onMacrosChange,
}: {
  macros: Macro[];
  onMacrosChange: (next: Macro[]) => void;
}) {
  const [formula, setFormula] = useState('1d20');
  const [modifier, setModifier] = useState(0);
  const [adv, setAdv] = useState<AdvMode>(null);
  const [history, setHistory] = useState<Roll[]>([]);
  const [error, setError] = useState<string>('');
  const [savingMacro, setSavingMacro] = useState<{ formula: string; name: string } | null>(null);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; formula: string }>({ name: '', formula: '' });
  const [, setTick] = useState(0);
  const saveNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (savingMacro) saveNameRef.current?.focus();
  }, [savingMacro]);

  const now = Date.now();
  const safeMacros = useMemo(() => macros ?? [], [macros]);

  const doRoll = (rawFormula: string, label?: string) => {
    const parsed = parseFormula(rawFormula);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError('');
    const result = evalExpr(parsed.expr, adv);
    const roll: Roll = {
      id: newId(),
      ts: Date.now(),
      label,
      formula: rawFormula,
      parts: result.parts,
      total: result.total,
    };
    setHistory((h) => [roll, ...h].slice(0, MAX_HISTORY));
    setAdv(null);
  };

  const rollQuick = (sides: number) => {
    const mod = modifier;
    const f = `1d${sides}` + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '');
    doRoll(f);
  };

  const rollFormula = () => doRoll(formula);

  const beginSaveMacro = () => {
    const parsed = parseFormula(formula);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError('');
    setSavingMacro({ formula: formula.trim(), name: `Macro ${safeMacros.length + 1}` });
  };

  const commitSaveMacro = () => {
    if (!savingMacro) return;
    const name = savingMacro.name.trim() || `Macro ${safeMacros.length + 1}`;
    onMacrosChange([...safeMacros, { id: newId(), name, formula: savingMacro.formula }]);
    setSavingMacro(null);
  };

  const deleteMacro = (id: string) => {
    onMacrosChange(safeMacros.filter((m) => m.id !== id));
    if (editingMacroId === id) setEditingMacroId(null);
  };

  const beginEditMacro = (m: Macro) => {
    setEditingMacroId(m.id);
    setEditDraft({ name: m.name, formula: m.formula });
  };

  const commitEditMacro = () => {
    if (!editingMacroId) return;
    const parsed = parseFormula(editDraft.formula);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onMacrosChange(
      safeMacros.map((m) =>
        m.id === editingMacroId
          ? { ...m, name: editDraft.name.trim() || m.name, formula: editDraft.formula.trim() }
          : m,
      ),
    );
    setEditingMacroId(null);
  };

  // ---- Render ---------------------------------------------------------

  const cardCls = 'rounded border border-rule bg-parchment p-3 shadow-card space-y-2.5';
  const inputCls =
    'bg-transparent border-b border-rule text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none px-1 py-1';
  const primaryBtn =
    'text-xs px-3 py-1 rounded-sm border border-crimson bg-crimson text-parchment hover:bg-crimson-deep font-display uppercase tracking-wider transition-colors';
  const secondaryBtn =
    'text-xs px-2.5 py-1 rounded-sm border border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass font-display uppercase tracking-wider flex items-center gap-1 transition-colors';
  const segBtnBase =
    'text-xs px-2.5 py-1 rounded-sm border flex-1 font-display uppercase tracking-wider transition-colors';

  return (
    <div className="space-y-3 text-sm">
      {/* Quick dice */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <Dice6 size={16} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Quick Roll</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {QUICK_SIDES.map((s) => (
            <button
              key={s}
              onClick={() => rollQuick(s)}
              className="text-sm px-3 py-1.5 rounded-sm border border-brass-deep/50 bg-parchment-soft text-ink font-display tracking-wide hover:bg-brass hover:text-parchment hover:border-brass transition-colors"
            >
              d{s}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-brass-deep font-display uppercase tracking-wider">Mod</span>
            <input
              type="number"
              value={modifier}
              onChange={(e) => setModifier(Number(e.target.value) || 0)}
              className={`w-14 ${inputCls} text-center`}
            />
          </div>
        </div>
        <div className="flex gap-1">
          {([
            ['none', 'Normal'],
            ['adv', 'Advantage'],
            ['dis', 'Disadvantage'],
          ] as const).map(([id, label]) => {
            const active = (id === 'none' && adv === null) || id === adv;
            const style = !active
              ? 'border-rule text-ink-soft hover:bg-parchment-deep'
              : id === 'adv'
                ? 'bg-moss/10 border-moss text-moss'
                : id === 'dis'
                  ? 'bg-crimson/10 border-crimson text-crimson'
                  : 'bg-brass/10 border-brass-deep text-brass-deep';
            return (
              <button
                key={id}
                onClick={() => setAdv(id === 'none' ? null : (id as 'adv' | 'dis'))}
                className={`${segBtnBase} ${style}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {adv && (
          <p className="text-xs text-ink-mute italic font-serif">
            One-shot — applied to the next leading 1d20, then cleared.
          </p>
        )}
      </div>

      {/* Formula bar */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display tracking-wide text-ink">Formula</h3>
          <span className="text-xs text-ink-mute italic font-serif">
            NdX±M · 4d6kh3 · 1d20+5; 1d8+3
          </span>
        </div>
        <div className="flex gap-1.5 items-center flex-wrap">
          <input
            type="text"
            value={formula}
            onChange={(e) => {
              setFormula(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rollFormula();
            }}
            placeholder="1d20+5; 1d8+3"
            className={`flex-1 min-w-[8rem] ${inputCls} text-base`}
            style={{ fontFamily: 'var(--font-garamond), Georgia, serif' }}
          />
          <button onClick={rollFormula} className={primaryBtn}>
            Roll
          </button>
          <button onClick={beginSaveMacro} className={secondaryBtn} title="Save formula as macro">
            <Plus size={12} /> Macro
          </button>
        </div>
        {error && <p className="text-sm text-crimson font-serif italic">{error}</p>}
        {savingMacro && (
          <div className="flex gap-1.5 items-center pt-1 border-t border-rule">
            <input
              ref={saveNameRef}
              type="text"
              value={savingMacro.name}
              onChange={(e) => setSavingMacro({ ...savingMacro, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSaveMacro();
                if (e.key === 'Escape') setSavingMacro(null);
              }}
              placeholder="Macro name"
              className={`flex-1 ${inputCls}`}
            />
            <span className="text-xs text-ink-mute italic font-serif truncate max-w-[40%]">
              {savingMacro.formula}
            </span>
            <button onClick={commitSaveMacro} className="text-moss hover:text-ink px-1">
              <Check size={16} strokeWidth={3} />
            </button>
            <button onClick={() => setSavingMacro(null)} className="text-ink-mute hover:text-crimson px-1">
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Macros */}
      <div className={cardCls}>
        <h3 className="font-display tracking-wide text-ink">Macros</h3>
        {safeMacros.length === 0 && (
          <p className="text-sm text-ink-mute italic font-serif">
            No macros yet — save a formula above for one-click rolls.
          </p>
        )}
        <div className="space-y-1.5">
          {safeMacros.map((m) =>
            editingMacroId === m.id ? (
              <div
                key={m.id}
                className="flex gap-1.5 items-center rounded border border-brass-deep/40 bg-parchment-soft px-2 py-1.5"
              >
                <input
                  type="text"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  placeholder="Name"
                  className={`flex-1 ${inputCls}`}
                />
                <input
                  type="text"
                  value={editDraft.formula}
                  onChange={(e) => setEditDraft({ ...editDraft, formula: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEditMacro();
                    if (e.key === 'Escape') setEditingMacroId(null);
                  }}
                  placeholder="Formula"
                  className={`flex-[1.2] ${inputCls}`}
                />
                <button onClick={commitEditMacro} className="text-moss hover:text-ink px-1">
                  <Check size={16} strokeWidth={3} />
                </button>
                <button onClick={() => setEditingMacroId(null)} className="text-ink-mute hover:text-crimson px-1">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-1.5"
              >
                <span className="font-display tracking-wide text-sm text-ink truncate flex-1 min-w-0">{m.name}</span>
                <span className="text-xs text-ink-mute italic font-serif truncate max-w-[40%] hidden sm:inline">{m.formula}</span>
                <button
                  onClick={() => doRoll(m.formula, m.name)}
                  className="text-xs px-2.5 py-0.5 rounded-sm border border-crimson bg-crimson text-parchment hover:bg-crimson-deep font-display uppercase tracking-wider flex-shrink-0"
                >
                  Roll
                </button>
                <button
                  onClick={() => beginEditMacro(m)}
                  className="text-ink-mute hover:text-brass-deep flex-shrink-0"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => deleteMacro(m.id)}
                  className="text-ink-mute hover:text-crimson flex-shrink-0"
                  title="Delete"
                >
                  <X size={14} />
                </button>
              </div>
            ),
          )}
        </div>
      </div>

      {/* History */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <h3 className="font-display tracking-wide text-ink">Recent Rolls</h3>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              className="text-xs text-ink-mute hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider"
            >
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
        {history.length === 0 && (
          <p className="text-sm text-ink-mute italic font-serif">Roll something — results appear here.</p>
        )}
        <div className="space-y-1.5">
          {history.map((r) => (
            <button
              key={r.id}
              onClick={() => doRoll(r.formula, r.label)}
              className="w-full text-left rounded border border-rule bg-parchment-soft hover:bg-parchment-deep/50 px-2.5 py-2 group transition-colors"
              title="Click to re-roll"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-ink-mute font-display tracking-wider w-9 flex-shrink-0">
                  {relTime(r.ts, now)}
                </span>
                {r.label && (
                  <span className="text-xs px-1.5 py-0.5 rounded-sm bg-brass/15 border border-brass-deep/30 text-brass-deep font-display uppercase tracking-wider flex-shrink-0 truncate max-w-[40%]">
                    {r.label}
                  </span>
                )}
                <span className="text-xs text-ink-mute italic font-serif truncate flex-1 min-w-0">{r.formula}</span>
                <span
                  className="font-display text-2xl text-crimson leading-none flex-shrink-0"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {r.total}
                </span>
                <RotateCcw
                  size={12}
                  className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden sm:block"
                />
              </div>
              <div className="space-y-0.5">
                {r.parts.map((p, i) => (
                  <div
                    key={i}
                    className="text-xs text-ink-soft font-serif flex items-baseline gap-1.5 flex-wrap"
                  >
                    <span className="text-ink-mute italic">{p.expr}</span>
                    {p.advMode && (
                      <span
                        className={`text-[10px] font-display uppercase tracking-wider ${
                          p.advMode === 'adv' ? 'text-moss' : 'text-crimson'
                        }`}
                      >
                        {p.advMode}
                      </span>
                    )}
                    {p.dice.map((d, di) => (
                      <span key={di} className="text-ink-mute">
                        d{d.sides}[{renderDiceList(d)}]
                      </span>
                    ))}
                    {p.modifier !== 0 && (
                      <span className="text-ink-soft">
                        {p.modifier > 0 ? '+' : ''}
                        {p.modifier}
                      </span>
                    )}
                    <span className="ml-auto font-display tracking-wider text-ink">= {p.subtotal}</span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Dice rendering helpers --------------------------------------------

// Multiset-safe: returns one boolean per roll-index, true if that index was kept.
function keptIndices(d: DieRoll): boolean[] {
  const used = new Array(d.rolls.length).fill(false);
  const flags = new Array(d.rolls.length).fill(false);
  for (const k of d.kept) {
    const idx = d.rolls.findIndex((v, i) => v === k && !used[i]);
    if (idx !== -1) {
      used[idx] = true;
      flags[idx] = true;
    }
  }
  return flags;
}

function renderDiceList(d: DieRoll): React.ReactNode {
  const flags = keptIndices(d);
  return d.rolls.map((roll, i) => {
    const kept = flags[i];
    const isCrit = d.sides === 20 && roll === 20 && kept;
    const isFumble = d.sides === 20 && roll === 1 && kept;
    const cls = !kept
      ? 'text-ink-faint line-through mx-0.5'
      : isCrit
        ? 'text-moss font-semibold mx-0.5'
        : isFumble
          ? 'text-crimson font-semibold mx-0.5'
          : 'text-ink mx-0.5';
    return (
      <span key={i} className={cls}>
        {roll}
      </span>
    );
  });
}
