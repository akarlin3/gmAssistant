// Solo encounter difficulty helper, extracted verbatim from CampaignEditor.tsx.
// Self-contained presentational component: receives its state and an onChange
// via props.
'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import { CR_TO_XP, encounterMultiplier, difficultyForSolo } from '@/lib/encounterMath';
import type { EncounterMonster, EncounterCalcState } from './prepTypes';

const CR_OPTIONS = ["0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"];

const RATING_COLORS: Record<string, string> = {
  Trivial: 'text-emerald-700 bg-emerald-100/40 border-emerald-700/40',
  Easy:    'text-emerald-700 bg-emerald-100/40 border-emerald-700/40',
  Medium:  'text-yellow-700 bg-yellow-100/50 border-yellow-700/40',
  Hard:    'text-orange-700 bg-orange-100/50 border-orange-700/40',
  Deadly:  'text-red-700 bg-red-100/50 border-red-700/50',
  Lethal:  'text-red-900 bg-red-200/60 border-red-900/60',
};

export const EncounterHelper = ({
  state,
  onChange,
}: {
  state: EncounterCalcState;
  onChange: (s: EncounterCalcState) => void;
}) => {
  const monsters = state.monsters || [];
  const totalCount = monsters.reduce((sum, m) => sum + (m.count || 0), 0);
  const baseXP = monsters.reduce((sum, m) => sum + (CR_TO_XP[m.cr] || 0) * (m.count || 0), 0);
  const mult = encounterMultiplier(totalCount);
  const adjustedXP = Math.round(baseXP * mult);
  const { rating, rationale } = difficultyForSolo(adjustedXP, state.pcLevel || 1, !!state.gestalt);
  const ratingClass = RATING_COLORS[rating] || RATING_COLORS.Medium;

  const updateMonster = (i: number, patch: Partial<EncounterMonster>) => {
    const next = monsters.map((m, j) => j === i ? { ...m, ...patch } : m);
    onChange({ ...state, monsters: next });
  };
  const addMonster = () => {
    if (monsters.length >= 6) return;
    onChange({ ...state, monsters: [...monsters, { cr: '1/4', count: 1 }] });
  };
  const removeMonster = (i: number) => {
    onChange({ ...state, monsters: monsters.filter((_, j) => j !== i) });
  };

  return (
    <div className="rounded border border-amber-900/30 bg-amber-950/10 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-wider text-amber-900">Solo Encounter Helper</span>
        <span className="text-[10px] text-ink-mute italic font-serif">5e SRD thresholds · solo-adjusted</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-soft font-serif">PC Level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={state.pcLevel || 1}
            onChange={(e) => {
              const v = parseInt(e.target.value || '1', 10);
              onChange({ ...state, pcLevel: Math.min(20, Math.max(1, isNaN(v) ? 1 : v)) });
            }}
            className="w-16 bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft font-serif cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!state.gestalt}
            onChange={(e) => onChange({ ...state, gestalt: e.target.checked })}
            className="accent-wine"
          />
          Gestalt PC
          <span className="text-[10px] italic text-ink-mute">(uses full standard thresholds)</span>
        </label>
      </div>
      <div className="space-y-1.5">
        {monsters.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-ink-mute w-4">{i + 1}.</span>
            <label className="text-[10px] text-ink-mute font-display uppercase tracking-wider">CR</label>
            <select
              value={m.cr}
              onChange={(e) => updateMonster(i, { cr: e.target.value })}
              className="bg-parchment-soft border border-rule rounded px-2 py-1 text-xs text-ink font-serif"
            >
              {CR_OPTIONS.map(cr => <option key={cr} value={cr}>{cr}</option>)}
            </select>
            <span className="text-[10px] text-ink-mute font-serif">×</span>
            <input
              type="number"
              min={1}
              max={99}
              value={m.count || 1}
              onChange={(e) => {
                const v = parseInt(e.target.value || '1', 10);
                updateMonster(i, { count: Math.max(1, isNaN(v) ? 1 : v) });
              }}
              className="w-14 bg-parchment-soft border border-rule rounded px-2 py-1 text-xs text-ink font-serif"
            />
            <span className="text-[10px] text-ink-mute font-serif flex-1">
              = {(CR_TO_XP[m.cr] || 0) * (m.count || 0)} XP
            </span>
            <button onClick={() => removeMonster(i)} className="text-ink-mute hover:text-crimson"><X size={12} /></button>
          </div>
        ))}
        {monsters.length < 6 && (
          <button onClick={addMonster} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
            <Plus size={12} /> Add Monster
          </button>
        )}
      </div>
      {monsters.length > 0 && (
        <div className="border-t border-amber-900/20 pt-2 space-y-1 text-xs font-serif">
          <div className="flex justify-between text-ink-soft">
            <span>Base XP</span><span>{baseXP}</span>
          </div>
          <div className="flex justify-between text-ink-soft">
            <span>Group multiplier ({totalCount} creature{totalCount === 1 ? '' : 's'})</span>
            <span>× {mult}</span>
          </div>
          <div className="flex justify-between text-ink font-semibold">
            <span>Adjusted XP</span><span>{adjustedXP}</span>
          </div>
          <div className={`mt-1.5 rounded border px-2 py-1.5 flex items-center justify-between ${ratingClass}`}>
            <span className="font-display uppercase tracking-wider text-xs">{rating}</span>
            <span className="text-[10px] italic">{rationale}</span>
          </div>
        </div>
      )}
    </div>
  );
};
