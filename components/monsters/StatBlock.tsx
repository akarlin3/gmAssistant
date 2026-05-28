import { Wand2 } from 'lucide-react';
import type { Action, Monster } from './types';
import { mod, fmtSkills, fmtSaves, fmtCR, fmtTypeLine, fmtSpeed } from './format';

export const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-sm border px-2 py-0.5 font-display uppercase tracking-wider transition-colors ${
      active
        ? 'border-crimson bg-crimson text-parchment'
        : 'border-rule text-ink-soft hover:bg-parchment-deep'
    }`}
  >
    {children}
  </button>
);

function AbilityCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-sm border border-rule bg-parchment-soft px-1 py-1.5 text-center">
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label}</div>
      <div className="font-serif text-sm leading-tight">
        {score} <span className="text-ink-mute">({mod(score)})</span>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className="text-xs leading-snug">
      <span className="font-display uppercase tracking-wider text-brass-deep">{label}</span>{' '}
      <span className="font-serif text-ink">{value}</span>
    </div>
  );
}

function ActionBlock({ entries, heading }: { entries: Action[]; heading?: string }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {heading && (
        <div className="border-b border-rule pb-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">
          {heading}
        </div>
      )}
      {entries.map((a, i) => (
        <div key={i} className="text-xs leading-snug">
          <span className="font-display font-semibold italic text-ink">{a.name}.</span>{' '}
          <span className="whitespace-pre-wrap font-serif text-ink">{a.desc}</span>
        </div>
      ))}
    </div>
  );
}

export function StatBlock({ m }: { m: Monster }) {
  return (
    <div className="space-y-3 rounded border-2 border-brass-deep/60 bg-parchment p-4 shadow-sm">
      <div>
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-display text-xl uppercase tracking-wider text-crimson">
            {m.name || (m.homebrew ? 'Untitled Homebrew' : '')}
          </h3>
          {m.homebrew && (
            <span
              className="mt-1 inline-flex items-center gap-0.5 rounded-sm border border-wine/60 px-1.5 py-0.5 font-display text-[10px] tracking-wider text-wine"
              title="Homebrew"
            >
              <Wand2 size={10} /> HB
            </span>
          )}
        </div>
        <div className="font-serif text-sm italic text-ink-soft">{fmtTypeLine(m)}</div>
      </div>

      <div className="space-y-1 border-y border-rule py-2">
        <StatLine
          label="Armor Class"
          value={m.armor_class != null ? `${m.armor_class}${m.armor_desc ? ` (${m.armor_desc})` : ''}` : '—'}
        />
        <StatLine
          label="Hit Points"
          value={m.hit_points != null ? `${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ''}` : '—'}
        />
        <StatLine label="Speed" value={fmtSpeed(m.speed)} />
      </div>

      <div className="grid grid-cols-6 gap-1">
        <AbilityCell label="Str" score={m.strength} />
        <AbilityCell label="Dex" score={m.dexterity} />
        <AbilityCell label="Con" score={m.constitution} />
        <AbilityCell label="Int" score={m.intelligence} />
        <AbilityCell label="Wis" score={m.wisdom} />
        <AbilityCell label="Cha" score={m.charisma} />
      </div>

      <div className="space-y-1 border-t border-rule pt-2">
        <StatLine label="Saving Throws" value={fmtSaves(m) || undefined} />
        <StatLine label="Skills" value={fmtSkills(m.skills) || undefined} />
        <StatLine label="Damage Vulnerabilities" value={m.damage_vulnerabilities} />
        <StatLine label="Damage Resistances" value={m.damage_resistances} />
        <StatLine label="Damage Immunities" value={m.damage_immunities} />
        <StatLine label="Condition Immunities" value={m.condition_immunities} />
        <StatLine label="Senses" value={m.senses} />
        <StatLine label="Languages" value={m.languages || '—'} />
        <StatLine label="Challenge" value={fmtCR(m.challenge_rating)} />
      </div>

      {m.special_abilities.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.special_abilities} />
        </div>
      )}

      {m.actions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.actions} heading="Actions" />
        </div>
      )}

      {m.bonus_actions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.bonus_actions} heading="Bonus Actions" />
        </div>
      )}

      {m.reactions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.reactions} heading="Reactions" />
        </div>
      )}

      {m.legendary_actions.length > 0 && (
        <div className="space-y-1.5 border-t border-rule pt-2">
          <div className="border-b border-rule pb-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">
            Legendary Actions
          </div>
          {m.legendary_desc && (
            <div className="whitespace-pre-wrap font-serif text-xs italic text-ink-soft">{m.legendary_desc}</div>
          )}
          <ActionBlock entries={m.legendary_actions} />
        </div>
      )}

      {m.desc && (
        <div className="border-t border-rule pt-2">
          <details className="text-xs">
            <summary className="cursor-pointer font-display uppercase tracking-wider text-brass-deep">
              Lore
            </summary>
            <div className="mt-1 whitespace-pre-wrap font-serif text-ink">{m.desc}</div>
          </details>
        </div>
      )}

      <div className="pt-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
        Source: {m.source || 'Unknown'}
        {m.homebrew && ' · Homebrew'}
      </div>
    </div>
  );
}
