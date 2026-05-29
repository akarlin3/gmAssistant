'use client';

import { useMemo, useState } from 'react';
import {
  X, Plus, ChevronRight, ChevronLeft, Swords, Skull, Heart, Shield, Flag,
} from 'lucide-react';
import {
  type Combatant, type CombatantSide, type InitiativeState,
  CONDITIONS,
  sortInitiative, rollInitiative, makeCombatantId, nextTurn, prevTurn,
  emptyInitiative, abilityMod,
} from '@/lib/initiative';
import type { HomebrewMonster } from './MonstersTab';
import type { PlayerCharacter } from '@/lib/pc/types';
import MonsterStatBlock from './MonsterStatBlock';

type Props = {
  state: InitiativeState | null;
  onChange: (next: InitiativeState | null) => void;
  monsters: HomebrewMonster[];
  pcs: PlayerCharacter[];
  onClose: () => void;
  variant?: 'floating' | 'inline';
  onEnded?: (summary: string) => void;
};

const SIDE_LABEL: Record<CombatantSide, string> = {
  pc: 'PC', ally: 'Ally', enemy: 'Enemy', neutral: 'Neutral',
};

const SIDE_BORDER: Record<CombatantSide, string> = {
  pc: 'border-l-emerald-600',
  ally: 'border-l-sky-600',
  enemy: 'border-l-crimson',
  neutral: 'border-l-ink-mute',
};

const SIDE_BADGE: Record<CombatantSide, string> = {
  pc: 'bg-emerald-100/60 text-emerald-800 border-emerald-700/40',
  ally: 'bg-sky-100/60 text-sky-800 border-sky-700/40',
  enemy: 'bg-crimson/10 text-crimson border-crimson/40',
  neutral: 'bg-parchment-deep text-ink-soft border-rule',
};

function hpExtractMax(hpString: string | undefined): number {
  if (!hpString) return 0;
  const m = hpString.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

export default function InitiativePanel({
  state, onChange, monsters, pcs, onClose, variant = 'floating', onEnded,
}: Props) {
  const [addMode, setAddMode] = useState<'monster' | 'pc' | 'manual' | null>(null);
  const [selectedPcInit, setSelectedPcInit] = useState<{pc: PlayerCharacter, init: number} | null>(null);
  const [search, setSearch] = useState('');
  const [manualForm, setManualForm] = useState({
    name: '', initiative: 10, hpMax: 10, side: 'enemy' as CombatantSide,
  });
  const [statBlockSlug, setStatBlockSlug] = useState<string | null>(null);
  const statBlockMonster = useMemo(
    () => (statBlockSlug ? monsters.find(m => m.slug === statBlockSlug) ?? null : null),
    [statBlockSlug, monsters],
  );

  const init = state || emptyInitiative();
  const sorted = useMemo(() => sortInitiative(init.combatants), [init.combatants]);
  const active = sorted[init.activeIndex] || null;

  const update = (patch: Partial<InitiativeState>) => onChange({ ...init, ...patch });

  const updateCombatant = (id: string, patch: Partial<Combatant>) => {
    const combatants = init.combatants.map(c => c.id === id ? { ...c, ...patch } : c);
    onChange({ ...init, combatants });
  };

  const removeCombatant = (id: string) => {
    const idxOld = sorted.findIndex(c => c.id === id);
    const combatants = init.combatants.filter(c => c.id !== id);
    const sortedNext = sortInitiative(combatants);
    let activeIndex = init.activeIndex;
    if (idxOld < init.activeIndex) activeIndex = Math.max(0, init.activeIndex - 1);
    if (activeIndex >= sortedNext.length) activeIndex = 0;
    onChange({ ...init, combatants, activeIndex });
  };

  const setActiveById = (id: string) => {
    const idx = sorted.findIndex(c => c.id === id);
    if (idx >= 0) update({ activeIndex: idx });
  };

  const addCombatant = (c: Combatant) => {
    const combatants = [...init.combatants, c];
    onChange({ ...init, combatants });
  };

  const addFromMonster = (m: HomebrewMonster) => {
    const hpMax = typeof m.hit_points === 'number' && m.hit_points > 0 ? m.hit_points : 10;
    const dexMod = abilityMod(m.dexterity);
    const c: Combatant = {
      id: makeCombatantId(),
      name: m.name,
      initiative: rollInitiative(dexMod),
      hp: { current: hpMax, max: hpMax },
      ac: m.armor_class ?? undefined,
      conditions: [],
      side: 'enemy',
      sourceMonsterId: m.slug,
    };
    addCombatant(c);
    setAddMode(null);
    setSearch('');
  };

  const addFromPC = (pc: PlayerCharacter, overrideInit?: number) => {
    const hpMax = pc.hp.max || 10;
    const initiative = overrideInit ?? rollInitiative(pc.initiativeMod);
    const c: Combatant = {
      id: makeCombatantId(),
      name: pc.name || 'PC',
      initiative,
      hp: { current: pc.hp.current || hpMax, max: hpMax },
      ac: pc.ac,
      conditions: [...pc.conditions],
      side: 'pc',
      refPcId: pc.id,
      ...(pc.exhaustion ? { exhaustion: pc.exhaustion } : {}),
    };
    addCombatant(c);
    setAddMode(null);
    setSelectedPcInit(null);
  };

  // Bulk-add every first-class PC (data.pcs) as a combatant. Initiative is left
  // at 0 for the GM to roll/fill; HP, AC, conditions, and exhaustion carry over.
  const addParty = () => {
    if (pcs.length === 0) return;
    const existingRefs = new Set(
      init.combatants.map((c) => c.refPcId).filter(Boolean),
    );
    const additions: Combatant[] = pcs
      .filter((pc) => !existingRefs.has(pc.id))
      .map((pc) => ({
        id: makeCombatantId(),
        name: pc.name || 'PC',
        initiative: 0,
        hp: { current: pc.hp.current, max: pc.hp.max, temp: pc.hp.temp || undefined },
        ac: pc.ac,
        conditions: [...pc.conditions],
        side: 'pc' as CombatantSide,
        refPcId: pc.id,
        ...(pc.exhaustion ? { exhaustion: pc.exhaustion } : {}),
      }));
    if (additions.length === 0) return;
    onChange({ ...init, combatants: [...init.combatants, ...additions] });
    setAddMode(null);
  };

  const addManual = () => {
    const c: Combatant = {
      id: makeCombatantId(),
      name: manualForm.name.trim() || 'Combatant',
      initiative: manualForm.initiative,
      hp: { current: manualForm.hpMax, max: manualForm.hpMax },
      conditions: [],
      side: manualForm.side,
    };
    addCombatant(c);
    setManualForm({ name: '', initiative: 10, hpMax: 10, side: 'enemy' });
    setAddMode(null);
  };

  const rollAllInitiative = () => {
    const combatants = init.combatants.map(c => {
      if (c.initiative && c.initiative !== 0) return c;
      if (c.sourceMonsterId) {
        const m = monsters.find(x => x.slug === c.sourceMonsterId);
        const mod = m ? abilityMod(m.dexterity) : 0;
        return { ...c, initiative: rollInitiative(mod) };
      }
      if (c.side === 'pc') {
        const pc = pcs.find(p => p.name === c.name || p.id === c.refPcId);
        const mod = pc ? pc.initiativeMod : 0;
        return { ...c, initiative: rollInitiative(mod) };
      }
      return { ...c, initiative: rollInitiative(0) };
    });
    onChange({ ...init, combatants });
  };

  const endEncounter = () => {
    if (init.combatants.length > 0 && !confirm('End encounter and clear initiative?')) return;
    const standing = init.combatants.filter(c => c.hp.current > 0);
    const downed = init.combatants.filter(c => c.hp.current <= 0);
    const summary = `Encounter ended after ${init.round} round${init.round === 1 ? '' : 's'}. Standing: ${standing.map(c => c.name).join(', ') || 'none'}. Down: ${downed.map(c => c.name).join(', ') || 'none'}.`;
    onChange(null);
    onEnded?.(summary);
  };

  const toggleCondition = (id: string, condition: string) => {
    const c = init.combatants.find(x => x.id === id);
    if (!c) return;
    const has = c.conditions.includes(condition);
    updateCombatant(id, {
      conditions: has ? c.conditions.filter(x => x !== condition) : [...c.conditions, condition],
    });
  };

  const adjustHp = (id: string, delta: number) => {
    const c = init.combatants.find(x => x.id === id);
    if (!c) return;
    updateCombatant(id, {
      hp: { ...c.hp, current: Math.max(0, Math.min(c.hp.max, c.hp.current + delta)) },
    });
  };

  const filteredMonsters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return monsters.slice(0, 30);
    return monsters.filter(m => m.name.toLowerCase().includes(q)).slice(0, 30);
  }, [monsters, search]);

  const containerCls = variant === 'floating'
    ? 'fixed bottom-[88px] right-3 left-3 md:left-auto md:w-[360px] max-h-[70vh] md:max-h-[75vh] flex flex-col rounded-lg border border-rule bg-parchment-soft shadow-page z-30'
    : 'flex flex-col rounded border border-rule bg-parchment-soft';

  return (
    <div className={containerCls}>
      <div className="flex items-center justify-between gap-2 border-b border-rule bg-parchment px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Swords size={14} className="flex-shrink-0 text-crimson" />
          {variant !== 'inline' && (
            <span className="truncate font-display text-sm uppercase tracking-wider text-ink">Initiative</span>
          )}
          <span className="flex-shrink-0 whitespace-nowrap font-display text-xs text-brass-deep">Round {init.round}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={() => update(prevTurn(init))}
            disabled={init.combatants.length === 0}
            className="flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep disabled:cursor-not-allowed disabled:opacity-40"
            title="Previous turn"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            onClick={() => update(nextTurn(init))}
            disabled={init.combatants.length === 0}
            className="flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
            title="Next turn"
          >
            Next <ChevronRight size={12} />
          </button>
          {variant !== 'inline' && (
            <button onClick={onClose} className="ml-1 flex-shrink-0 text-ink-mute hover:text-crimson" title="Close">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {active && (
          <div className="border-b border-rule bg-brass/5 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {active.sourceMonsterId && monsters.some(m => m.slug === active.sourceMonsterId) ? (
                    <button
                      onClick={() => setStatBlockSlug(active.sourceMonsterId!)}
                      className="truncate font-display text-base tracking-wide text-ink underline decoration-brass-deep decoration-dotted underline-offset-2 hover:text-crimson"
                      title="Open stat block"
                    >
                      {active.name}
                    </button>
                  ) : (
                    <span className="truncate font-display text-base tracking-wide text-ink">{active.name}</span>
                  )}
                  <span className={`rounded-sm border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider ${SIDE_BADGE[active.side]}`}>{SIDE_LABEL[active.side]}</span>
                </div>
                <div className="font-serif text-[11px] text-ink-mute">
                  Init {active.initiative}{typeof active.ac === 'number' ? ` · AC ${active.ac}` : ''}
                </div>
              </div>
              <button onClick={() => removeCombatant(active.id)} className="text-ink-mute hover:text-crimson" title="Remove">
                <X size={14} />
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Heart size={12} className="flex-shrink-0 text-crimson" />
              <button onClick={() => adjustHp(active.id, -5)} className="min-h-[44px] min-w-[44px] rounded border border-rule px-2 py-1 text-xs text-ink-soft hover:bg-parchment-deep">−5</button>
              <button onClick={() => adjustHp(active.id, -1)} className="min-h-[44px] min-w-[44px] rounded border border-rule px-2 py-1 text-xs text-ink-soft hover:bg-parchment-deep">−1</button>
              <input
                type="number"
                value={active.hp.current}
                onChange={(e) => {
                  const v = parseInt(e.target.value || '0', 10);
                  updateCombatant(active.id, { hp: { ...active.hp, current: isNaN(v) ? 0 : v } });
                }}
                className="min-h-[44px] w-14 rounded border border-rule bg-parchment-soft px-1 py-0.5 text-center font-serif text-sm text-ink"
              />
              <span className="font-serif text-xs text-ink-mute">/ {active.hp.max}</span>
              <button onClick={() => adjustHp(active.id, 1)} className="min-h-[44px] min-w-[44px] rounded border border-rule px-2 py-1 text-xs text-ink-soft hover:bg-parchment-deep">+1</button>
              <button onClick={() => adjustHp(active.id, 5)} className="min-h-[44px] min-w-[44px] rounded border border-rule px-2 py-1 text-xs text-ink-soft hover:bg-parchment-deep">+5</button>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-sm border border-rule bg-parchment-deep">
              <div
                className={`h-full transition-all ${active.hp.current <= 0 ? 'bg-ink-mute' : active.hp.current / active.hp.max <= 0.5 ? 'bg-crimson' : 'bg-emerald-700'}`}
                style={{ width: `${Math.max(0, Math.min(100, (active.hp.current / Math.max(1, active.hp.max)) * 100))}%` }}
              />
            </div>

            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Conditions</span>
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) toggleCondition(active.id, e.target.value); }}
                  className="min-h-[44px] rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[10px] text-ink-soft"
                >
                  <option value="">+ Add…</option>
                  {CONDITIONS.filter(c => !active.conditions.includes(c)).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {active.conditions.length === 0 ? (
                <span className="font-serif text-[10px] italic text-ink-mute">None</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {active.conditions.map(c => (
                    <button
                      key={c}
                      onClick={() => toggleCondition(active.id, c)}
                      className="flex min-h-[44px] items-center gap-1 rounded border border-wine/40 bg-wine/10 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-wine hover:bg-wine hover:text-parchment"
                    >
                      {c} <X size={9} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <ul className="divide-y divide-rule">
          {sorted.length === 0 && (
            <li className="px-3 py-4 text-center font-serif text-xs italic text-ink-mute">
              No combatants yet. Add a monster, PC, or manual entry below.
            </li>
          )}
          {sorted.map((c, i) => {
            const isActive = c.id === active?.id;
            return (
              <li
                key={c.id}
                className={`border-l-4 px-3 py-1.5 ${SIDE_BORDER[c.side]} ${isActive ? 'bg-brass/10' : 'cursor-pointer hover:bg-parchment-deep'}`}
                onClick={() => !isActive && setActiveById(c.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 text-right font-display text-xs text-brass-deep">{c.initiative}</span>
                  <span className={`flex-1 truncate font-serif text-sm ${c.hp.current <= 0 ? 'text-ink-mute line-through' : 'text-ink'}`}>
                    {c.name}
                  </span>
                  {c.hp.current <= 0 && <Skull size={12} className="flex-shrink-0 text-ink-mute" />}
                  <span className="flex-shrink-0 font-serif text-[11px] tabular-nums text-ink-soft">
                    {c.hp.current}/{c.hp.max}
                  </span>
                  {typeof c.ac === 'number' && (
                    <span className="flex flex-shrink-0 items-center gap-0.5 font-serif text-[10px] text-ink-mute">
                      <Shield size={9} /> {c.ac}
                    </span>
                  )}
                  {c.sourceMonsterId && monsters.some(m => m.slug === c.sourceMonsterId) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setStatBlockSlug(c.sourceMonsterId!); }}
                      className="flex-shrink-0 font-display text-[10px] uppercase tracking-wider text-brass-deep underline decoration-dotted underline-offset-2 hover:text-crimson"
                      title="Open stat block"
                    >
                      Stat
                    </button>
                  )}
                </div>
                {c.conditions.length > 0 && (
                  <div className="ml-7 mt-0.5 flex flex-wrap gap-0.5">
                    {c.conditions.map(cond => (
                      <span key={cond} className="rounded bg-wine/10 px-1 font-display text-[9px] uppercase tracking-wider text-wine">{cond}</span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 border-t border-rule bg-parchment px-3 py-2">
        {addMode === null && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setAddMode('monster')} className="flex items-center gap-1 rounded border border-brass-deep/60 bg-brass/10 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment">
              <Plus size={11} /> Monster
            </button>
            <button onClick={() => setAddMode('pc')} className="flex items-center gap-1 rounded border border-emerald-700/60 bg-emerald-100/40 px-2 py-1 font-display text-xs uppercase tracking-wider text-emerald-800 hover:bg-emerald-700 hover:text-parchment">
              <Plus size={11} /> PC
            </button>
            {pcs.length > 0 && (
              <button onClick={addParty} className="flex items-center gap-1 rounded border border-emerald-700/60 bg-emerald-100/40 px-2 py-1 font-display text-xs uppercase tracking-wider text-emerald-800 hover:bg-emerald-700 hover:text-parchment" title="Add all party PCs as combatants">
                <Plus size={11} /> Add Party
              </button>
            )}
            <button onClick={() => setAddMode('manual')} className="flex items-center gap-1 rounded border border-rule px-2 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep">
              <Plus size={11} /> Manual
            </button>
            {init.combatants.length > 0 && (
              <>
                <button onClick={rollAllInitiative} className="ml-auto rounded border border-rule px-2 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep">
                  Roll All
                </button>
                <button onClick={endEncounter} className="flex items-center gap-1 rounded border border-crimson/60 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment">
                  <Flag size={11} /> End
                </button>
              </>
            )}
          </div>
        )}

        {addMode === 'monster' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search monsters…"
                className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
              />
              <button onClick={() => { setAddMode(null); setSearch(''); }} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {filteredMonsters.length === 0 && (
                <p className="px-1 font-serif text-[11px] italic text-ink-mute">No matches. Add monsters in the Monsters tab.</p>
              )}
              {filteredMonsters.map(m => (
                <button
                  key={m.slug}
                  onClick={() => addFromMonster(m)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-serif text-xs text-ink-soft hover:bg-parchment-deep hover:text-ink"
                >
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-[10px] text-ink-mute">CR {m.challenge_rating}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {addMode === 'pc' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Add PC</span>
              <button onClick={() => { setAddMode(null); setSelectedPcInit(null); }} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {pcs.length === 0 && (
                <p className="px-1 font-serif text-[11px] italic text-ink-mute">No characters yet. Add some on the Party tab.</p>
              )}
              {pcs.map(pc => (
                <div key={pc.id}>
                  <button
                    onClick={() => setSelectedPcInit({ pc, init: rollInitiative(pc.initiativeMod) })}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-serif text-xs text-ink-soft hover:bg-parchment-deep hover:text-ink"
                  >
                    <span className="flex-1 truncate">{pc.name || 'Unnamed'}</span>
                    <span className="text-[10px] text-ink-mute">
                      {pc.classes.map(cl => `${cl.name} ${cl.level}`).join(' / ') || '—'}
                    </span>
                  </button>
                  {selectedPcInit?.pc.id === pc.id && (
                    <div className="mt-1 flex items-center gap-2 rounded border border-brass/30 bg-brass/10 px-2 py-1.5">
                      <span className="flex-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Initiative:</span>
                      <input
                        type="number"
                        value={selectedPcInit.init}
                        onChange={e => setSelectedPcInit({ pc, init: parseInt(e.target.value || '0', 10) || 0 })}
                        className="w-12 rounded border border-rule bg-parchment-soft px-1 py-0.5 text-center font-serif text-xs text-ink"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') addFromPC(pc, selectedPcInit.init); }}
                      />
                      <button
                        onClick={() => addFromPC(pc, selectedPcInit.init)}
                        className="rounded bg-brass px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-brass-deep"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {addMode === 'manual' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Add Manual</span>
              <button onClick={() => setAddMode(null)} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
            </div>
            <input
              autoFocus
              value={manualForm.name}
              onChange={(e) => setManualForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <label className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                Init
                <input
                  type="number"
                  value={manualForm.initiative}
                  onChange={(e) => setManualForm(f => ({ ...f, initiative: parseInt(e.target.value || '0', 10) || 0 }))}
                  className="w-full rounded border border-rule bg-parchment-soft px-1 py-0.5 font-serif text-xs text-ink"
                />
              </label>
              <label className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                Max HP
                <input
                  type="number"
                  min={1}
                  value={manualForm.hpMax}
                  onChange={(e) => setManualForm(f => ({ ...f, hpMax: Math.max(1, parseInt(e.target.value || '1', 10) || 1) }))}
                  className="w-full rounded border border-rule bg-parchment-soft px-1 py-0.5 font-serif text-xs text-ink"
                />
              </label>
              <label className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                Side
                <select
                  value={manualForm.side}
                  onChange={(e) => setManualForm(f => ({ ...f, side: e.target.value as CombatantSide }))}
                  className="w-full rounded border border-rule bg-parchment-soft px-1 py-0.5 font-serif text-xs text-ink"
                >
                  <option value="pc">PC</option>
                  <option value="ally">Ally</option>
                  <option value="enemy">Enemy</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
            </div>
            <button
              onClick={addManual}
              className="w-full rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
            >
              Add
            </button>
          </div>
        )}

        {init.log.length > 0 && (
          <details className="font-serif text-[10px] text-ink-mute">
            <summary className="cursor-pointer font-display uppercase tracking-wider hover:text-ink-soft">Round Log ({init.log.length})</summary>
            <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
              {init.log.slice(-12).map((l, i) => (
                <li key={i}>R{l.round}: {l.text}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {statBlockMonster && (
        <MonsterStatBlock monster={statBlockMonster} onClose={() => setStatBlockSlug(null)} />
      )}
    </div>
  );
}
