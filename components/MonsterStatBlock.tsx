'use client';

import { X, Shield, Heart, Zap } from 'lucide-react';
import type { HomebrewMonster } from './MonstersTab';

type Props = {
  monster: HomebrewMonster;
  onClose: () => void;
};

const ABILITIES: Array<{ key: keyof HomebrewMonster; label: string }> = [
  { key: 'strength',     label: 'STR' },
  { key: 'dexterity',    label: 'DEX' },
  { key: 'constitution', label: 'CON' },
  { key: 'intelligence', label: 'INT' },
  { key: 'wisdom',       label: 'WIS' },
  { key: 'charisma',     label: 'CHA' },
];

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function speedString(speed: Record<string, number | boolean>): string {
  if (!speed) return '—';
  return Object.entries(speed)
    .filter(([, v]) => v !== false && v !== 0)
    .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
    .join(', ') || '—';
}

function ActionList({ title, actions }: { title: string; actions: HomebrewMonster['actions'] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="font-display text-[11px] uppercase tracking-wider text-crimson border-b border-rule pb-1">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {actions.map((a, i) => (
          <li key={i} className="font-serif text-sm text-ink-soft">
            <span className="font-semibold italic text-ink">{a.name}.</span>{' '}
            {a.attack_bonus !== undefined && a.attack_bonus !== null && (
              <span className="text-[11px] text-brass-deep">+{a.attack_bonus} to hit · </span>
            )}
            {a.damage_dice && (
              <span className="text-[11px] text-brass-deep">{a.damage_dice} dmg · </span>
            )}
            <span>{a.desc}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function MonsterStatBlock({ monster: m, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-2xl rounded-lg border-2 border-brass-deep bg-parchment shadow-page"
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-brass-deep px-4 py-3 bg-parchment-soft rounded-t-lg">
          <div className="min-w-0">
            <h2 className="font-display text-xl tracking-wide text-crimson sm:text-2xl">{m.name}</h2>
            <p className="font-serif text-xs italic text-ink-soft">
              {[m.size, m.type, m.subtype && `(${m.subtype})`].filter(Boolean).join(' ')}
              {m.alignment ? `, ${m.alignment}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded text-ink-mute hover:text-crimson"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-serif text-sm">
            {typeof m.armor_class === 'number' && (
              <span className="flex items-center gap-1">
                <Shield size={12} className="text-brass-deep" />
                <span className="font-display text-[11px] uppercase tracking-wider text-brass-deep">AC</span>
                <span className="text-ink">{m.armor_class}</span>
                {m.armor_desc && <span className="text-ink-mute text-xs">({m.armor_desc})</span>}
              </span>
            )}
            {typeof m.hit_points === 'number' && (
              <span className="flex items-center gap-1">
                <Heart size={12} className="text-crimson" />
                <span className="font-display text-[11px] uppercase tracking-wider text-brass-deep">HP</span>
                <span className="text-ink">{m.hit_points}</span>
                {m.hit_dice && <span className="text-ink-mute text-xs">({m.hit_dice})</span>}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Zap size={12} className="text-brass-deep" />
              <span className="font-display text-[11px] uppercase tracking-wider text-brass-deep">Speed</span>
              <span className="text-ink">{speedString(m.speed)}</span>
            </span>
            {m.challenge_rating && (
              <span className="flex items-center gap-1">
                <span className="font-display text-[11px] uppercase tracking-wider text-brass-deep">CR</span>
                <span className="text-ink">{m.challenge_rating}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-6 gap-1 rounded border border-rule bg-parchment-soft px-2 py-2 text-center">
            {ABILITIES.map(({ key, label }) => {
              const v = m[key] as number;
              return (
                <div key={label}>
                  <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label}</div>
                  <div className="font-serif text-sm text-ink">{v} <span className="text-ink-mute">({mod(v)})</span></div>
                </div>
              );
            })}
          </div>

          <div className="space-y-0.5 font-serif text-[12px] text-ink-soft">
            {m.damage_vulnerabilities && (
              <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Vulnerabilities · </span>{m.damage_vulnerabilities}</div>
            )}
            {m.damage_resistances && (
              <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Resistances · </span>{m.damage_resistances}</div>
            )}
            {m.damage_immunities && (
              <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Dmg Immunities · </span>{m.damage_immunities}</div>
            )}
            {m.condition_immunities && (
              <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Cond. Immunities · </span>{m.condition_immunities}</div>
            )}
            {m.senses && (
              <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Senses · </span>{m.senses}</div>
            )}
            {m.languages && (
              <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Languages · </span>{m.languages}</div>
            )}
          </div>

          <ActionList title="Special Abilities" actions={m.special_abilities} />
          <ActionList title="Actions" actions={m.actions} />
          <ActionList title="Bonus Actions" actions={m.bonus_actions} />
          <ActionList title="Reactions" actions={m.reactions} />
          {m.legendary_desc && (
            <p className="font-serif text-[12px] italic text-ink-soft">{m.legendary_desc}</p>
          )}
          <ActionList title="Legendary Actions" actions={m.legendary_actions} />

          {m.desc && (
            <section className="space-y-1 border-t border-rule pt-2">
              <p className="font-serif text-[12px] italic text-ink-soft whitespace-pre-wrap">{m.desc}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
