// @ts-nocheck
import React, { useState, useContext } from 'react';
import { CampaignPlayModeContext } from '../CampaignPlayModeContext';
import { X, ChevronDown, ChevronRight, Play, Eye, EyeOff } from 'lucide-react';
import { Field, ListField, Inspire, renownRank } from '../CampaignEditor';
import type { SessionLog, DowntimeEntry, Character } from '@/lib/types';
import { normalizeCharacter, emptyCharacter } from '@/lib/characters';

export const CardLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5">{children}</div>
);

export const FactionCard = ({ data, onChange, onRemove }: any) => {
  const renown = typeof data.renown === 'number' ? data.renown : 0;
  const rank = renownRank(renown, data.rankLabels);
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between items-center gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Faction Name" />
        <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
      </div>
      <div><CardLabel>Archetype</CardLabel>
        <select value={data.archetype || ''} onChange={(e) => onChange({ ...data, archetype: e.target.value })} className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif">
          <option value="">— Choose —</option>
          <option>Government (preserves order/stability)</option>
          <option>Religious</option><option>Criminal / underground</option><option>Mercantile</option>
          <option>Military</option><option>Cult</option><option>Scholarly</option>
          <option>Revolutionary</option><option>Other</option>
        </select></div>
      <div><CardLabel>Identity</CardLabel>
        <Field value={data.identity} onChange={(v) => onChange({ ...data, identity: v })} placeholder="One sentence" rows={2} /></div>
      <div><CardLabel>Area of Operation</CardLabel>
        <Field value={data.area} onChange={(v) => onChange({ ...data, area: v })} placeholder="Where active" /></div>
      <div><CardLabel>Power Level</CardLabel>
        <Field value={data.power} onChange={(v) => onChange({ ...data, power: v })} placeholder="Resources" /></div>
      <div><CardLabel>Ideology</CardLabel>
        <Field value={data.ideology} onChange={(v) => onChange({ ...data, ideology: v })} placeholder="Why they do it" rows={2} /></div>
      <div><CardLabel>Short-Term Goals</CardLabel>
        <ListField items={data.shortGoals || []} onChange={(v) => onChange({ ...data, shortGoals: v })} placeholder="A short-term goal" /></div>
      <div><CardLabel>Mid-Term Goals</CardLabel>
        <ListField items={data.midGoals || []} onChange={(v) => onChange({ ...data, midGoals: v })} placeholder="A mid-term goal" /></div>
      <div><CardLabel>Long-Term Goal</CardLabel>
        <Field value={data.longGoal} onChange={(v) => onChange({ ...data, longGoal: v })} placeholder="The one big thing" /></div>
      <div>
        <CardLabel>Renown</CardLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onChange({ ...data, renown: renown - 1 })}
            className="w-7 h-7 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display"
            title="Decrease renown"
          >
            −
          </button>
          <input
            type="number"
            value={renown}
            onChange={(e) => {
              const v = parseInt(e.target.value || '0', 10);
              onChange({ ...data, renown: isNaN(v) ? 0 : v });
            }}
            className="w-16 bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif text-center"
          />
          <button
            onClick={() => onChange({ ...data, renown: renown + 1 })}
            className="w-7 h-7 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display"
            title="Increase renown"
          >
            +
          </button>
          <span className="text-xs px-2 py-0.5 rounded-sm border border-wine/40 bg-wine/5 text-wine font-display uppercase tracking-wider">
            {rank}
          </span>
        </div>
      </div>
    </div>
  );
};

export const GoalCard = ({ data, onChange, onRemove }: any) => {
  const playMode = useContext(CampaignPlayModeContext);
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="Goal Statement" rows={2} />
        <div className="flex items-center gap-2 flex-shrink-0">
          {playMode !== 'solo' && (
            <button
              type="button"
              onClick={() => onChange({ ...data, isPublic: !data.isPublic })}
              aria-label={data.isPublic ? 'Hide from players' : 'Share with players'}
              aria-pressed={!!data.isPublic}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                data.isPublic
                  ? 'bg-moss border-moss text-parchment hover:bg-moss/90'
                  : 'border-ink-mute text-ink-mute hover:bg-parchment-deep hover:text-ink'
              }`}
              title={data.isPublic ? 'Shared with Players (Public)' : 'Hidden from Players (Private)'}
            >
              {data.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
              {data.isPublic ? 'Shared' : 'Private'}
            </button>
          )}
          <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[['short', 'Short-Term'], ['mid', 'Mid-Term'], ['long', 'Long-Term']].map(([t, label]) => (
          <button key={t} onClick={() => onChange({ ...data, timeframe: t })} className={`text-xs py-1 rounded border font-display uppercase tracking-wider ${data.timeframe === t ? 'bg-wine/10 border-wine text-wine' : 'border-rule text-ink-mute'}`}>{label}</button>
        ))}
      </div>
      <div><CardLabel>Rule 3 — Success State</CardLabel>
        <Field value={data.success} onChange={(v) => onChange({ ...data, success: v })} placeholder="What signals completion?" /></div>
      <div><CardLabel>Rule 4 — Failure Consequence</CardLabel>
        <Field value={data.failure} onChange={(v) => onChange({ ...data, failure: v })} placeholder="What changes if it fails?" /></div>
      <div><CardLabel>Linked Factions / Conflicts</CardLabel>
        <Field value={data.linked} onChange={(v) => onChange({ ...data, linked: v })} placeholder="..." /></div>
    </div>
  );
};

export const NPCFieldRow = ({
  label,
  value,
  onChange,
  placeholder,
  rows,
  tableId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  tableId?: string;
}) => (
  <div>
    <div className="flex items-center justify-between gap-2 mb-0.5">
      <CardLabel>{label}</CardLabel>
      {tableId && (
        <Inspire
          tableId={tableId}
          compact
          label=""
          onPick={(e) => {
            if (value && value.trim() && !confirm(`Replace current ${label.toLowerCase()}?`)) return;
            onChange(e);
          }}
        />
      )}
    </div>
    <Field value={value} onChange={onChange} placeholder={placeholder} rows={rows} />
  </div>
);

export const NPCCard = ({ data, onChange, onRemove, defaultDetailsOpen = false }: any) => {
  const playMode = useContext(CampaignPlayModeContext);
  const [showDetails, setShowDetails] = useState<boolean>(
    defaultDetailsOpen ||
    !!(data.appearance || data.abilities || data.talent || data.mannerism ||
       data.interactions || data.knowledge || data.ideal || data.bond || data.flaw)
  );
  const archetypeInspire = (tableId: string) => (e: string) => {
    if (data.archetype && data.archetype.trim() && !confirm('Replace current archetype?')) return;
    onChange({ ...data, archetype: e });
  };
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="NPC Name" />
        <div className="flex items-center gap-2 flex-shrink-0">
          {playMode !== 'solo' && (
            <label className="flex items-center gap-1 text-[10px] text-ink-soft uppercase font-display tracking-wider cursor-pointer select-none">
              <input type="checkbox" checked={!!data.isPublic} onChange={(e) => onChange({ ...data, isPublic: e.target.checked })} className="accent-wine" />
              Public
            </label>
          )}
          <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><CardLabel>Type</CardLabel>
          <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif">
            <option value="">— Choose —</option>
            <option>Ally</option><option>Villain</option><option>Patron</option><option>Rival</option><option>Neutral / Colour</option>
          </select></div>
        <div><CardLabel>Faction</CardLabel>
          <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="..." /></div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <CardLabel>Archetype</CardLabel>
          <div className="flex gap-1 flex-wrap">
            <Inspire tableId="villainArchetypes" compact label="Villain" onPick={archetypeInspire('villainArchetypes')} />
            <Inspire tableId="npcBackgroundConcepts" compact label="Background" onPick={archetypeInspire('npcBackgroundConcepts')} />
            <Inspire tableId="raceCharacterNotes" compact label="Species" onPick={archetypeInspire('raceCharacterNotes')} />
          </div>
        </div>
        <Field value={data.archetype} onChange={(v) => onChange({ ...data, archetype: v })} placeholder='e.g. "Han Solo"' />
      </div>
      <div><CardLabel>Active Goal</CardLabel>
        <Field value={data.goal} onChange={(v) => onChange({ ...data, goal: v })} placeholder="What are they pursuing?" rows={2} /></div>
      <div><CardLabel>Method of Pursuit</CardLabel>
        <Field value={data.method} onChange={(v) => onChange({ ...data, method: v })} placeholder="Violence? Charm?" /></div>
      <button
        onClick={() => setShowDetails(s => !s)}
        className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider"
      >
        {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>
      {showDetails && (
        <div className="space-y-2 pt-1 border-t border-rule">
          <NPCFieldRow label="Appearance" value={data.appearance || ''} onChange={(v) => onChange({ ...data, appearance: v })} placeholder="Distinctive physical detail or two" />
          <NPCFieldRow label="Abilities" value={data.abilities || ''} onChange={(v) => onChange({ ...data, abilities: v })} placeholder="High/low ability — strong, slow, perceptive..." />
          <NPCFieldRow label="Talent" value={data.talent || ''} onChange={(v) => onChange({ ...data, talent: v })} placeholder="Something they can do that's distinctive" tableId="npcTalents" />
          <NPCFieldRow label="Mannerism" value={data.mannerism || ''} onChange={(v) => onChange({ ...data, mannerism: v })} placeholder="Small habit that makes them memorable" tableId="npcMannerisms" />
          <NPCFieldRow label="Interactions" value={data.interactions || ''} onChange={(v) => onChange({ ...data, interactions: v })} placeholder="Default conversational stance — curious, suspicious..." tableId="npcInteractionTraits" />
          <NPCFieldRow label="Knowledge" value={data.knowledge || ''} onChange={(v) => onChange({ ...data, knowledge: v })} placeholder="Something useful they know" rows={2} />
          <NPCFieldRow label="Ideal" value={data.ideal || ''} onChange={(v) => onChange({ ...data, ideal: v })} placeholder="What drives them" tableId="npcIdeals" />
          <NPCFieldRow label="Bond" value={data.bond || ''} onChange={(v) => onChange({ ...data, bond: v })} placeholder="Who or what they're tied to" tableId="npcBonds" />
          <NPCFieldRow label="Flaw / Secret" value={data.flaw || ''} onChange={(v) => onChange({ ...data, flaw: v })} placeholder="Flaw or secret that could undermine them" tableId="npcFlawsSecrets" />
        </div>
      )}
    </div>
  );
};

export const LocationCard = ({ data, onChange, onRemove }: any) => {
  const playMode = useContext(CampaignPlayModeContext);
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Evocative Name" />
        <div className="flex items-center gap-2 flex-shrink-0">
          {playMode !== 'solo' && (
            <label className="flex items-center gap-1 text-[10px] text-ink-soft uppercase font-display tracking-wider cursor-pointer select-none">
              <input type="checkbox" checked={!!data.isPublic} onChange={(e) => onChange({ ...data, isPublic: e.target.checked })} className="accent-wine" />
              Public
            </label>
          )}
          <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div><CardLabel>Type</CardLabel>
        <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif">
          <option value="">— Choose —</option>
          <option>Player Base</option><option>Faction Stronghold</option><option>Wilderness Landmark</option>
          <option>Dungeon Room / Area</option><option>Settlement</option><option>Travel Waypoint</option><option>Other</option>
        </select></div>
      <div><CardLabel>3 Aspects</CardLabel>
        <div className="space-y-1">
          {[0, 1, 2].map(i => (
            <Field key={i} value={(data.aspects || [])[i] || ''} onChange={(v) => {
              const aspects = [...(data.aspects || ['', '', ''])]; aspects[i] = v; onChange({ ...data, aspects });
            }} placeholder={`Aspect ${i + 1}`} />
          ))}
        </div></div>
      <div><CardLabel>Factions Present</CardLabel>
        <Field value={data.factions} onChange={(v) => onChange({ ...data, factions: v })} placeholder="..." /></div>
    </div>
  );
};

type SessionLog = { id: string; title: string; date: string; body: string };

function makeLogId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// One-way migration: pcName/pcClass/pcBg/pcWant/pcFear/pcLove/pcFactions → characters[0].
// Legacy keys are dropped after migration; data is preserved inside the new character.
function migrateCharacters(data: Record<string, any>): Record<string, any> {
  if (Array.isArray(data.characters)) {
    return { ...data, characters: (data.characters as unknown[]).map(normalizeCharacter) };
  }
  const { pcName, pcClass, pcBg, pcWant, pcFear, pcLove, pcFactions, ...rest } = data;
  const hasLegacy =
    pcName || pcClass || pcBg || pcWant || pcFear || pcLove ||
    (Array.isArray(pcFactions) && pcFactions.length > 0);
  if (!hasLegacy) return { ...rest, characters: [] };

  const seed = emptyCharacter();
  const factionTies = Array.isArray(pcFactions)
    ? (pcFactions as unknown[]).filter((s) => typeof s === 'string' && s).join(', ')
    : '';
  const migrated: Character = {
    ...seed,
    name: pcName || '',
    classLevel: pcClass || '',
    backstory: pcBg || '',
    ideals: pcWant || '',
    flaws: pcFear || '',
    bonds: pcLove || '',
    notes: factionTies ? `Faction Ties: ${factionTies}` : '',
  };
  return { ...rest, characters: [migrated] };
}

function migrateSessionLogs(data: Record<string, any>): { initialState: Record<string, any>; initialOpenId: string | null } {
  const { logCurrent, ...rest } = data;

  if (Array.isArray(data.sessionLogs)) {
    const logs = data.sessionLogs as SessionLog[];
    if (logs.length === 0) return { initialState: rest, initialOpenId: null };
    const newest = [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    return { initialState: rest, initialOpenId: newest?.id ?? null };
  }

  const existing = typeof logCurrent === 'string' ? logCurrent.trim() : '';
  if (!existing) return { initialState: rest, initialOpenId: null };
  const id = makeLogId();
  const migrated: SessionLog = { id, title: 'Session 1', date: todayISO(), body: logCurrent };
  return { initialState: { ...rest, sessionLogs: [migrated] }, initialOpenId: id };
}

export const SessionLogCard = ({ data, open, onToggleOpen, onChange, onRemove }: {
  data: SessionLog;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (v: SessionLog) => void;
  onRemove: () => void;
}) => (
  <div className="rounded border border-rule bg-parchment shadow-card">
    <div className="flex items-center flex-wrap gap-1.5 p-2">
      <button onClick={onToggleOpen} className="text-brass-deep hover:text-crimson flex-shrink-0">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <textarea
        rows={1}
        value={data.title || ''}
        onChange={(e) => onChange({ ...data, title: e.target.value })}
        placeholder="Session title"
        className="flex-1 min-w-[8rem] bg-transparent font-display tracking-wide text-sm text-ink placeholder:text-ink-faint placeholder:italic placeholder:font-serif focus:outline-none border-b border-transparent focus:border-crimson pb-0.5 resize-none whitespace-pre-wrap break-words [field-sizing:content]"
      />
      <input
        type="date"
        value={data.date || ''}
        onChange={(e) => onChange({ ...data, date: e.target.value })}
        className="bg-parchment-soft border border-rule rounded px-1 py-0.5 text-[11px] sm:text-xs text-ink-soft font-serif focus:border-crimson focus:outline-none flex-shrink-0"
      />
      <button onClick={onRemove} className="text-ink-mute hover:text-crimson px-1 flex-shrink-0">
        <X size={14} />
      </button>
    </div>
    {open && (
      <div className="px-2.5 pb-2.5 pt-2 border-t border-rule">
        <textarea
          value={data.body || ''}
          onChange={(e) => onChange({ ...data, body: e.target.value })}
          placeholder="What happened. Open threads."
          rows={6}
          className="w-full bg-transparent border-b border-rule text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y px-1 py-1 text-sm"
        />
      </div>
    )}
  </div>
);

export const ClockCard = ({ data, onChange, onRemove }: any) => {
  const max = data.max || 6;
  const filled = data.filled || 0;
  const notes: string = data.notes || '';
  const [notesOpen, setNotesOpen] = useState(notes.trim().length > 0);
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="What is this faction trying to do?" />
        <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
      </div>
      <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="Faction" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={max} onChange={(e) => onChange({ ...data, max: Number(e.target.value) })} className="bg-parchment-soft border border-rule rounded px-2 py-1 text-xs text-ink font-serif flex-shrink-0">
          {[4, 6, 8, 12, 16].map(n => <option key={n} value={n}>{n} segments</option>)}
        </select>
        <div className="flex gap-0.5 flex-1 min-w-[8rem] border border-brass-deep rounded-sm p-0.5 bg-parchment-deep">
          {Array.from({ length: max }).map((_, i) => (
            <button key={i} onClick={() => onChange({ ...data, filled: i + 1 === filled ? i : i + 1 })} className={`flex-1 min-w-[14px] h-5 rounded-sm transition-colors ${i < filled ? 'bg-crimson' : 'bg-parchment hover:bg-parchment-deep'}`} />
          ))}
        </div>
        <span className="text-xs text-brass-deep font-display flex-shrink-0">{filled}/{max}</span>
      </div>
      <div className="pt-1 border-t border-rule/60">
        <button
          type="button"
          onClick={() => setNotesOpen(o => !o)}
          className="flex items-center gap-1 text-[10px] text-brass-deep hover:text-crimson font-display uppercase tracking-wider"
        >
          {notesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Notes{notes.trim() ? '' : ' (empty)'}
        </button>
        {notesOpen && (
          <textarea
            value={notes}
            onChange={(e) => onChange({ ...data, notes: e.target.value })}
            placeholder="Front notes — what this faction is doing, why it matters, what advances it"
            rows={3}
            className="mt-1.5 w-full bg-parchment-soft border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y [field-sizing:content]"
          />
        )}
      </div>
    </div>
  );
};

type EncounterMonster = { cr: string; count: number };
type EncounterCalcState = { pcLevel: number; monsters: EncounterMonster[]; gestalt?: boolean };

type DowntimeEntry = {
  id: string;
  type: string;
  fields: Record<string, string>;
  createdAt: string;
  archived?: boolean;
};

export const DOWNTIME_TYPES: Array<{
  id: string;
  label: string;
  fields: Array<{ key: string; label: string; placeholder: string; rows?: number }>;
  reference?: string;
}> = [
  {
    id: 'stronghold',
    label: 'Building a Stronghold',
    fields: [
      { key: 'propertyType', label: 'Property Type', placeholder: 'Tower, keep, manor...' },
      { key: 'location', label: 'Location', placeholder: 'Where is it being built?' },
      { key: 'dailyCost', label: 'Daily Cost (gp)', placeholder: 'e.g. 125' },
      { key: 'daysRemaining', label: 'Days Remaining', placeholder: 'e.g. 60' },
    ],
    reference:
      'Abbey/Temple/Keep ~50,000gp over ~400 days · Tower/Outpost ~15,000gp over ~100 days · ' +
      'Trading post/Guildhall ~5,000gp over ~60 days · Palace ~500,000gp over ~1,200 days · ' +
      'Noble manor ~25,000gp over ~150 days.',
  },
  {
    id: 'carousing',
    label: 'Carousing',
    fields: [
      { key: 'lifestyle', label: 'Lifestyle', placeholder: 'Modest / Comfortable / Wealthy / Aristocratic' },
      { key: 'daysSpent', label: 'Days Spent', placeholder: 'e.g. 5' },
      { key: 'outcome', label: 'Outcome Notes', placeholder: 'What happened — contacts, complications, rumors', rows: 3 },
    ],
  },
  {
    id: 'crafting',
    label: 'Crafting a Magic Item',
    fields: [
      { key: 'itemName', label: 'Item Name', placeholder: 'What is being crafted' },
      { key: 'rarity', label: 'Rarity', placeholder: 'Common / Uncommon / Rare / Very Rare / Legendary' },
      { key: 'daysRemaining', label: 'Days Remaining', placeholder: 'Working days left' },
      { key: 'gpCommitted', label: 'GP Committed', placeholder: 'Total invested so far' },
    ],
    reference:
      'Common 100gp / min lvl 3 · Uncommon 500gp / min lvl 3 · Rare 5,000gp / min lvl 6 · ' +
      'Very Rare 50,000gp / min lvl 11 · Legendary 500,000gp / min lvl 17.',
  },
  {
    id: 'renown',
    label: 'Gaining Renown',
    fields: [
      { key: 'factionName', label: 'Faction', placeholder: 'Which faction' },
      { key: 'currentRenown', label: 'Current Renown', placeholder: 'e.g. 3' },
      { key: 'targetRenown', label: 'Target Renown', placeholder: 'e.g. 10' },
      { key: 'narrative', label: 'Narrative', placeholder: 'What is the character doing to earn it?', rows: 3 },
    ],
  },
  {
    id: 'sacredRites',
    label: 'Performing Sacred Rites',
    fields: [
      { key: 'faith', label: 'Faith / Temple', placeholder: 'Which faith or temple' },
      { key: 'daysSpent', label: 'Days Spent', placeholder: 'e.g. 10' },
      { key: 'intent', label: 'Intent', placeholder: 'What the rite is for', rows: 3 },
    ],
  },
  {
    id: 'business',
    label: 'Running a Business',
    fields: [
      { key: 'businessType', label: 'Business Type', placeholder: 'Tavern, smithy, ship...' },
      { key: 'daysManaged', label: 'Days Managed', placeholder: 'e.g. 30' },
      { key: 'profitLoss', label: 'Profit / Loss (gp)', placeholder: 'Positive or negative' },
      { key: 'narrative', label: 'Narrative', placeholder: 'How is it going?', rows: 3 },
    ],
  },
  {
    id: 'sellingMagic',
    label: 'Selling Magic Items',
    fields: [
      { key: 'item', label: 'Item', placeholder: 'What is being sold' },
      { key: 'askingPrice', label: 'Asking Price', placeholder: 'In gp' },
      { key: 'buyer', label: 'Buyer', placeholder: 'Named buyer or "looking for buyer"' },
    ],
  },
  {
    id: 'training',
    label: 'Training',
    fields: [
      { key: 'skillOrFeat', label: 'Skill or Feat', placeholder: 'What is being learned' },
      { key: 'totalDays', label: 'Total Days Needed', placeholder: 'e.g. 250' },
      { key: 'daysCompleted', label: 'Days Completed', placeholder: 'e.g. 47' },
    ],
  },
];

function makeDowntimeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DowntimeCard = ({
  entry,
  onChange,
  onArchive,
  onUnarchive,
  onRemove,
}: {
  entry: DowntimeEntry;
  onChange: (e: DowntimeEntry) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onRemove: () => void;
}) => {
  const type = DOWNTIME_TYPES.find(t => t.id === entry.type);
  if (!type) return null;
  return (
    <div className={`rounded border p-3 space-y-2 shadow-card ${entry.archived ? 'border-rule/60 bg-parchment-deep/40 opacity-80' : 'border-rule bg-parchment'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm tracking-wide text-ink">{type.label}</span>
        <div className="flex gap-1.5">
          {entry.archived ? (
            <button onClick={onUnarchive} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">Unarchive</button>
          ) : (
            <button onClick={onArchive} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">Archive</button>
          )}
          <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="space-y-2">
        {type.fields.map(f => (
          <div key={f.key}>
            <CardLabel>{f.label}</CardLabel>
            <Field
              value={entry.fields[f.key] || ''}
              onChange={(v) => onChange({ ...entry, fields: { ...entry.fields, [f.key]: v } })}
              placeholder={f.placeholder}
              rows={f.rows}
            />
          </div>
        ))}
      </div>
      {type.reference && (
        <div className="text-[10px] text-ink-mute italic font-serif border-t border-rule pt-1.5">
          {type.reference}
        </div>
      )}
    </div>
  );
};

