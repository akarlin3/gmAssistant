// Read-only campaign reference lookup, extracted verbatim from
// CampaignEditor.tsx. Self-contained: receives all data via props and owns only
// its own search/filter UI state.
'use client';

import React, { useState } from 'react';
import {
  ChevronDown, ChevronRight, Search, User, Users, Map, ScrollText, Gift, Globe, Eye, EyeOff,
} from 'lucide-react';
import { normalizeItem } from '@/lib/playerMode/types';
import { Detail } from './prepShared';
import type { LookupKind, KnowledgeFilter } from './prepTypes';

export function LookupView({
  npcs, locations, secrets, factions, magicItems, revealedSecrets, roster, playerConfig
}: {
  npcs: any[];
  locations: any[];
  secrets: string[];
  factions: any[];
  magicItems: any[];
  revealedSecrets: Record<number, boolean>;
  roster?: any[];
  playerConfig?: any;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LookupKind>('all');
  const [knowledge, setKnowledge] = useState<KnowledgeFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);

  const showNpcs = kind === 'all' || kind === 'npcs';
  const showLocs = kind === 'all' || kind === 'locations';
  const showSecrets = kind === 'all' || kind === 'secrets';
  const showFactions = kind === 'all' || kind === 'factions';
  const showItems = kind === 'all' || kind === 'items';

  const isNpcKnown = (n: any) => {
    return n.isPublic === true ||
      playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'party' ||
      playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'custom';
  };

  const isLocKnown = (l: any) => {
    return l.isPublic === true ||
      playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'party' ||
      playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'custom';
  };

  const isSecretKnown = (i: number) => {
    return !!revealedSecrets[i];
  };

  const isFactionKnown = (f: any) => {
    return f.isPublic === true ||
      playerConfig?.entityVisibility?.factions?.[f.id]?.mode === 'party' ||
      playerConfig?.entityVisibility?.factions?.[f.id]?.mode === 'custom';
  };

  const isItemKnown = (m: any) => {
    return !!m.assignedPlayerId;
  };

  const filteredNpcs = npcs.map((n, i) => ({ n, i })).filter(({ n }) => {
    const searchMatch = matches(n.name || '') || matches(n.archetype || '') || matches(n.faction || '') ||
      matches(n.goal || '') || matches(n.method || '');
    if (!searchMatch) return false;
    if (knowledge === 'known') return isNpcKnown(n);
    if (knowledge === 'unknown') return !isNpcKnown(n);
    return true;
  });

  const filteredLocs = locations.map((l, i) => ({ l, i })).filter(({ l }) => {
    const searchMatch = matches(l.name || '') || matches(l.type || '') || (Array.isArray(l.aspects) && l.aspects.some((a: string) => matches(a || '')));
    if (!searchMatch) return false;
    if (knowledge === 'known') return isLocKnown(l);
    if (knowledge === 'unknown') return !isLocKnown(l);
    return true;
  });

  const filteredSecrets = secrets.map((s, i) => ({ s, i })).filter(({ s, i }) => {
    const searchMatch = matches(s || '');
    if (!searchMatch) return false;
    if (knowledge === 'known') return isSecretKnown(i);
    if (knowledge === 'unknown') return !isSecretKnown(i);
    return true;
  });

  const filteredFactions = factions.map((f, i) => ({ f, i })).filter(({ f }) => {
    const searchMatch = matches(f.name || '') || matches(f.archetype || '') || matches(f.identity || '') || matches(f.area || '');
    if (!searchMatch) return false;
    if (knowledge === 'known') return isFactionKnown(f);
    if (knowledge === 'unknown') return !isFactionKnown(f);
    return true;
  });

  const normalizedItems = magicItems.map((it, i) => normalizeItem(it, i));
  const filteredItems = normalizedItems.map((m, i) => ({ m, i })).filter(({ m }) => {
    const searchMatch = matches(m.name || '') || matches(m.description || '');
    if (!searchMatch) return false;
    if (knowledge === 'known') return isItemKnown(m);
    if (knowledge === 'unknown') return !isItemKnown(m);
    return true;
  });

  const totalCount = filteredNpcs.length + filteredLocs.length + filteredSecrets.length + filteredFactions.length + filteredItems.length;

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex items-center gap-2">
          <Search size={14} className="flex-shrink-0 text-brass-deep" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NPCs, locations, secrets, factions, items…"
            className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {([
            ['all', 'All'],
            ['npcs', `NPCs (${npcs.length})`],
            ['locations', `Locations (${locations.length})`],
            ['secrets', `Secrets (${secrets.length})`],
            ['factions', `Factions (${factions.length})`],
            ['items', `Items (${magicItems.length})`],
          ] as [LookupKind, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
                kind === id ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-mute hover:bg-parchment-deep'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-rule/60 pt-2">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-soft">Visibility:</span>
          {([
            ['all', 'All Info', Globe],
            ['known', 'Known to Players', Eye],
            ['unknown', 'GM Private', EyeOff],
          ] as [KnowledgeFilter, string, any][]).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKnowledge(id)}
              className={`flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
                knowledge === id ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-mute hover:bg-parchment-deep'
              }`}
            >
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
        <div className="font-serif text-[11px] italic text-ink-mute">
          {totalCount === 0 && q ? 'No matches.' : totalCount === 0 ? 'Nothing prepped yet.' : `${totalCount} match${totalCount === 1 ? '' : 'es'}`}
        </div>
      </div>

      {showNpcs && filteredNpcs.length > 0 && (
        <LookupGroup title="NPCs" icon={User}>
          {filteredNpcs.map(({ n, i }) => {
            const id = `npc-${i}`;
            const open = openId === id;
            const label = (n.name || '').trim() || (n.archetype || '').trim() || `NPC ${i + 1}`;
            return (
              <LookupCard key={id} label={label} tag={[n.type, n.faction].filter(Boolean).join(' · ')} open={open} onToggle={() => setOpenId(open ? null : id)} isShared={isNpcKnown(n)}>
                {n.archetype && <Detail label="Archetype">{n.archetype}</Detail>}
                {n.goal && <Detail label="Goal">{n.goal}</Detail>}
                {n.method && <Detail label="Method">{n.method}</Detail>}
                {n.mannerism && <Detail label="Mannerism">{n.mannerism}</Detail>}
                {n.appearance && <Detail label="Appearance">{n.appearance}</Detail>}
              </LookupCard>
            );
          })}
        </LookupGroup>
      )}

      {showLocs && filteredLocs.length > 0 && (
        <LookupGroup title="Locations" icon={Map}>
          {filteredLocs.map(({ l, i }) => {
            const id = `loc-${i}`;
            const open = openId === id;
            const label = (l.name || '').trim() || `Location ${i + 1}`;
            return (
              <LookupCard key={id} label={label} tag={l.type || ''} open={open} onToggle={() => setOpenId(open ? null : id)} isShared={isLocKnown(l)}>
                {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
                  <ul className="ml-3 list-disc text-[12px] italic text-ink-soft">
                    {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
                  </ul>
                )}
                {l.factions && <Detail label="Factions">{l.factions}</Detail>}
              </LookupCard>
            );
          })}
        </LookupGroup>
      )}

      {showSecrets && filteredSecrets.length > 0 && (
        <LookupGroup title="Secrets" icon={ScrollText}>
          {filteredSecrets.map(({ s, i }) => {
            const revealed = !!revealedSecrets[i];
            return (
              <div
                key={`sec-${i}`}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 font-serif text-sm ${revealed ? 'border-emerald-700/40 bg-emerald-100/30 text-ink-mute' : 'border-rule bg-parchment text-ink-soft'}`}
              >
                {revealed ? (
                  <span title="Revealed to Players"><Eye size={11} className="flex-shrink-0 text-moss/70" /></span>
                ) : (
                  <span title="Hidden from Players"><EyeOff size={11} className="flex-shrink-0 text-ink-mute/50" /></span>
                )}
                <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">{revealed ? 'Revealed' : 'Hidden'}</span>
                <span className="flex-1">{s}</span>
              </div>
            );
          })}
        </LookupGroup>
      )}

      {showFactions && filteredFactions.length > 0 && (
        <LookupGroup title="Factions" icon={Users}>
          {filteredFactions.map(({ f, i }) => {
            const id = `fac-${i}`;
            const open = openId === id;
            const label = (f.name || '').trim() || (f.identity || '').trim() || `Faction ${i + 1}`;
            return (
              <LookupCard key={id} label={label} tag={f.archetype || f.area || ''} open={open} onToggle={() => setOpenId(open ? null : id)} isShared={isFactionKnown(f)}>
                {f.identity && <Detail label="Identity">{f.identity}</Detail>}
                {f.area && <Detail label="Area">{f.area}</Detail>}
                {f.power && <Detail label="Power">{f.power}</Detail>}
                {f.ideology && <Detail label="Ideology">{f.ideology}</Detail>}
                {f.longGoal && <Detail label="Long-term goal">{f.longGoal}</Detail>}
              </LookupCard>
            );
          })}
        </LookupGroup>
      )}

      {showItems && filteredItems.length > 0 && (
        <LookupGroup title="Magic Items" icon={Gift}>
          {filteredItems.map(({ m, i }) => {
            const player = roster?.find(r => r.slotId === m.assignedPlayerId);
            return (
              <div key={`item-${i}`} className="space-y-1 rounded border border-rule bg-parchment px-3 py-2 font-serif text-sm text-ink-soft shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-ink">{m.name}</div>
                  {player ? (
                    <span title="Carried by a player (Known)"><Eye size={11} className="text-moss/70" /></span>
                  ) : (
                    <span title="Not assigned (GM Private)"><EyeOff size={11} className="text-ink-mute/50" /></span>
                  )}
                </div>
                {m.description && <div className="text-xs italic text-ink-soft/80">{m.description}</div>}
                {player && <div className="mt-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Carried by: {player.displayName}</div>}
              </div>
            );
          })}
        </LookupGroup>
      )}
    </div>
  );
}

function LookupGroup({
  title, icon: Icon, children,
}: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
        <Icon size={14} className="text-brass-deep" />
        <span className="font-display text-sm tracking-wide text-ink">{title}</span>
      </div>
      <div className="space-y-1.5 p-3">{children}</div>
    </section>
  );
}

function LookupCard({
  label, tag, open, onToggle, isShared, children,
}: { label: string; tag?: string; open: boolean; onToggle: () => void; isShared?: boolean; children?: React.ReactNode }) {
  return (
    <div className="rounded border border-rule bg-parchment font-serif text-sm">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-parchment-deep/30">
        {open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />}
        <span className="flex-1 truncate text-ink">{label}</span>
        {tag && <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">{tag}</span>}
        {isShared !== undefined && (
          isShared ? (
            <span title="Visible/Known to Players"><Eye size={11} className="flex-shrink-0 text-moss/70" /></span>
          ) : (
            <span title="GM Private / Hidden from Players"><EyeOff size={11} className="flex-shrink-0 text-ink-mute/50" /></span>
          )
        )}
      </button>
      {open && children && (
        <div className="space-y-0.5 border-t border-rule px-3 pb-2 pt-1 text-[12px] text-ink-soft">
          {children}
        </div>
      )}
    </div>
  );
}
