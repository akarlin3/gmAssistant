'use client';

import React from 'react';
import { ChevronDown, ChevronRight, X, User } from 'lucide-react';
import { Tag, Inspire } from '../prepPrimitives';
import { DowntimeCard, DOWNTIME_TYPES, makeDowntimeId } from '../cards';
import type { DowntimeEntry } from '../prepTypes';
import type { CampaignEditorModel } from '../useCampaignEditor';

export function WorldbuildView({ ed }: { ed: CampaignEditorModel }) {
  const { get, setVal, trackEvent, showUndoToast } = ed;

  const downtime = (get('downtime', []) as DowntimeEntry[]) || [];
  const active = downtime.filter(e => !e.archived);
  const archived = downtime.filter(e => !!e.archived);
  const archivedOpen = get('__archivedDowntimeOpen', false) as boolean;
  const setArchivedOpen = (v: boolean) => setVal('__archivedDowntimeOpen', v);

  const addEntry = (typeId: string) => {
    const next: DowntimeEntry = {
      id: makeDowntimeId(),
      type: typeId,
      fields: {},
      createdAt: new Date().toISOString(),
    };
    setVal('downtime', [...downtime, next]);
    const label = DOWNTIME_TYPES.find(t => t.id === typeId)?.label || typeId;
    trackEvent('downtime_added', `Started downtime: ${label}`);
  };
  const updateEntry = (id: string, patch: DowntimeEntry) => {
    setVal('downtime', downtime.map(e => e.id === id ? patch : e));
  };
  const setArchived = (id: string, archived: boolean) => {
    setVal('downtime', downtime.map(e => e.id === id ? { ...e, archived } : e));
  };
  const removeEntry = (id: string) => {
    const entry = downtime.find(e => e.id === id);
    const typeLabel = DOWNTIME_TYPES.find(t => t.id === entry?.type)?.label || 'entry';
    setVal('downtime', downtime.filter(e => e.id !== id));
    showUndoToast(`Deleted "${typeLabel}" — Press ⌘Z to undo`, 5000);
  };

  const groupedActive = DOWNTIME_TYPES
    .map(t => ({ type: t, entries: active.filter(e => e.type === t.id) }))
    .filter(g => g.entries.length > 0);

  return (
    <div className="space-y-3 text-sm">
      {/* Methodologies */}
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h2 className="mb-2 font-display text-lg tracking-wide text-ink">The Three Methodologies</h2>
        <div className="space-y-3 font-serif text-sm text-ink-soft">
          <div>
            <div className="mb-1 flex items-center gap-2"><Tag m="shea" /><span className="font-display tracking-wide text-ink">Return of the Lazy Dungeon Master</span> <span className="italic text-ink-mute">· Shea</span></div>
            <p>8-step per-session checklist. Strong start, secrets &amp; clues, fantastic locations.</p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2"><Tag m="ccd" /><span className="font-display tracking-wide text-ink">Collaborative Campaign Design</span> <span className="italic text-ink-mute">· Fishel</span></div>
            <p>Session −1 worldbuilding before character creation. Faction clocks.</p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2"><Tag m="pr" /><span className="font-display tracking-wide text-ink">Proactive Roleplaying</span> <span className="italic text-ink-mute">· Fishel</span></div>
            <p>5 Rules of Proactive Fun. &quot;+1&quot; reward principle.</p>
          </div>
        </div>
      </div>

      {/* Five Rules */}
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h2 className="mb-2 font-display text-lg tracking-wide text-ink">Five Rules of Proactive Fun</h2>
        <ol className="list-inside list-decimal space-y-2 font-serif text-sm text-ink-soft">
          <li><span className="font-semibold text-ink">Multiple Goals.</span> 3-4 concurrent.</li>
          <li><span className="font-semibold text-ink">Varying Timeframes.</span> Short / Mid / Long.</li>
          <li><span className="font-semibold text-ink">Achievable.</span> Measurable success state.</li>
          <li><span className="font-semibold text-ink">Consequences for Failure.</span> If retryable, it was a skill check.</li>
          <li><span className="font-semibold text-ink">Fun to Pursue.</span> GM can imagine obstacles.</li>
        </ol>
      </div>

      {/* Campaign Events */}
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg tracking-wide text-ink">Campaign Events Between Sessions</h2>
          <Inspire tableId="campaignEvents" label="Roll Event" onPick={(e) => {
            const log = (get('campaignEventLog', []) as string[]) || [];
            setVal('campaignEventLog', [...log, e]);
          }} />
        </div>
        <p className="mb-2 font-serif text-sm text-ink-soft">
          Quick &quot;while the party was away&quot; events for solo or sandbox play.
        </p>
        {((get('campaignEventLog', []) as string[]) || []).length === 0 ? (
          <p className="font-serif text-sm italic text-ink-mute">No events logged yet. Click &quot;Roll Event&quot; to add one.</p>
        ) : (
          <ol className="space-y-1 font-serif text-sm text-ink-soft">
            {((get('campaignEventLog', []) as string[]) || []).map((evt, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-1">
                  <span className="mr-1 font-display text-xs text-brass-deep">{i + 1}.</span>
                  {evt}
                </span>
                <button
                  onClick={() => {
                    const log = (get('campaignEventLog', []) as string[]) || [];
                    setVal('campaignEventLog', log.filter((_, j) => j !== i));
                  }}
                  className="text-ink-mute hover:text-crimson"
                  title="Remove this event"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 10-Sentence NPC */}
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h2 className="mb-2 font-display text-lg tracking-wide text-ink">The 10-Sentence NPC</h2>
        <p className="font-serif text-sm text-ink-soft">
          Detailed NPCs benefit from a roughly ten-sentence sketch: occupation and history,
          appearance, abilities, talent, mannerism, interactions, useful knowledge, ideal, bond,
          and flaw or secret. Click &quot;Show Details&quot; on any NPC card to expand the full set.
        </p>
      </div>

      {/* Solo Play */}
      <div className="rounded border border-wine/40 bg-wine/5 p-4 shadow-card">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg tracking-wide text-ink"><User size={16} className="text-wine" /> Solo Play Adaptations</h2>
        <div className="space-y-2 font-serif text-sm text-ink-soft">
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">Session −1 · </span>2-person conversation.</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">Goals · </span>Rule 4 matters more.</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">Combat · </span>Solo level-1 ~8-12 HP. Narrative outs always.</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">Strong Start · </span>Action without losable fight.</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">Pacing · </span>2-3 scenes/hour instead of 1-2.</p>
        </div>
      </div>

      {/* Downtime */}
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <p className="font-serif text-ink-soft">
          Downtime activities take place between adventures. Each activity has a cost, a duration,
          and consequences. Track them here so the time between sessions feels lived-in rather than skipped.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-rule bg-parchment p-3 shadow-card">
        <label className="font-display text-xs uppercase tracking-wider text-ink-soft">Add Downtime Activity</label>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              addEntry(e.target.value);
              e.target.value = '';
            }
          }}
          className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
        >
          <option value="">— Choose Activity —</option>
          {DOWNTIME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {active.length === 0 && (
        <p className="font-serif text-sm italic text-ink-mute">No active downtime activities yet.</p>
      )}

      {groupedActive.map(({ type, entries }) => (
        <div key={type.id} className="space-y-2">
          <h3 className="font-display text-sm tracking-wide text-ink">{type.label}</h3>
          {entries.map(entry => (
            <DowntimeCard
              key={entry.id}
              entry={entry}
              onChange={(v) => updateEntry(entry.id, v)}
              onArchive={() => setArchived(entry.id, true)}
              onUnarchive={() => setArchived(entry.id, false)}
              onRemove={() => removeEntry(entry.id)}
            />
          ))}
        </div>
      ))}

      <div className="rounded border border-rule bg-parchment p-3 shadow-card">
        <button
          onClick={() => setArchivedOpen(!archivedOpen)}
          className="flex items-center gap-1.5 font-display text-sm tracking-wide text-ink hover:text-crimson"
        >
          {archivedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Archived ({archived.length})
        </button>
        {archivedOpen && (
          <div className="mt-3 space-y-2">
            {archived.length === 0 && (
              <p className="font-serif text-sm italic text-ink-mute">No archived downtime activities yet.</p>
            )}
            {archived.map(entry => (
              <DowntimeCard
                key={entry.id}
                entry={entry}
                onChange={(v) => updateEntry(entry.id, v)}
                onArchive={() => setArchived(entry.id, true)}
                onUnarchive={() => setArchived(entry.id, false)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
