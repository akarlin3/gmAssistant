'use client';

// Read-only, real-time player view. Driven entirely by the redacted
// SlotProjection published by the GM (playerShares/{token}/slots/{slotId}).
// No edit affordances; mobile-first.

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText, Users, Map, Flag, Clock, BookOpen, UserCircle, Gift } from 'lucide-react';
import { subscribeSlotProjection } from '@/lib/playerMode/playerClient';
import type { SlotProjection } from '@/lib/playerMode/types';

type AnyRec = Record<string, unknown>;

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  characters: { label: 'Party', icon: <UserCircle size={15} /> },
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

export default function PlayerCampaignView({
  token, slotId, displayName, campaignName, onSwitch,
}: {
  token: string; slotId: string; displayName: string; campaignName: string; onSwitch: () => void;
}) {
  const [projection, setProjection] = useState<SlotProjection | null | undefined>(undefined);
  const [active, setActive] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeSlotProjection(token, slotId, setProjection, () => setProjection(null));
    return unsub;
  }, [token, slotId]);

  const tabs = useMemo(() => {
    if (!projection) return [];
    const out: { id: string; label: string; icon: React.ReactNode }[] = [];
    for (const [type, meta] of Object.entries(TYPE_META)) {
      const items = projection.entities[type as keyof SlotProjection['entities']];
      if (items && items.length > 0) out.push({ id: type, label: meta.label, icon: meta.icon });
    }
    if (projection.sessionLog.length > 0) out.push({ id: 'log', label: 'Log', icon: <ScrollText size={15} /> });
    if (projection.handouts) out.push({ id: 'handouts', label: 'Handouts', icon: <BookOpen size={15} /> });
    if (projection.items && projection.items.length > 0) {
      out.push({ id: 'items', label: 'My Items', icon: <Gift size={15} /> });
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
              {active === 'log' ? (
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
