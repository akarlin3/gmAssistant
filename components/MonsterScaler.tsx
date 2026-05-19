'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Copy, Check, Wand2, Save } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { CR_TO_XP } from '@/lib/encounterMath';
import GeneratorLog from './generators/GeneratorLog';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';

const CR_OPTIONS: string[] = [
  '0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23',
  '24', '25', '26', '27', '28', '29', '30',
];

type NamedBlock = { name: string; description: string };

type ScaledMonster = {
  name: string;
  sourceMonster: string;
  scalingNote: string;
  cr: string;
  size: string;
  type: string;
  alignment: string;
  ac: string;
  hp: string;
  speed: string;
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  savingThrows: string;
  skills: string;
  damageResistances: string;
  damageImmunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  traits: NamedBlock[];
  actions: NamedBlock[];
  legendaryActions: NamedBlock[];
};

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function StatLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="text-xs leading-snug">
      <span className="font-display uppercase tracking-wider text-brass-deep">{label}</span>{' '}
      <span className="font-serif text-ink">{value}</span>
    </div>
  );
}

function AbilityCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center border border-rule bg-parchment-soft rounded-sm py-1.5 px-1">
      <div className="font-display uppercase tracking-wider text-[10px] text-brass-deep">{label}</div>
      <div className="font-serif text-sm leading-tight">
        {score} <span className="text-ink-mute">({abilityMod(score)})</span>
      </div>
    </div>
  );
}

function NamedBlockList({ entries, heading }: { entries: NamedBlock[]; heading?: string }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {heading && (
        <div className="font-display uppercase tracking-wider text-xs text-brass-deep border-b border-rule pb-0.5">
          {heading}
        </div>
      )}
      {entries.map((e, i) => (
        <div key={i} className="text-xs leading-snug">
          <span className="font-display italic text-ink font-semibold">{e.name}.</span>{' '}
          <span className="font-serif text-ink whitespace-pre-wrap">{e.description}</span>
        </div>
      ))}
    </div>
  );
}

function fmtCR(cr: string): string {
  const xp = CR_TO_XP[cr];
  return xp != null ? `${cr} (${xp.toLocaleString()} XP)` : cr;
}

function statblockToText(m: ScaledMonster): string {
  const lines: string[] = [];
  lines.push(m.name);
  lines.push(`${m.size} ${m.type.toLowerCase()}, ${m.alignment}`);
  lines.push('');
  lines.push(`Armor Class ${m.ac}`);
  lines.push(`Hit Points ${m.hp}`);
  lines.push(`Speed ${m.speed}`);
  lines.push('');
  lines.push(
    `STR ${m.abilities.str} (${abilityMod(m.abilities.str)})  ` +
      `DEX ${m.abilities.dex} (${abilityMod(m.abilities.dex)})  ` +
      `CON ${m.abilities.con} (${abilityMod(m.abilities.con)})  ` +
      `INT ${m.abilities.int} (${abilityMod(m.abilities.int)})  ` +
      `WIS ${m.abilities.wis} (${abilityMod(m.abilities.wis)})  ` +
      `CHA ${m.abilities.cha} (${abilityMod(m.abilities.cha)})`,
  );
  lines.push('');
  if (m.savingThrows) lines.push(`Saving Throws ${m.savingThrows}`);
  if (m.skills) lines.push(`Skills ${m.skills}`);
  if (m.damageResistances) lines.push(`Damage Resistances ${m.damageResistances}`);
  if (m.damageImmunities) lines.push(`Damage Immunities ${m.damageImmunities}`);
  if (m.conditionImmunities) lines.push(`Condition Immunities ${m.conditionImmunities}`);
  if (m.senses) lines.push(`Senses ${m.senses}`);
  if (m.languages) lines.push(`Languages ${m.languages}`);
  lines.push(`Challenge ${fmtCR(m.cr)}`);
  if (m.traits.length) {
    lines.push('');
    for (const t of m.traits) lines.push(`${t.name}. ${t.description}`);
  }
  if (m.actions.length) {
    lines.push('');
    lines.push('ACTIONS');
    for (const a of m.actions) lines.push(`${a.name}. ${a.description}`);
  }
  if (m.legendaryActions.length) {
    lines.push('');
    lines.push('LEGENDARY ACTIONS');
    for (const a of m.legendaryActions) lines.push(`${a.name}. ${a.description}`);
  }
  lines.push('');
  lines.push(`Scaled from ${m.sourceMonster} — ${m.scalingNote}`);
  return lines.join('\n');
}

function ScaledStatBlock({ m }: { m: ScaledMonster }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(statblockToText(m));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="border-2 border-brass-deep/60 bg-parchment rounded p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display uppercase tracking-wider text-xl text-crimson">{m.name}</h3>
          <div className="font-serif italic text-ink-soft text-sm">
            {m.size} {m.type.toLowerCase()}, {m.alignment}
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 px-2 py-1 rounded border border-rule text-ink-soft hover:bg-parchment-deep text-[10px] font-display uppercase tracking-wider flex items-center gap-1"
          title="Copy statblock as plain text"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="rounded border border-brass-deep/40 bg-brass/5 px-3 py-2 text-[11px] text-ink-soft font-serif italic leading-snug">
        <span className="not-italic font-display uppercase tracking-wider text-[10px] text-brass-deep">
          Scaled from {m.sourceMonster}:
        </span>{' '}
        {m.scalingNote}
      </div>

      <div className="border-t border-b border-rule py-2 space-y-1">
        <StatLine label="Armor Class" value={m.ac} />
        <StatLine label="Hit Points" value={m.hp} />
        <StatLine label="Speed" value={m.speed} />
      </div>

      <div className="grid grid-cols-6 gap-1">
        <AbilityCell label="Str" score={m.abilities.str} />
        <AbilityCell label="Dex" score={m.abilities.dex} />
        <AbilityCell label="Con" score={m.abilities.con} />
        <AbilityCell label="Int" score={m.abilities.int} />
        <AbilityCell label="Wis" score={m.abilities.wis} />
        <AbilityCell label="Cha" score={m.abilities.cha} />
      </div>

      <div className="border-t border-rule pt-2 space-y-1">
        <StatLine label="Saving Throws" value={m.savingThrows} />
        <StatLine label="Skills" value={m.skills} />
        <StatLine label="Damage Resistances" value={m.damageResistances} />
        <StatLine label="Damage Immunities" value={m.damageImmunities} />
        <StatLine label="Condition Immunities" value={m.conditionImmunities} />
        <StatLine label="Senses" value={m.senses} />
        <StatLine label="Languages" value={m.languages || '—'} />
        <StatLine label="Challenge" value={fmtCR(m.cr)} />
      </div>

      {m.traits.length > 0 && (
        <div className="border-t border-rule pt-2">
          <NamedBlockList entries={m.traits} />
        </div>
      )}

      {m.actions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <NamedBlockList entries={m.actions} heading="Actions" />
        </div>
      )}

      {m.legendaryActions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <NamedBlockList entries={m.legendaryActions} heading="Legendary Actions" />
        </div>
      )}
    </div>
  );
}

export default function MonsterScaler({
  logEntries,
  onLogEntriesChange,
}: {
  logEntries: LogEntry[];
  onLogEntriesChange: (next: LogEntry[]) => void;
}) {
  const [description, setDescription] = useState('');
  const [cr, setCr] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [monster, setMonster] = useState<ScaledMonster | null>(null);
  const [savedScale, setSavedScale] = useState(false);

  const generate = async () => {
    const desc = description.trim();
    if (!desc) {
      setError('Describe the monster you want.');
      return;
    }
    setGenerating(true);
    setError('');
    setSavedScale(false);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generate-monster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ description: desc, cr }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
      if (!body?.monster) throw new Error('Empty response');
      setMonster(body.monster as ScaledMonster);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generate failed';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Scale a Monster to CR</h3>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-sm border border-crimson/60 bg-crimson/10 text-crimson font-display uppercase tracking-wider">
            Pro
          </span>
        </div>
        <p className="text-xs text-ink-soft italic font-serif">
          Describe a monster — its appearance, behavior, role — and pick a target CR. Claude finds the
          closest existing bestiary entry and scales it into a full statblock at the CR you asked for.
        </p>

        <div className="space-y-2">
          <label className="text-xs text-brass-deep font-display uppercase tracking-wider block">
            Monster Concept
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. A coral-armored sea wraith that drowns sailors in their dreams, then drags their bodies through ship hulls."
            rows={3}
            maxLength={600}
            className="w-full bg-parchment-soft border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif placeholder-ink-faint focus:border-crimson focus:outline-none resize-y"
          />
          <div className="text-[10px] text-ink-mute text-right font-serif">
            {description.length} / 600
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">
              Target CR
            </label>
            <select
              value={cr}
              onChange={(e) => setCr(e.target.value)}
              className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
            >
              {CR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c} ({(CR_TO_XP[c] ?? 0).toLocaleString()} XP)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={generate}
            disabled={generating || !description.trim()}
            className="text-xs px-3 py-1.5 rounded border border-crimson bg-crimson text-parchment font-display uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-wine hover:border-wine disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating…' : 'Scale Monster'}
          </button>
        </div>

        {error && (
          <p className="text-xs text-crimson italic font-serif" title={error}>
            {error}
          </p>
        )}
      </div>

      {monster && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!monster) return;
                const title = `${monster.name} · CR ${monster.cr} · from ${monster.sourceMonster}`;
                onLogEntriesChange(appendToLog(logEntries, makeLogEntry('monster-scale', title, monster)));
                setSavedScale(true);
              }}
              disabled={savedScale}
              className="text-xs px-3 py-1.5 rounded border border-brass-deep/60 bg-brass/10 text-brass-deep font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-50 transition-colors"
            >
              {savedScale ? <Check size={12} /> : <Save size={12} />}
              {savedScale ? 'Saved to log' : 'Save to log'}
            </button>
          </div>
          <ScaledStatBlock m={monster} />
        </div>
      )}

      <GeneratorLog
        kind="monster-scale"
        entries={logEntries}
        onChange={onLogEntriesChange}
        renderPayload={(entry) => <ScaledStatBlock m={entry.payload as ScaledMonster} />}
        copyText={(e) => statblockToText(e.payload as ScaledMonster)}
        emptyHint="Scale a monster, then click 'Save to log' to keep it here."
      />
    </div>
  );
}
