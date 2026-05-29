'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dice6, Plus, X, Check, Trash2, RotateCcw, Pencil, Save } from 'lucide-react';
import GeneratorLog from './generators/GeneratorLog';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';

// ---- Re-exports from sub-modules ----------------------------------------
export type { Macro, Factor, Term, Expr, ParseResult, DieRoll, RollPart, Roll, AdvMode } from './diceRoller/parser';
export { parseFormula, evalExpr, newId, stringifyFactor, stringifyTerm } from './diceRoller/parser';
export { relTime, rollToText, keptIndices } from './diceRoller/format';
export { renderDiceList } from './diceRoller/renderDice';

// Local imports for internal use
import type { Macro, Roll, AdvMode } from './diceRoller/parser';
import { parseFormula, evalExpr, newId } from './diceRoller/parser';
import { relTime, rollToText } from './diceRoller/format';
import { renderDiceList } from './diceRoller/renderDice';

// ---- Constants ----------------------------------------------------------

const QUICK_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_HISTORY = 50;

// ---- Component types ----------------------------------------------------

export type PcMacroGroup = { pcId: string; pcName: string; macros: Macro[] };

// ---- DiceLogRow ---------------------------------------------------------

function DiceLogRow({ roll }: { roll: Roll }) {
  return (
    <div className="text-sm">
      <div className="mb-1 flex items-center gap-2">
        {roll.label && (
          <span className="flex-shrink-0 rounded-sm border border-brass-deep/30 bg-brass/15 px-1.5 py-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">
            {roll.label}
          </span>
        )}
        <span className="font-serif text-xs italic text-ink-mute">{roll.formula}</span>
        <span
          className="ml-auto font-display text-2xl leading-none text-crimson"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {roll.total}
        </span>
      </div>
      <div className="space-y-0.5">
        {roll.parts.map((p, i) => (
          <div key={i} className="flex flex-wrap items-baseline gap-1.5 font-serif text-xs text-ink-soft">
            <span className="italic text-ink-mute">{p.expr}</span>
            {p.advMode && (
              <span
                className={`font-display text-[10px] uppercase tracking-wider ${
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
    </div>
  );
}

// ---- Main Component -----------------------------------------------------

export default function DiceRoller({
  macros,
  onMacrosChange,
  pcMacroGroups = [],
  logEntries,
  onLogEntriesChange,
}: {
  macros: Macro[];
  onMacrosChange: (next: Macro[]) => void;
  pcMacroGroups?: PcMacroGroup[];
  logEntries: LogEntry[];
  onLogEntriesChange: (next: LogEntry[]) => void;
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
    if (!parsed.ok) { setError(parsed.error); return; }
    setError('');
    const result = evalExpr(parsed.expr, adv);
    const roll: Roll = { id: newId(), ts: Date.now(), label, formula: rawFormula, parts: result.parts, total: result.total };
    setHistory((h) => [roll, ...h].slice(0, MAX_HISTORY));
    setAdv(null);
  };

  const rollQuick = (sides: number) => {
    const mod = modifier;
    const f = `1d${sides}` + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '');
    doRoll(f);
  };

  const rollFormula = () => doRoll(formula);

  const saveRollToLog = (r: Roll) => {
    const head = `${r.label ? `[${r.label}] ` : ''}${r.formula} = ${r.total}`;
    onLogEntriesChange(appendToLog(logEntries, makeLogEntry('dice', head, r)));
  };

  const beginSaveMacro = () => {
    const parsed = parseFormula(formula);
    if (!parsed.ok) { setError(parsed.error); return; }
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
    if (!parsed.ok) { setError(parsed.error); return; }
    onMacrosChange(
      safeMacros.map((m) =>
        m.id === editingMacroId
          ? { ...m, name: editDraft.name.trim() || m.name, formula: editDraft.formula.trim() }
          : m,
      ),
    );
    setEditingMacroId(null);
  };

  // ---- Styles ---------------------------------------------------------------

  const cardCls = 'rounded border border-rule bg-parchment p-3 shadow-card space-y-2.5';
  const inputCls = 'bg-transparent border-b border-rule text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none px-1 py-1';
  const primaryBtn = 'text-xs px-3 py-1 rounded-sm border border-crimson bg-crimson text-parchment hover:bg-crimson-deep font-display uppercase tracking-wider transition-colors';
  const secondaryBtn = 'text-xs px-2.5 py-1 rounded-sm border border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass font-display uppercase tracking-wider flex items-center gap-1 transition-colors';
  const segBtnBase = 'text-xs px-2.5 py-1 rounded-sm border flex-1 font-display uppercase tracking-wider transition-colors';

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="space-y-3 text-sm">
      {/* Quick dice */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <Dice6 size={16} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Quick Roll</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_SIDES.map((s) => (
            <button key={s} onClick={() => rollQuick(s)} className="rounded-sm border border-brass-deep/50 bg-parchment-soft px-3 py-1.5 font-display text-sm tracking-wide text-ink transition-colors hover:border-brass hover:bg-brass hover:text-parchment">
              d{s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="font-display text-xs uppercase tracking-wider text-brass-deep">Mod</span>
            <input type="number" value={modifier} onChange={(e) => setModifier(Number(e.target.value) || 0)} className={`w-14 ${inputCls} text-center`} />
          </div>
        </div>
        <div className="flex gap-1">
          {([['none', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']] as const).map(([id, label]) => {
            const active = (id === 'none' && adv === null) || id === adv;
            const style = !active
              ? 'border-rule text-ink-soft hover:bg-parchment-deep'
              : id === 'adv' ? 'bg-moss/10 border-moss text-moss'
              : id === 'dis' ? 'bg-crimson/10 border-crimson text-crimson'
              : 'bg-brass/10 border-brass-deep text-brass-deep';
            return (
              <button key={id} onClick={() => setAdv(id === 'none' ? null : (id as 'adv' | 'dis'))} className={`${segBtnBase} ${style}`}>
                {label}
              </button>
            );
          })}
        </div>
        {adv && <p className="font-serif text-xs italic text-ink-mute">One-shot — applied to the next leading 1d20, then cleared.</p>}
      </div>

      {/* Formula bar */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display tracking-wide text-ink">Formula</h3>
          <span className="font-serif text-xs italic text-ink-mute">NdX±M · 4d6kh3 · 1d20+5; 1d8+3</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="text" value={formula}
            onChange={(e) => { setFormula(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') rollFormula(); }}
            placeholder="1d20+5; 1d8+3"
            className={`min-w-32 flex-1 ${inputCls} text-base`}
            style={{ fontFamily: 'var(--font-garamond), Georgia, serif' }}
          />
          <button onClick={rollFormula} className={primaryBtn}>Roll</button>
          <button onClick={beginSaveMacro} className={secondaryBtn} title="Save formula as macro"><Plus size={12} /> Macro</button>
        </div>
        {error && <p className="font-serif text-sm italic text-crimson">{error}</p>}
        {savingMacro && (
          <div className="flex items-center gap-1.5 border-t border-rule pt-1">
            <input ref={saveNameRef} type="text" value={savingMacro.name}
              onChange={(e) => setSavingMacro({ ...savingMacro, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSaveMacro(); if (e.key === 'Escape') setSavingMacro(null); }}
              placeholder="Macro name" className={`flex-1 ${inputCls}`}
            />
            <span className="max-w-[40%] truncate font-serif text-xs italic text-ink-mute">{savingMacro.formula}</span>
            <button onClick={commitSaveMacro} className="px-1 text-moss hover:text-ink"><Check size={16} strokeWidth={3} /></button>
            <button onClick={() => setSavingMacro(null)} className="px-1 text-ink-mute hover:text-crimson"><X size={16} /></button>
          </div>
        )}
      </div>

      {/* Macros */}
      <div className={cardCls}>
        <h3 className="font-display tracking-wide text-ink">Macros</h3>
        {safeMacros.length === 0 && <p className="font-serif text-sm italic text-ink-mute">No macros yet — save a formula above for one-click rolls.</p>}
        <div className="space-y-1.5">
          {safeMacros.map((m) =>
            editingMacroId === m.id ? (
              <div key={m.id} className="flex items-center gap-1.5 rounded border border-brass-deep/40 bg-parchment-soft px-2 py-1.5">
                <input type="text" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="Name" className={`flex-1 ${inputCls}`} />
                <input type="text" value={editDraft.formula}
                  onChange={(e) => setEditDraft({ ...editDraft, formula: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEditMacro(); if (e.key === 'Escape') setEditingMacroId(null); }}
                  placeholder="Formula" className={`flex-[1.2] ${inputCls}`}
                />
                <button onClick={commitEditMacro} className="px-1 text-moss hover:text-ink"><Check size={16} strokeWidth={3} /></button>
                <button onClick={() => setEditingMacroId(null)} className="px-1 text-ink-mute hover:text-crimson"><X size={16} /></button>
              </div>
            ) : (
              <div key={m.id} className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate font-display text-sm tracking-wide text-ink">{m.name}</span>
                <span className="hidden max-w-[40%] truncate font-serif text-xs italic text-ink-mute sm:inline">{m.formula}</span>
                <button onClick={() => doRoll(m.formula, m.name)} className="flex-shrink-0 rounded-sm border border-crimson bg-crimson px-2.5 py-0.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson-deep">Roll</button>
                <button onClick={() => beginEditMacro(m)} className="gm-tooltip flex-shrink-0 text-ink-mute hover:text-brass-deep" data-tooltip="Edit Macro" title="Edit" aria-label="Edit Macro"><Pencil size={13} /></button>
                <button onClick={() => deleteMacro(m.id)} className="gm-tooltip flex-shrink-0 text-ink-mute hover:text-crimson" data-tooltip="Delete Macro" title="Delete" aria-label="Delete Macro"><X size={14} /></button>
              </div>
            ),
          )}
        </div>
      </div>

      {/* PC attack macros */}
      {pcMacroGroups.length > 0 && (
        <div className={cardCls}>
          <h3 className="font-display tracking-wide text-ink">Party Macros</h3>
          {pcMacroGroups.map((g) => (
            <div key={g.pcId} className="space-y-1.5">
              <div className="font-display text-xs uppercase tracking-wider text-brass-deep">{g.pcName}</div>
              <div className="space-y-1.5">
                {g.macros.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-display text-sm tracking-wide text-ink">{m.name}</span>
                    <span className="hidden max-w-[40%] truncate font-serif text-xs italic text-ink-mute sm:inline">{m.formula}</span>
                    <button onClick={() => doRoll(m.formula, m.name)} className="flex-shrink-0 rounded-sm border border-crimson bg-crimson px-2.5 py-0.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson-deep">Roll</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <h3 className="font-display tracking-wide text-ink">Recent Rolls</h3>
          {history.length > 0 && (
            <button onClick={() => setHistory([])} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-mute hover:text-crimson">
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
        {history.length === 0 && <p className="font-serif text-sm italic text-ink-mute">Roll something — results appear here.</p>}
        <div className="space-y-1.5">
          {history.map((r) => (
            <div key={r.id} className="group relative rounded border border-rule bg-parchment-soft transition-colors hover:bg-parchment-deep/50">
              <button type="button" onClick={() => doRoll(r.formula, r.label)} className="w-full px-2.5 py-2 pr-9 text-left" title="Click to re-roll">
                <div className="mb-1 flex items-center gap-2">
                  <span className="w-9 flex-shrink-0 font-display text-xs tracking-wider text-ink-mute">{relTime(r.ts, now)}</span>
                  {r.label && (
                    <span className="max-w-[40%] flex-shrink-0 truncate rounded-sm border border-brass-deep/30 bg-brass/15 px-1.5 py-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">{r.label}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-serif text-xs italic text-ink-mute">{r.formula}</span>
                  <span key={r.id} className="gm-roll-total flex-shrink-0 font-display text-2xl leading-none text-crimson" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
                  <RotateCcw size={12} className="hidden flex-shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                </div>
                <div className="space-y-0.5">
                  {r.parts.map((p, i) => (
                    <div key={i} className="flex flex-wrap items-baseline gap-1.5 font-serif text-xs text-ink-soft">
                      <span className="italic text-ink-mute">{p.expr}</span>
                      {p.advMode && (
                        <span className={`font-display text-[10px] uppercase tracking-wider ${p.advMode === 'adv' ? 'text-moss' : 'text-crimson'}`}>{p.advMode}</span>
                      )}
                      {p.dice.map((d, di) => (
                        <span key={di} className="text-ink-mute">d{d.sides}[{renderDiceList(d)}]</span>
                      ))}
                      {p.modifier !== 0 && <span className="text-ink-soft">{p.modifier > 0 ? '+' : ''}{p.modifier}</span>}
                      <span className="ml-auto font-display tracking-wider text-ink">= {p.subtotal}</span>
                    </div>
                  ))}
                </div>
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); saveRollToLog(r); }}
                className="gm-tooltip absolute right-1.5 top-1.5 rounded p-1 text-ink-mute hover:bg-parchment-deep/60 hover:text-brass-deep"
                data-tooltip="Save to Log" title="Save this roll to log" aria-label="Save to log"
              >
                <Save size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <GeneratorLog
        kind="dice"
        entries={logEntries}
        onChange={onLogEntriesChange}
        renderPayload={(entry) => <DiceLogRow roll={entry.payload as Roll} />}
        copyText={(e) => rollToText(e.payload as Roll)}
        emptyHint="Roll dice and click the save icon on any result to keep it here."
      />
    </div>
  );
}
