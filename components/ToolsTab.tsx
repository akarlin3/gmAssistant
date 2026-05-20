'use client';

import { useState } from 'react';
import { Minus, Plus, RotateCcw, Check } from 'lucide-react';
import {
  ABILITY_KEYS,
  ABILITY_LABEL,
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  abilityMod,
  canDecrement,
  canIncrement,
  costForScore,
  emptyPointBuy,
  finalScore,
  formatMod,
  remainingPoints,
  totalCost,
  type AbilityKey,
  type PointBuy,
} from '@/lib/pointBuy';
import type { Character } from '@/lib/character-schema';

type Props = {
  characters: Character[];
  onChangeCharacter: (id: string, patch: Character) => void;
};

export default function ToolsTab({ characters, onChangeCharacter }: Props) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="font-display tracking-wide text-ink text-lg uppercase">Tools</h2>
        <p className="text-xs text-ink-mute italic font-serif">
          Utilities for character creation and table prep. Standard 5e point-buy: 27 points,
          base scores 8–15 (costs 1 per point to 13, then 2 per point to 15).
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="font-display tracking-wide text-ink uppercase text-sm">Point-Buy Calculator</h3>
        {characters.length === 0 ? (
          <div className="rounded border border-rule bg-parchment p-4 text-sm text-ink-mute italic font-serif">
            Add a character on the Prep Flow tab to start a point-buy.
          </div>
        ) : (
          <div className="space-y-4">
            {characters.map((c) => (
              <PointBuyCard
                key={c.id}
                character={c}
                onChange={(patch) => onChangeCharacter(c.id, patch)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PointBuyCard({
  character,
  onChange,
}: {
  character: Character;
  onChange: (patch: Character) => void;
}) {
  const pb: PointBuy = character.pointBuy ?? emptyPointBuy();
  const [applied, setApplied] = useState(false);
  const remaining = remainingPoints(pb.base);
  const spent = totalCost(pb.base);

  const setPointBuy = (next: PointBuy) => {
    setApplied(false);
    onChange({ ...character, pointBuy: next });
  };

  const bump = (key: AbilityKey, dir: 1 | -1) => {
    const allowed = dir === 1 ? canIncrement(pb.base, key) : canDecrement(pb.base, key);
    if (!allowed) return;
    const nextBase = { ...pb.base, [key]: pb.base[key] + dir };
    setPointBuy({ ...pb, base: nextBase });
  };

  const setRacial = (key: AbilityKey, raw: string) => {
    const n = raw === '' || raw === '-' ? 0 : parseInt(raw, 10);
    const next = Number.isFinite(n) ? n : 0;
    setPointBuy({ ...pb, racial: { ...pb.racial, [key]: next } });
  };

  const reset = () => setPointBuy(emptyPointBuy());

  const apply = () => {
    const nextAbilities = {
      str: String(finalScore(pb.base.str, pb.racial.str)),
      dex: String(finalScore(pb.base.dex, pb.racial.dex)),
      con: String(finalScore(pb.base.con, pb.racial.con)),
      int: String(finalScore(pb.base.int, pb.racial.int)),
      wis: String(finalScore(pb.base.wis, pb.racial.wis)),
      cha: String(finalScore(pb.base.cha, pb.racial.cha)),
    };
    onChange({ ...character, pointBuy: pb, abilities: nextAbilities });
    setApplied(true);
  };

  const overBudget = remaining < 0;
  const title = (character.name || '').trim() || 'Unnamed Character';

  return (
    <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-display tracking-wide text-ink truncate">{title}</div>
          {character.race || character.classLevel ? (
            <div className="text-[11px] text-ink-mute italic font-serif truncate">
              {[character.race, character.classLevel].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-display uppercase tracking-wider">
            <span className="text-ink-mute">Spent</span>{' '}
            <span className={overBudget ? 'text-crimson' : 'text-brass-deep'}>{spent}</span>
            <span className="text-ink-mute"> / {POINT_BUY_BUDGET}</span>
          </div>
          <div className="text-xs font-display uppercase tracking-wider">
            <span className="text-ink-mute">Left</span>{' '}
            <span className={overBudget ? 'text-crimson' : 'text-ink'}>{remaining}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-display uppercase tracking-wider text-ink-mute">
              <th className="text-left py-1 pr-2">Ability</th>
              <th className="text-center py-1 px-2">Base (8–15)</th>
              <th className="text-center py-1 px-2">Cost</th>
              <th className="text-center py-1 px-2">Racial / ASI</th>
              <th className="text-center py-1 px-2">Total</th>
              <th className="text-center py-1 pl-2">Mod</th>
            </tr>
          </thead>
          <tbody>
            {ABILITY_KEYS.map((k) => {
              const base = pb.base[k];
              const racial = pb.racial[k];
              const total = finalScore(base, racial);
              const incBlocked = !canIncrement(pb.base, k);
              const decBlocked = !canDecrement(pb.base, k);
              return (
                <tr key={k} className="border-t border-rule/60">
                  <td className="py-1.5 pr-2 font-display uppercase tracking-wider text-xs text-ink">
                    {ABILITY_LABEL[k]}
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Decrease ${ABILITY_LABEL[k]}`}
                        onClick={() => bump(k, -1)}
                        disabled={decBlocked}
                        className="w-6 h-6 rounded-sm border border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brass-deep disabled:hover:border-brass-deep/50 transition-colors flex items-center justify-center"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="font-display text-base tabular-nums w-6 text-center">{base}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${ABILITY_LABEL[k]}`}
                        onClick={() => bump(k, 1)}
                        disabled={incBlocked}
                        className="w-6 h-6 rounded-sm border border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brass-deep disabled:hover:border-brass-deep/50 transition-colors flex items-center justify-center"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center text-ink-soft tabular-nums text-xs">
                    {costForScore(base)}
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={racial === 0 ? '' : racial}
                      onChange={(e) => setRacial(k, e.target.value)}
                      placeholder="0"
                      className="w-14 mx-auto block text-center text-sm tabular-nums px-1 py-0.5 rounded-sm border border-rule bg-parchment-soft text-ink focus:outline-none focus:border-brass-deep"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-center font-display text-base tabular-nums text-ink">
                    {total}
                  </td>
                  <td className="py-1.5 pl-2 text-center text-ink-soft tabular-nums text-xs">
                    {formatMod(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <p className="text-[11px] text-ink-mute italic font-serif">
          Base scores limited to {POINT_BUY_MIN}–{POINT_BUY_MAX}. Apply writes the
          final totals (base + racial) to the character&rsquo;s ability scores.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="text-xs px-2.5 py-1 rounded-sm border border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass font-display uppercase tracking-wider flex items-center gap-1 transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={overBudget}
            className="text-xs px-3 py-1 rounded-sm border border-crimson bg-crimson text-parchment hover:bg-crimson-deep disabled:opacity-40 disabled:hover:bg-crimson font-display uppercase tracking-wider flex items-center gap-1 transition-colors"
          >
            <Check size={12} /> {applied ? 'Applied' : 'Apply to Character'}
          </button>
        </div>
      </div>
    </div>
  );
}
