'use client';

// Read-only, real-time player view. Driven entirely by the redacted
// SlotProjection published by the GM (playerShares/{token}/slots/{slotId}).
// No edit affordances; mobile-first.

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText, Users, Map, Flag, Clock, BookOpen, UserCircle, Gift, Compass, Target, Heart, Plus, X, Music, ChevronDown, ChevronRight } from 'lucide-react';
import { subscribeSlotProjection } from '@/lib/playerMode/playerClient';
import type { SlotProjection } from '@/lib/playerMode/types';
import PlayerMapView from '@/components/maps/PlayerMapView';
import CharacterCard from './CharacterCard';
import { MusicPlayer } from './RunSessionView';

type AnyRec = Record<string, unknown>;

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  characters: { label: 'Party', icon: <UserCircle size={15} /> },
  pcs: { label: 'Party Sheets', icon: <UserCircle size={15} /> },
  npcs: { label: 'NPCs', icon: <Users size={15} /> },
  locations: { label: 'Places', icon: <Map size={15} /> },
  factions: { label: 'Factions', icon: <Flag size={15} /> },
  clocks: { label: 'Clocks', icon: <Clock size={15} /> },
};

function prettify(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (typeof value[0] === 'object') {
      return (
        <ul className="list-disc space-y-0.5 pl-4">
          {value.map((v, i) => <li key={i}>{Object.values(v as AnyRec).filter(Boolean).join(' · ')}</li>)}
        </ul>
      );
    }
    return <>{(value as unknown[]).filter(Boolean).join(', ')}</>;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as AnyRec).filter(([, v]) => v !== '' && v != null);
    if (entries.length === 0) return null;
    return <>{entries.map(([k, v]) => `${prettify(k)}: ${v}`).join(' · ')}</>;
  }
  return <>{String(value)}</>;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as AnyRec).every((x) => x === '' || x == null);
  return false;
}

function EntityCard({ entity }: { entity: AnyRec }) {
  const name = (entity.name as string) || (entity.text as string) || 'Unnamed';
  const fields = Object.entries(entity).filter(([k, v]) => k !== 'id' && k !== 'name' && k !== 'text' && !isEmptyValue(v));
  return (
    <div className="space-y-1.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="font-display text-lg tracking-wide text-ink">{name}</div>
      {fields.map(([k, v]) => (
        <div key={k} className="font-serif text-sm text-ink-soft">
          <span className="font-semibold text-ink">{prettify(k)}:</span> <FieldValue value={v} />
        </div>
      ))}
    </div>
  );
}

function PlayerPcSheetCard({ pc, token, slotId }: { pc: any; token: string; slotId: string }) {
  const [localHp, setLocalHp] = useState<number>(pc.hp?.current ?? 0);
  const [localTempHp, setLocalTempHp] = useState<number>(pc.hp?.temp ?? 0);
  const [localNotes, setLocalNotes] = useState<string>(pc.notes ?? '');

  useEffect(() => {
    setLocalHp(pc.hp?.current ?? 0);
  }, [pc.hp]);

  useEffect(() => {
    setLocalTempHp(pc.hp?.temp ?? 0);
  }, [pc.hp?.temp]);

  useEffect(() => {
    setLocalNotes(pc.notes ?? '');
  }, [pc.notes]);

  const sendUpdate = async (field: string, value: any) => {
    try {
      const res = await fetch('/api/player/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareToken: token,
          slotId,
          pcId: pc.id,
          field,
          value,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('Update rejected:', err.error);
      }
    } catch (e) {
      console.error('Failed to send player update:', e);
    }
  };

  const adjustHp = (amount: number) => {
    const next = Math.max(0, Math.min(pc.hp?.max ?? 999, localHp + amount));
    setLocalHp(next);
    sendUpdate('hp.current', next);
  };

  const handleHpChange = (v: number) => {
    const next = Math.max(0, Math.min(pc.hp?.max ?? 999, v));
    setLocalHp(next);
    sendUpdate('hp.current', next);
  };

  const handleTempHpChange = (v: number) => {
    const next = Math.max(0, v);
    setLocalTempHp(next);
    sendUpdate('hp.temp', next);
  };

  const handleNotesBlur = () => {
    if (localNotes !== pc.notes) {
      sendUpdate('notes', localNotes);
    }
  };

  const toggleCondition = (cond: string) => {
    const current = pc.conditions || [];
    const next = current.includes(cond)
      ? current.filter((c: string) => c !== cond)
      : [...current, cond];
    sendUpdate('conditions', next);
  };

  const handleExhaustionChange = (n: number) => {
    sendUpdate('exhaustion', n);
  };

  const handleDeathSave = (type: 'successes' | 'failures', count: number) => {
    const current = pc.deathSaves?.[type] ?? 0;
    const next = current === count ? count - 1 : count;
    sendUpdate(`deathSaves.${type}`, Math.max(0, Math.min(3, next)));
  };

  const handleAddListItem = (field: 'goals' | 'bonds' | 'ideals' | 'flaws', text: string) => {
    const current = pc[field] || [];
    sendUpdate(field, [...current, text]);
  };

  const handleRemoveListItem = (field: 'goals' | 'bonds' | 'ideals' | 'flaws', index: number) => {
    const current = pc[field] || [];
    sendUpdate(field, current.filter((_: any, i: number) => i !== index));
  };

  const handleEditListItem = (field: 'goals' | 'bonds' | 'ideals' | 'flaws', index: number, text: string) => {
    const current = [...(pc[field] || [])];
    current[index] = text;
    sendUpdate(field, current);
  };

  const classesLabel = pc.classes?.length
    ? pc.classes.map((c: any) => `${c.name} ${c.level}`).join(' / ')
    : `Level ${pc.level ?? 1}`;

  return (
    <div className="rounded-lg border border-rule bg-parchment shadow-md space-y-4 p-4 sm:p-5">
      {/* Identity Summary */}
      <div className="border-b border-rule pb-3 flex flex-wrap justify-between items-start gap-2">
        <div>
          <h3 className="font-display text-xl tracking-wide text-ink font-semibold">{pc.name || 'Unnamed Character'}</h3>
          <p className="font-serif text-xs italic text-ink-mute">
            {[pc.race, classesLabel].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3 font-serif text-xs">
          <div className="flex items-center gap-1 rounded bg-parchment-deep px-2.5 py-1 border border-rule">
            <span className="font-semibold text-ink">AC:</span>
            <span className="text-crimson font-display font-medium">{pc.ac ?? 10}</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-parchment-deep px-2.5 py-1 border border-rule">
            <span className="font-semibold text-ink">Speed:</span>
            <span className="text-ink-soft">{pc.speed ?? 30} ft.</span>
          </div>
        </div>
      </div>

      {/* HP and Vitality Dashboard */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* HP Panel */}
        <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2">
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep flex items-center gap-1 font-semibold">
            <Heart size={12} className="text-crimson" /> Hit Points
          </div>
          <div className="flex items-center justify-between gap-1.5">
            <button
              onClick={() => adjustHp(-1)}
              className="h-7 w-7 rounded border border-rule bg-parchment flex items-center justify-center font-bold text-ink hover:bg-parchment-deep"
            >
              -
            </button>
            <div className="flex items-center gap-1 font-serif">
              <input
                type="number"
                value={localHp}
                onChange={(e) => setLocalHp(parseInt(e.target.value, 10) || 0)}
                onBlur={() => handleHpChange(localHp)}
                className="w-12 border-b border-rule bg-transparent text-center font-display text-lg text-ink focus:border-crimson focus:outline-none"
              />
              <span className="text-ink-mute">/</span>
              <span className="text-ink-soft font-display">{pc.hp?.max ?? 0}</span>
            </div>
            <button
              onClick={() => adjustHp(1)}
              className="h-7 w-7 rounded border border-rule bg-parchment flex items-center justify-center font-bold text-ink hover:bg-parchment-deep"
            >
              +
            </button>
          </div>
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="font-serif text-ink-mute">Temp HP:</span>
            <input
              type="number"
              value={localTempHp}
              onChange={(e) => setLocalTempHp(parseInt(e.target.value, 10) || 0)}
              onBlur={() => handleTempHpChange(localTempHp)}
              className="w-12 border-b border-rule bg-transparent text-center font-display text-sm text-ink focus:border-crimson focus:outline-none"
            />
          </div>
        </div>

        {/* Exhaustion Panel */}
        <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2">
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep font-semibold">
            Exhaustion
          </div>
          <div className="flex justify-between gap-1 pt-1">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => handleExhaustionChange(n)}
                className={`h-6 flex-1 rounded border font-display text-[10px] transition-colors ${
                  (pc.exhaustion ?? 0) === n
                    ? 'border-crimson bg-crimson text-white font-semibold'
                    : 'border-rule text-ink-soft hover:bg-parchment'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="font-serif text-[10px] text-ink-faint leading-normal text-center italic pt-0.5">
            {(pc.exhaustion ?? 0) >= 6 ? '☠ Dead at level 6' : `Level ${pc.exhaustion ?? 0} effects active`}
          </p>
        </div>

        {/* Death Saves Panel */}
        <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2">
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep font-semibold">
            Death Saves
          </div>
          <div className="space-y-1.5 pt-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-serif text-ink-soft">Successes</span>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleDeathSave('successes', n)}
                    className={`h-4.5 w-4.5 rounded-full border transition-all ${
                      (pc.deathSaves?.successes ?? 0) >= n
                        ? 'border-emerald-600 bg-emerald-500 shadow-sm'
                        : 'border-rule hover:bg-parchment'
                    }`}
                    aria-label={`Death Save Success ${n}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-serif text-ink-soft">Failures</span>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleDeathSave('failures', n)}
                    className={`h-4.5 w-4.5 rounded-full border transition-all ${
                      (pc.deathSaves?.failures ?? 0) >= n
                        ? 'border-crimson bg-crimson shadow-sm'
                        : 'border-rule hover:bg-parchment'
                    }`}
                    aria-label={`Death Save Failure ${n}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conditions Editor */}
      <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2">
        <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep font-semibold">
          Active Conditions
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'].map((cond) => {
            const isActive = (pc.conditions || []).includes(cond);
            return (
              <button
                key={cond}
                onClick={() => toggleCondition(cond)}
                className={`text-[9px] px-2 py-0.5 rounded border font-display uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'border-wine/50 bg-wine/15 text-wine font-semibold'
                    : 'border-rule text-ink-soft bg-parchment hover:bg-parchment-deep'
                }`}
              >
                {cond}
              </button>
            );
          })}
        </div>
      </div>

      {/* Roleplay Fields (Editable Roster Lists) */}
      <div className="grid gap-3 sm:grid-cols-2 border-t border-rule pt-3">
        {['goals', 'bonds', 'ideals', 'flaws'].map((field) => (
          <div key={field} className="space-y-1.5">
            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep font-semibold">
              {field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()}
            </div>
            <div className="space-y-1 bg-parchment-soft/50 p-2 rounded border border-rule/50">
              {(pc[field] || []).map((val: string, idx: number) => (
                <div key={idx} className="flex items-center gap-1.5 group">
                  <input
                    value={val}
                    onChange={(e) => handleEditListItem(field as any, idx, e.target.value)}
                    className="w-full border-b border-transparent hover:border-rule bg-transparent px-1 py-0.5 font-serif text-xs text-ink-soft focus:border-crimson focus:outline-none"
                  />
                  <button
                    onClick={() => handleRemoveListItem(field as any, idx)}
                    className="text-ink-mute hover:text-crimson opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${field} item`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => handleAddListItem(field as any, '')}
                className="flex items-center gap-1 font-display text-[9px] uppercase tracking-wider text-brass-deep hover:text-crimson pt-1"
              >
                <Plus size={10} /> Add {field.replace(/s$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Personal Notes (Editable Textarea) */}
      <div className="border-t border-rule pt-3 space-y-1.5">
        <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep font-semibold">
          Personal Notes
        </div>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Freeform character notes (session logs, inventory lists, sidekick stats...)"
          rows={3}
          className="w-full border border-rule rounded bg-parchment-soft p-2.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none resize-none leading-relaxed"
        />
      </div>

      {/* Read-only PC Properties */}
      <details className="border-t border-rule pt-2 group">
        <summary className="font-display text-[10px] uppercase tracking-wider text-ink-mute cursor-pointer select-none hover:text-ink flex items-center justify-between">
          <span>View Ability Scores & Skills</span>
          <span className="font-serif text-[9px] text-ink-faint">(Click to Expand)</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 animate-fade-in">
          <div className="space-y-1.5">
            <div className="font-display text-[9px] uppercase tracking-wider text-brass-deep font-semibold">Ability Scores</div>
            <div className="grid grid-cols-3 gap-1 bg-parchment-soft p-2 rounded border border-rule">
              {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((a) => (
                <div key={a} className="text-center py-1">
                  <div className="font-display text-[9px] uppercase text-brass-deep">{a}</div>
                  <div className="font-serif text-sm font-semibold text-ink">{pc.abilities?.[a] ?? 10}</div>
                  <div className="font-display text-[10px] text-crimson">
                    {Math.floor(((pc.abilities?.[a] ?? 10) - 10) / 2) >= 0 ? '+' : ''}
                    {Math.floor(((pc.abilities?.[a] ?? 10) - 10) / 2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="font-display text-[9px] uppercase tracking-wider text-brass-deep font-semibold">Details</div>
            <div className="bg-parchment-soft p-2.5 rounded border border-rule font-serif text-xs text-ink-soft space-y-1">
              <div><span className="font-semibold text-ink">Proficiency Bonus:</span> {pc.proficiencyBonus ? `+${pc.proficiencyBonus}` : '+2'}</div>
              <div><span className="font-semibold text-ink">Saving Throws:</span> {pc.proficiencies?.savingThrows?.join(', ') || 'None'}</div>
              <div><span className="font-semibold text-ink">Skills:</span> {pc.proficiencies?.skills?.join(', ') || 'None'}</div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export default function PlayerCampaignView({
  token, slotId, displayName, campaignName, onSwitch,
  playlistUrl, sessionRecaps, unredactedCharacters,
}: {
  token: string;
  slotId: string;
  displayName: string;
  campaignName: string;
  onSwitch: () => void;
  playlistUrl?: string;
  sessionRecaps?: Array<{ id: string; title: string; date: string; body: string }>;
  unredactedCharacters?: any[];
}) {
  const [projection, setProjection] = useState<SlotProjection | null | undefined>(undefined);
  const [active, setActive] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [musicOpen, setMusicOpen] = useState(true);
  const [openCharIds, setOpenCharIds] = useState<Record<string, boolean>>({});
  const toggleChar = (id: string) => setOpenCharIds((s) => ({ ...s, [id]: !s[id] }));
  const activePlaylistUrl = playlistUrl || projection?.playlistUrl;
  const activePlaylistPlaying = projection?.playlistPlaying ?? false;

  useEffect(() => {
    const unsub = subscribeSlotProjection(token, slotId, setProjection, () => setProjection(null));
    return unsub;
  }, [token, slotId]);

  const tabs = useMemo(() => {
    if (!projection) return [];
    const out: { id: string; label: string; icon: React.ReactNode }[] = [];
    for (const [type, meta] of Object.entries(TYPE_META)) {
      const items = projection.entities[type as keyof SlotProjection['entities']];
      if ((items && items.length > 0) || (type === 'characters' && unredactedCharacters && unredactedCharacters.length > 0)) {
        out.push({ id: type, label: meta.label, icon: meta.icon });
      }
    }
    if (projection.maps && projection.maps.length > 0) out.push({ id: 'maps', label: 'Maps', icon: <Map size={15} /> });
    if (projection.sessionLog.length > 0) out.push({ id: 'log', label: 'Log', icon: <ScrollText size={15} /> });
    if (sessionRecaps && sessionRecaps.length > 0) {
      out.push({ id: 'recaps', label: 'Recaps', icon: <ScrollText size={15} /> });
    }
    if (projection.handouts) out.push({ id: 'handouts', label: 'Handouts', icon: <BookOpen size={15} /> });
    if (projection.items && projection.items.length > 0) {
      out.push({ id: 'items', label: 'My Items', icon: <Gift size={15} /> });
    }
    if (projection.pcGoals && projection.pcGoals.length > 0) {
      out.push({ id: 'goals', label: 'Goals', icon: <Target size={15} /> });
    }
    if (projection.planning && (
      projection.planning.pitch ||
      projection.planning.genre ||
      (projection.planning.gWorld && projection.planning.gWorld.length > 0) ||
      (projection.planning.gFNL && projection.planning.gFNL.length > 0) ||
      (projection.planning.tone && projection.planning.tone.length > 0) ||
      (projection.planning.lines && projection.planning.lines.length > 0) ||
      (projection.planning.facts && projection.planning.facts.length > 0) ||
      (projection.planning.secrets && projection.planning.secrets.length > 0) ||
      (projection.planning.conflicts && projection.planning.conflicts.length > 0)
    )) {
      out.push({ id: 'planning', label: 'Premise', icon: <Compass size={15} /> });
    }
    return out;
  }, [projection]);

  useEffect(() => {
    if (!projection || tabs.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    let targetType: string | null = null;
    let targetId: string | null = null;

    if (params.has('npc')) {
      targetType = 'npcs';
      targetId = params.get('npc');
    } else if (params.has('location')) {
      targetType = 'locations';
      targetId = params.get('location');
    } else if (params.has('faction')) {
      targetType = 'factions';
      targetId = params.get('faction');
    } else if (hash) {
      const match = hash.match(/^#(npc|location|faction)-(.*)$/);
      if (match) {
        targetType = match[1] === 'npc' ? 'npcs' : match[1] === 'location' ? 'locations' : 'factions';
        targetId = match[2];
      }
    }

    if (targetType && targetId) {
      const list = projection.entities[targetType as keyof SlotProjection['entities']];
      const exists = Array.isArray(list) && list.some((e: any) => e.id === targetId);

      if (!exists) {
        // Intercept and immediately redirect (clean URL, show alert)
        const newUrl = window.location.pathname;
        window.history.replaceState(null, '', newUrl);
        setAlertMessage(`Access Denied: The requested ${targetType.replace(/s$/, '').toUpperCase()} is hidden or private.`);
        setActive(tabs[0]?.id || '');
      } else {
        // Safe access: navigate to the tab and scroll to the entity card
        setActive(targetType);
        const elementId = `entity-${targetId}`;
        setTimeout(() => {
          document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    }
  }, [projection, tabs]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === active)) setActive(tabs[0].id);
  }, [tabs, active]);

  const isEmpty = projection && tabs.length === 0;

  return (
    <main className="min-h-screen bg-parchment p-3 sm:p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-parchment-soft p-4 shadow-page">
          <div className="min-w-0">
            <div className="font-display text-[10px] uppercase tracking-[0.3em] text-brass-deep">Player View</div>
            <h1 className="truncate font-display text-xl tracking-wide text-ink sm:text-2xl">{campaignName}</h1>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end">
            <span className="font-serif text-sm text-ink-soft">{displayName}</span>
            <button onClick={onSwitch} className="font-display text-[10px] uppercase tracking-wider text-crimson hover:text-wine">Switch player</button>
          </div>
        </header>

        {/* Live Session Music (Pulsing Widget) */}
        {activePlaylistUrl && (
          <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-4 space-y-3">
            <button
              onClick={() => setMusicOpen(!musicOpen)}
              className="flex w-full items-center justify-between text-left focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center">
                  <Music className="text-crimson" size={18} />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson"></span>
                  </span>
                </div>
                <div>
                  <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Session Ambiance
                  </div>
                  <h2 className="font-display text-sm tracking-wide text-ink">Live Music from GM</h2>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-serif text-ink-mute italic">
                  {musicOpen ? 'Hide player' : 'Show player'}
                </span>
                {musicOpen ? <ChevronDown size={16} className="text-ink-mute" /> : <ChevronRight size={16} className="text-ink-mute" />}
              </div>
            </button>
            {musicOpen && (
              <div className="border-t border-rule/60 pt-3">
                <MusicPlayer
                  playlistUrl={activePlaylistUrl}
                  readOnly={true}
                  isPlayingProp={activePlaylistPlaying}
                />
              </div>
            )}
          </div>
        )}

        {alertMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded relative font-serif text-sm flex items-center justify-between shadow-card" role="alert">
            <span>{alertMessage}</span>
            <button onClick={() => setAlertMessage(null)} className="text-red-500 hover:text-red-700 font-bold px-2 py-1 text-base">&times;</button>
          </div>
        )}

        {projection === undefined && (
          <p className="py-10 text-center font-serif text-sm italic text-ink-mute">Loading…</p>
        )}

        {isEmpty && (
          <div className="rounded-lg border border-rule bg-parchment-soft p-8 text-center shadow-card">
            <p className="font-serif italic text-ink-soft">Your GM hasn’t shared anything yet — check back during the session.</p>
          </div>
        )}

        {projection && tabs.length > 0 && (
          <>
            <nav className="flex flex-wrap gap-2 border-b border-rule pb-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 font-display text-sm tracking-wide ${active === t.id ? 'border-b-2 border-crimson bg-parchment-deep text-crimson' : 'text-ink-soft hover:text-ink'}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>

            <div className="space-y-3">
              {active === 'maps' ? (
                <PlayerMapView maps={projection.maps ?? []} />
              ) : active === 'pcs' ? (
                <div className="space-y-4">
                  {(projection.entities.pcs ?? []).map((pc: any) => (
                    <PlayerPcSheetCard
                      key={pc.id}
                      pc={pc}
                      token={token}
                      slotId={slotId}
                    />
                  ))}
                </div>
              ) : active === 'log' ? (
                [...projection.sessionLog]
                  .sort((a, b) => ((b.postedAtMs as number) ?? 0) - ((a.postedAtMs as number) ?? 0))
                  .map((e) => (
                    <div key={e.id as string} className="rounded border border-rule bg-parchment p-3 shadow-card">
                      <div className="mb-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                        {e.postedAtMs ? new Date(e.postedAtMs as number).toLocaleString() : ''}
                      </div>
                      <p className="whitespace-pre-wrap font-serif text-sm text-ink-soft">{e.text as string}</p>
                      {Array.isArray(e.mentions) && (e.mentions as AnyRec[]).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(e.mentions as AnyRec[]).map((m, i) => (
                            <span key={i} className="rounded-full bg-brass/15 px-2 py-0.5 text-[11px] text-brass-deep">{m.label as string}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
              ) : active === 'handouts' ? (
                <div className="whitespace-pre-wrap rounded border border-rule bg-parchment p-4 font-serif text-sm leading-relaxed text-ink-soft shadow-card">
                  {projection.handouts}
                </div>
              ) : active === 'planning' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {projection.planning?.pitch && (
                    <div className="col-span-full rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Quick Pitch</div>
                      <p className="text-ink-soft whitespace-pre-wrap leading-relaxed">{projection.planning.pitch}</p>
                    </div>
                  )}
                  {projection.planning?.genre && (
                    <div className="col-span-full rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Genre Statement</div>
                      <p className="text-ink-soft whitespace-pre-wrap leading-relaxed">{projection.planning.genre}</p>
                    </div>
                  )}
                  {projection.planning?.gWorld && projection.planning.gWorld.length > 0 && (
                    <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">World Facts</div>
                      <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                        {projection.planning.gWorld.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {projection.planning?.gFNL && projection.planning.gFNL.length > 0 && (
                    <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Required Entities</div>
                      <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                        {projection.planning.gFNL.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {projection.planning?.tone && projection.planning.tone.length > 0 && (
                    <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Tone Keywords</div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {projection.planning.tone.map((w, idx) => (
                          <span key={idx} className="rounded bg-brass/10 px-2 py-0.5 text-xs text-brass-deep font-display uppercase tracking-wider">{w}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {projection.planning?.lines && projection.planning.lines.length > 0 && (
                    <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Content Lines (Hard Nos)</div>
                      <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                        {projection.planning.lines.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {projection.planning?.facts && projection.planning.facts.length > 0 && (
                    <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Setting Facts</div>
                      <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                        {projection.planning.facts.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {projection.planning?.secrets && projection.planning.secrets.length > 0 && (
                    <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Secrets & Clues</div>
                      <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                        {projection.planning.secrets.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {projection.planning?.conflicts && projection.planning.conflicts.length > 0 && (
                    <div className="col-span-full rounded border border-rule bg-parchment p-4 shadow-card space-y-2 font-serif text-sm">
                      <div className="font-display text-xs uppercase tracking-wider text-brass-deep border-b border-rule pb-1">Active Conflicts</div>
                      <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                        {projection.planning.conflicts.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : active === 'items' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {projection.items?.map((it) => (
                    <div key={it.id} className="rounded border border-rule bg-parchment p-3 shadow-card space-y-1.5 font-serif text-sm">
                      <div className="font-semibold text-ink text-base">{it.name}</div>
                      {it.description && (
                        <p className="text-ink-soft whitespace-pre-wrap leading-relaxed">
                          {it.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : active === 'goals' ? (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {projection.pcGoals?.map((g, idx) => {
                    const timeframeLabels: Record<string, string> = {
                      short: 'Short-Term',
                      mid: 'Mid-Term',
                      long: 'Long-Term',
                    };
                    const timeframeBadgeStyles: Record<string, string> = {
                      short: 'bg-brass/10 border-brass/35 text-brass-deep',
                      mid: 'bg-wine/10 border-wine/35 text-wine',
                      long: 'bg-parchment-deep border-rule text-ink-soft',
                    };
                    const statusBadgeStyles: Record<string, string> = {
                      Active: 'bg-brass/10 border-brass/35 text-brass-deep',
                      Progressed: 'bg-wine/15 border-wine/40 text-wine font-semibold',
                      Completed: 'bg-moss/10 border-moss/30 text-moss font-semibold',
                      Failed: 'bg-crimson/10 border-crimson/30 text-crimson font-semibold',
                    };

                    const timeframe = g.timeframe || 'short';
                    const timeframeLabel = timeframeLabels[timeframe] || 'Short-Term';
                    const timeframeStyle = timeframeBadgeStyles[timeframe] || timeframeBadgeStyles.short;
                    
                    const status = g.status || 'Active';
                    const statusStyle = statusBadgeStyles[status] || statusBadgeStyles.Active;

                    return (
                      <div key={idx} className="rounded border border-rule bg-parchment p-4 shadow-card space-y-3 font-serif text-sm flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-display uppercase tracking-wider ${timeframeStyle}`}>
                              {timeframeLabel}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-display uppercase tracking-wider ${statusStyle}`}>
                              {status}
                            </span>
                          </div>
                          <p className="text-ink font-serif text-base leading-snug font-medium tracking-wide">
                            {g.text}
                          </p>
                        </div>
                        <div className="space-y-2 pt-1">
                          {g.success && (
                            <div className="space-y-0.5 pt-1.5 border-t border-rule/50">
                              <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep">Success State</div>
                              <p className="text-ink-soft font-serif text-xs leading-relaxed italic">{g.success}</p>
                            </div>
                          )}
                          {g.failure && (
                            <div className="space-y-0.5 pt-1.5 border-t border-rule/50">
                              <div className="text-[10px] font-display uppercase tracking-wider text-crimson">Failure Consequence</div>
                              <p className="text-ink-soft font-serif text-xs leading-relaxed italic">{g.failure}</p>
                            </div>
                          )}
                          {g.linked && (
                            <div className="space-y-0.5 pt-1.5 border-t border-rule/50">
                              <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute">Linked Elements</div>
                              <p className="text-ink-soft font-serif text-xs leading-relaxed">{g.linked}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : active === 'characters' ? (
                <div className="space-y-4">
                  {unredactedCharacters && unredactedCharacters.length > 0 ? (
                    unredactedCharacters.map((c: any, i: number) => (
                      <CharacterCard
                        key={c.id || i}
                        data={c}
                        open={!!openCharIds[c.id || i]}
                        soloMode={false}
                        onToggleOpen={() => toggleChar(c.id || i)}
                        onChange={() => {}} // Read-only
                        onRemove={() => {}}
                      />
                    ))
                  ) : (
                    (projection.entities.characters ?? []).map((e) => (
                      <EntityCard key={e.id as string} entity={e} />
                    ))
                  )}
                </div>
              ) : active === 'recaps' ? (
                <div className="space-y-6">
                  {sessionRecaps?.map((log: any, i: number) => (
                    <div key={log.id || i} className="bg-parchment-soft border border-rule rounded p-4 shadow-card">
                      <div className="flex justify-between items-baseline mb-3 border-b border-rule pb-2">
                        <h3 className="font-display text-lg tracking-wide text-ink">{log.title || 'Untitled Session'}</h3>
                        <span className="font-serif text-sm text-ink-mute italic">{log.date}</span>
                      </div>
                      <div className="font-serif text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                        {log.body || 'No notes.'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(projection.entities[active as keyof SlotProjection['entities']] ?? []).map((e) => (
                    <EntityCard key={e.id as string} entity={e} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
