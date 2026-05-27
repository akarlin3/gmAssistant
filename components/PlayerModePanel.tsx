'use client';

// GM-side Player Mode control surface. Consolidates the roster manager, share
// link, field-default editor, per-entity visibility controls, and a
// preview-as-player view in one panel (rather than scattering controls across
// every entity card). Edits flow up via onConfigChange, which the editor
// persists to campaign.data.player; this panel also debounce-publishes the
// redacted projections that players read.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, Link2, RotateCcw, Copy, Check, Plus, X, Eye, ChevronDown, ChevronRight, Send, ScrollText, Trash2, Pencil,
} from 'lucide-react';
import {
  PLAYER_ENTITY_TYPES, type PlayerConfig, type PlayerEntityType,
  type EntityVisibility, type RosterSlot, type VisibilityMode,
} from '@/lib/playerMode/types';
import { DEFAULT_FIELD_VISIBILITY, cloneDefaultFieldVisibility } from '@/lib/playerMode/fieldDefaults';
import { resolveFieldPrivacy } from '@/lib/playerMode/resolveVisibility';
import { buildSlotProjection } from '@/lib/playerMode/projection';
import { publishProjections, rotateShareToken, deleteShare, playUrl } from '@/lib/playerMode/publish';
import { makeSlotId } from '@/lib/playerMode/share';
import { removeSlotFromConfig } from '@/lib/playerMode/roster';
import {
  applyNarrationReveal, makeLogEntryId, type Mention, type PlayerLogEntry,
} from '@/lib/playerMode/sessionLog';

type AnyData = Record<string, any>;
type Confirm = (o: { title: string; message: string; confirmText?: string; cancelText?: string; isDestructive?: boolean }) => Promise<boolean>;

const TYPE_LABELS: Record<PlayerEntityType, string> = {
  characters: 'Characters', pcs: 'Party (PC Sheets)', npcs: 'NPCs', locations: 'Locations', factions: 'Factions', clocks: 'Clocks',
};

function entityLabel(type: PlayerEntityType, e: AnyData, i: number): string {
  if (type === 'clocks') return e.text || `Clock ${i + 1}`;
  return e.name || `${TYPE_LABELS[type].replace(/s$/, '')} ${i + 1}`;
}

const SectionCard = ({ title, icon, children, defaultOpen = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-rule bg-parchment-soft shadow-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown size={16} className="text-brass-deep" /> : <ChevronRight size={16} className="text-brass-deep" />}
        <span className="text-brass-deep">{icon}</span>
        <h3 className="font-display text-sm uppercase tracking-wider text-ink">{title}</h3>
      </button>
      {open && <div className="border-t border-rule px-4 py-3">{children}</div>}
    </section>
  );
};

export default function PlayerModePanel({
  campaignId, campaignName, data, config, onConfigChange, confirm, playerLog, onPlayerLogChange,
}: {
  campaignId: string;
  campaignName: string;
  data: AnyData;
  config: PlayerConfig;
  onConfigChange: (next: PlayerConfig) => void;
  confirm: Confirm;
  playerLog: PlayerLogEntry[];
  onPlayerLogChange: (entries: PlayerLogEntry[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle');
  const [previewSlot, setPreviewSlot] = useState<string>('');
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roster = config.roster ?? [];

  // Debounced auto-publish whenever the campaign data or config changes.
  const publishSignature = useMemo(
    () => JSON.stringify({ p: config, n: data.npcs, l: data.locations, f: data.factions, c: data.characters, k: data.clocks, h: data.handouts, s: data.playerLog, i: data.items, g: data.pcGoals }),
    [config, data.npcs, data.locations, data.factions, data.characters, data.clocks, data.handouts, data.playerLog, data.items, data.pcGoals],
  );
  useEffect(() => {
    if (!config?.shareToken) return;
    if (publishTimer.current) clearTimeout(publishTimer.current);
    publishTimer.current = setTimeout(() => { void doPublish(); }, 1500);
    return () => { if (publishTimer.current) clearTimeout(publishTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishSignature]);

  async function doPublish() {
    setPublishState('publishing');
    try {
      await publishProjections(campaignId, campaignName, { ...data, player: config });
      setPublishState('done');
      setTimeout(() => setPublishState('idle'), 2000);
    } catch (e) {
      console.error('[PlayerMode] publish failed', e);
      setPublishState('error');
    }
  }

  // ---- Roster --------------------------------------------------------------
  function addSlot() {
    const slot: RosterSlot = { slotId: makeSlotId(), displayName: `Player ${roster.length + 1}`, createdAtMs: Date.now() };
    onConfigChange({ ...config, roster: [...roster, slot] });
  }
  function editSlot(slotId: string, patch: Partial<RosterSlot>) {
    onConfigChange({ ...config, roster: roster.map((s) => (s.slotId === slotId ? { ...s, ...patch } : s)) });
  }
  async function removeSlot(slot: RosterSlot) {
    const ok = await confirm({
      title: 'Remove player slot?',
      message: `Remove "${slot.displayName}"? Anyone using that slot will lose access on their next load.`,
      confirmText: 'Remove', isDestructive: true,
    });
    if (!ok) return;
    // Drop the slot from the roster and scrub it out of every custom allow-list.
    // The publisher prunes the orphaned slot projection doc on the next publish.
    onConfigChange(removeSlotFromConfig(config, slot.slotId));
  }

  // ---- Token rotation ------------------------------------------------------
  async function rotate() {
    const ok = await confirm({
      title: 'Rotate share link?',
      message: 'This generates a new link and immediately invalidates the old one. Everyone will need the new link.',
      confirmText: 'Rotate', isDestructive: true,
    });
    if (!ok) return;
    const oldToken = config.shareToken;
    const next = rotateShareToken(config);
    onConfigChange(next);
    try { await deleteShare(oldToken); } catch { /* best effort */ }
  }

  function copyLink() {
    const url = playUrl(config.shareToken);
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ---- Field defaults ------------------------------------------------------
  function setFieldDefault(type: PlayerEntityType, field: string, privacy: 'public' | 'private') {
    const fd = { ...(config.fieldDefaults ?? {}) };
    fd[type] = { ...(fd[type] ?? {}), [field]: privacy };
    onConfigChange({ ...config, fieldDefaults: fd });
  }
  function resetDefaults() {
    onConfigChange({ ...config, fieldDefaults: cloneDefaultFieldVisibility() });
  }

  // ---- Per-entity visibility ----------------------------------------------
  function getVis(type: PlayerEntityType, id: string): EntityVisibility | undefined {
    return config.entityVisibility?.[type]?.[id];
  }
  function setVis(type: PlayerEntityType, id: string, vis: EntityVisibility | undefined) {
    const ev = { ...(config.entityVisibility ?? {}) };
    const bucket = { ...(ev[type] ?? {}) };
    if (!vis || vis.mode === 'private') delete bucket[id]; else bucket[id] = vis;
    ev[type] = bucket;
    onConfigChange({ ...config, entityVisibility: ev });
  }

  // ---- Narration feed ------------------------------------------------------
  function postNarration(text: string, mentions: Mention[], vis: EntityVisibility) {
    const entry: PlayerLogEntry = {
      id: makeLogEntryId(), text: text.trim(), mentions, visibility: vis, authorRef: 'gm', postedAtMs: Date.now(),
    };
    onPlayerLogChange([...(playerLog ?? []), entry]);
    // Auto-reveal mentioned entities (sticky).
    const nextConfig = applyNarrationReveal(config, mentions, vis);
    if (nextConfig !== config) onConfigChange(nextConfig);
  }
  function editNarration(id: string, text: string) {
    // Editing text never un-reveals entities (reveals are sticky).
    onPlayerLogChange((playerLog ?? []).map((e) => (e.id === id ? { ...e, text } : e)));
  }
  async function deleteNarration(id: string) {
    const ok = await confirm({ title: 'Delete log entry?', message: 'Players will no longer see this entry. Already-revealed entities stay revealed.', confirmText: 'Delete', isDestructive: true });
    if (!ok) return;
    onPlayerLogChange((playerLog ?? []).filter((e) => e.id !== id));
  }

  const url = playUrl(config.shareToken, typeof window !== 'undefined' ? window.location.origin : 'https://gm.averykarlin.org');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h2 className="font-display text-2xl tracking-wide text-ink">Player Mode</h2>
        <p className="font-serif text-sm italic text-ink-soft">
          Share a read-only view with your players. They see only what you reveal — no account needed.
        </p>
      </header>

      {/* Share link */}
      <SectionCard title="Share link" icon={<Link2 size={16} />} defaultOpen>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="flex-1 truncate rounded border border-rule bg-parchment px-2 py-1.5 font-mono text-xs text-ink-soft" />
            <button onClick={copyLink} className="flex items-center gap-1 rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={rotate} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson hover:text-wine">
            <RotateCcw size={13} /> Rotate link (version {config.tokenVersion})
          </button>
        </div>
      </SectionCard>

      {/* Roster */}
      <SectionCard title={`Roster (${roster.length})`} icon={<Users size={16} />} defaultOpen>
        <div className="space-y-2">
          {roster.length === 0 && (
            <p className="font-serif text-sm italic text-ink-mute">No player slots yet. Add one for each seat at your table.</p>
          )}
          {roster.map((s) => (
            <div key={s.slotId} className="flex items-center gap-2">
              <input
                value={s.displayName}
                onChange={(e) => editSlot(s.slotId, { displayName: e.target.value })}
                className="flex-1 rounded border border-rule bg-parchment px-2 py-1 text-sm text-ink"
                placeholder="Player name"
              />
              <input
                type="color"
                value={s.color || '#8a6d3b'}
                onChange={(e) => editSlot(s.slotId, { color: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border border-rule bg-parchment"
                title="Slot color"
              />
              <button onClick={() => removeSlot(s)} className="text-ink-mute hover:text-crimson"><X size={16} /></button>
            </div>
          ))}
          <button onClick={addSlot} className="flex items-center gap-1 rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">
            <Plus size={14} /> Add slot
          </button>
        </div>
      </SectionCard>

      {/* Field defaults */}
      <SectionCard title="Field visibility defaults" icon={<Eye size={16} />}>
        <div className="space-y-4">
          <p className="font-serif text-xs italic text-ink-mute">
            Default privacy per field for each entity type. Per-entity overrides win over these.
          </p>
          {PLAYER_ENTITY_TYPES.map((type) => (
            <div key={type}>
              <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">{TYPE_LABELS[type]}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {Object.keys(DEFAULT_FIELD_VISIBILITY[type]).map((field) => {
                  const current = resolveFieldPrivacy(field, DEFAULT_FIELD_VISIBILITY[type], config.fieldDefaults?.[type]);
                  return (
                    <label key={field} className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                      <span className="truncate">{field}</span>
                      <button
                        onClick={() => setFieldDefault(type, field, current === 'public' ? 'private' : 'public')}
                        className={`rounded px-1.5 py-0.5 font-display uppercase tracking-wider ${current === 'public' ? 'bg-brass/20 text-brass-deep' : 'bg-parchment-deep text-ink-mute'}`}
                      >
                        {current}
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={resetDefaults} className="font-display text-xs uppercase tracking-wider text-crimson hover:text-wine">
            Reset to recommended
          </button>
        </div>
      </SectionCard>

      {/* Per-entity visibility */}
      <SectionCard title="What players can see" icon={<Send size={16} />} defaultOpen>
        <div className="space-y-4">
          {PLAYER_ENTITY_TYPES.map((type) => {
            const arr = Array.isArray(data[type]) ? data[type] : [];
            if (arr.length === 0) return null;
            return (
              <div key={type}>
                <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">{TYPE_LABELS[type]}</div>
                <div className="space-y-1.5">
                  {arr.map((e: AnyData, i: number) => {
                    if (!e?.id) return null;
                    const vis = getVis(type, e.id);
                    const mode: VisibilityMode = vis?.mode ?? 'private';
                    return (
                      <EntityVisibilityRow
                        key={e.id}
                        label={entityLabel(type, e, i)}
                        mode={mode}
                        allowedSlotIds={vis?.allowedSlotIds ?? []}
                        roster={roster}
                        onMode={(m) => {
                          if (m === 'custom') setVis(type, e.id, { ...vis, mode: 'custom', allowedSlotIds: vis?.allowedSlotIds ?? [] });
                          else if (m === 'party') setVis(type, e.id, { ...vis, mode: 'party' });
                          else setVis(type, e.id, undefined);
                        }}
                        onToggleSlot={(slotId) => {
                          const cur = new Set(vis?.allowedSlotIds ?? []);
                          if (cur.has(slotId)) cur.delete(slotId); else cur.add(slotId);
                          setVis(type, e.id, { mode: 'custom', allowedSlotIds: [...cur], fieldOverrides: vis?.fieldOverrides });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Handouts toggle */}
          {typeof data.handouts === 'string' && data.handouts.trim() && (
            <div>
              <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Handouts</div>
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={config.handouts?.mode === 'party'}
                  onChange={(e) => onConfigChange({ ...config, handouts: e.target.checked ? { mode: 'party' } : undefined })}
                  className="accent-wine"
                />
                Share handouts with all players
              </label>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Session log / narration */}
      <SectionCard title="Session log" icon={<ScrollText size={16} />} defaultOpen>
        <div className="space-y-3">
          <NarrationComposer data={data} roster={roster} onPost={postNarration} />
          <NarrationFeed entries={playerLog ?? []} onEdit={editNarration} onDelete={deleteNarration} />
        </div>
      </SectionCard>

      {/* Preview */}
      <SectionCard title="Preview as player" icon={<Eye size={16} />}>
        <PreviewAsPlayer data={data} config={config} campaignName={campaignName} previewSlot={previewSlot} setPreviewSlot={setPreviewSlot} />
      </SectionCard>

      <div className="flex items-center justify-between px-1 text-xs text-ink-mute">
        <span className="font-serif italic">
          {publishState === 'publishing' && 'Publishing to players…'}
          {publishState === 'done' && 'Players are up to date.'}
          {publishState === 'error' && <span className="text-crimson">Publish failed — check your connection.</span>}
          {publishState === 'idle' && roster.length === 0 && 'Add a roster slot to start sharing.'}
        </span>
        <button onClick={() => void doPublish()} disabled={!config?.shareToken} className="rounded border border-brass px-3 py-1 font-display uppercase tracking-wider text-brass-deep hover:bg-brass/10 disabled:opacity-40">
          Publish now
        </button>
      </div>
    </div>
  );
}

function EntityVisibilityRow({
  label, mode, allowedSlotIds, roster, onMode, onToggleSlot,
}: {
  label: string;
  mode: VisibilityMode;
  allowedSlotIds: string[];
  roster: RosterSlot[];
  onMode: (m: VisibilityMode) => void;
  onToggleSlot: (slotId: string) => void;
}) {
  return (
    <div className="rounded border border-rule bg-parchment px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-serif text-sm text-ink">{label}</span>
        <div className="flex flex-shrink-0 gap-1 font-display text-[10px] uppercase tracking-wider">
          {(['private', 'party', 'custom'] as VisibilityMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`rounded px-2 py-0.5 ${mode === m ? 'bg-brass-deep text-parchment' : 'bg-parchment-deep text-ink-mute hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === 'custom' && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {roster.length === 0 && <span className="font-serif text-xs italic text-ink-mute">Add roster slots first.</span>}
          {roster.map((s) => {
            const on = allowedSlotIds.includes(s.slotId);
            return (
              <button
                key={s.slotId}
                onClick={() => onToggleSlot(s.slotId)}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${on ? 'border-brass-deep bg-brass/20 text-brass-deep' : 'border-rule text-ink-mute'}`}
              >
                {s.displayName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NarrationComposer({
  data, roster, onPost,
}: {
  data: AnyData; roster: RosterSlot[]; onPost: (text: string, mentions: Mention[], vis: EntityVisibility) => void;
}) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mode, setMode] = useState<'party' | 'custom'>('party');
  const [slots, setSlots] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const allEntities = useMemo(() => {
    const list: Mention[] = [];
    for (const type of PLAYER_ENTITY_TYPES) {
      const arr = Array.isArray(data[type]) ? data[type] : [];
      arr.forEach((e: AnyData, i: number) => { if (e?.id) list.push({ entityType: type, entityId: e.id, label: entityLabel(type, e, i) }); });
    }
    return list;
  }, [data]);

  const suggestions = query === null ? [] : allEntities.filter((e) => e.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function onChange(v: string) {
    setText(v);
    const caret = taRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/@([\p{L}\p{N}_ ]{0,30})$/u);
    setQuery(m ? m[1] : null);
  }

  function pickMention(e: Mention) {
    const caret = taRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}_ ]{0,30})$/u, `@${e.label} `);
    setText(before + text.slice(caret));
    setMentions((prev) => (prev.some((p) => p.entityType === e.entityType && p.entityId === e.entityId) ? prev : [...prev, e]));
    setQuery(null);
    taRef.current?.focus();
  }

  function removeMention(e: Mention) {
    setMentions((prev) => prev.filter((p) => !(p.entityType === e.entityType && p.entityId === e.entityId)));
  }

  function post() {
    if (!text.trim() && mentions.length === 0) return;
    const vis: EntityVisibility = mode === 'party' ? { mode: 'party' } : { mode: 'custom', allowedSlotIds: slots };
    onPost(text, mentions, vis);
    setText(''); setMentions([]); setQuery(null);
  }

  return (
    <div className="space-y-2 rounded border border-rule bg-parchment p-3">
      <div className="relative">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Narrate what happened… type @ to mention an NPC, place, or faction (mentioning reveals it)."
          className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink"
        />
        {query !== null && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-64 overflow-hidden rounded border border-rule bg-parchment-soft shadow-page">
            {suggestions.map((e) => (
              <button
                key={`${e.entityType}:${e.entityId}`}
                onClick={() => pickMention(e)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-sm text-ink hover:bg-parchment-deep"
              >
                <span className="truncate">{e.label}</span>
                <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">{e.entityType}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mentions.map((m) => (
            <span key={`${m.entityType}:${m.entityId}`} className="flex items-center gap-1 rounded-full bg-brass/20 px-2 py-0.5 text-[11px] text-brass-deep">
              {m.label}
              <button onClick={() => removeMention(m)} className="hover:text-crimson"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Visible to</span>
          <div className="flex gap-1 font-display text-[10px] uppercase tracking-wider">
            {(['party', 'custom'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 ${mode === m ? 'bg-brass-deep text-parchment' : 'bg-parchment-deep text-ink-mute'}`}>{m}</button>
            ))}
          </div>
          {mode === 'custom' && roster.map((s) => {
            const on = slots.includes(s.slotId);
            return (
              <button key={s.slotId} onClick={() => setSlots((p) => (on ? p.filter((x) => x !== s.slotId) : [...p, s.slotId]))} className={`rounded-full border px-2 py-0.5 text-[10px] ${on ? 'border-brass-deep bg-brass/20 text-brass-deep' : 'border-rule text-ink-mute'}`}>{s.displayName}</button>
            );
          })}
        </div>
        <button onClick={post} className="flex items-center gap-1 rounded border border-brass-deep bg-brass/10 px-3 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment">
          <Send size={13} /> Post
        </button>
      </div>
    </div>
  );
}

function NarrationFeed({
  entries, onEdit, onDelete,
}: {
  entries: PlayerLogEntry[]; onEdit: (id: string, text: string) => void; onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const sorted = [...entries].sort((a, b) => b.postedAtMs - a.postedAtMs);
  if (sorted.length === 0) return <p className="font-serif text-xs italic text-ink-mute">No narration posted yet.</p>;
  return (
    <div className="space-y-2">
      {sorted.map((e) => (
        <div key={e.id} className="rounded border border-rule bg-parchment px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
              {new Date(e.postedAtMs).toLocaleString()} · {e.visibility.mode === 'party' ? 'all players' : `${e.visibility.allowedSlotIds?.length ?? 0} player(s)`}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setEditingId(e.id); setDraft(e.text); }} className="text-ink-mute hover:text-brass-deep"><Pencil size={13} /></button>
              <button onClick={() => onDelete(e.id)} className="text-ink-mute hover:text-crimson"><Trash2 size={13} /></button>
            </div>
          </div>
          {editingId === e.id ? (
            <div className="space-y-1">
              <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={2} className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink" />
              <div className="flex gap-2 font-display text-[10px] uppercase tracking-wider">
                <button onClick={() => { onEdit(e.id, draft); setEditingId(null); }} className="rounded bg-brass-deep px-2 py-0.5 text-parchment">Save</button>
                <button onClick={() => setEditingId(null)} className="rounded border border-rule px-2 py-0.5 text-ink-mute">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap font-serif text-sm text-ink-soft">{e.text}</p>
          )}
          {e.mentions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {e.mentions.map((m) => <span key={`${m.entityType}:${m.entityId}`} className="rounded-full bg-parchment-deep px-1.5 py-0.5 text-[10px] text-ink-mute">{m.label}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PreviewAsPlayer({
  data, config, campaignName, previewSlot, setPreviewSlot,
}: {
  data: AnyData; config: PlayerConfig; campaignName: string; previewSlot: string; setPreviewSlot: (s: string) => void;
}) {
  const roster = config.roster ?? [];
  const slotId = previewSlot || roster[0]?.slotId || '';
  const projection = useMemo(
    () => (slotId ? buildSlotProjection({ ...data, player: config }, campaignName, slotId) : null),
    [data, config, campaignName, slotId],
  );
  if (roster.length === 0) return <p className="font-serif text-sm italic text-ink-mute">Add a roster slot to preview.</p>;
  return (
    <div className="space-y-3">
      <select value={slotId} onChange={(e) => setPreviewSlot(e.target.value)} className="rounded border border-rule bg-parchment px-2 py-1 text-sm text-ink">
        {roster.map((s) => <option key={s.slotId} value={s.slotId}>{s.displayName}</option>)}
      </select>
      {projection && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-3 text-sm">
          {Object.entries(projection.entities).every(([, v]) => !v?.length) && !projection.handouts && projection.sessionLog.length === 0 && (!projection.items || projection.items.length === 0) && (!projection.pcGoals || projection.pcGoals.length === 0) ? (
            <p className="font-serif italic text-ink-mute">This player sees nothing yet.</p>
          ) : (
            <>
              {Object.entries(projection.entities).map(([type, items]) => (
                items && items.length > 0 ? (
                  <div key={type}>
                    <div className="font-display text-xs uppercase tracking-wider text-brass-deep">{type}</div>
                    <ul className="list-disc pl-5 font-serif text-ink-soft">
                      {items.map((it: AnyData) => (
                        <li key={it.id}>{(it.name as string) || (it.text as string) || it.id} <span className="text-ink-mute">({Object.keys(it).filter((k) => k !== 'id').length} fields)</span></li>
                      ))}
                    </ul>
                  </div>
                ) : null
              ))}
              {projection.handouts && <div className="font-serif text-ink-soft"><span className="font-display text-xs uppercase tracking-wider text-brass-deep">Handouts</span> shared</div>}
              {projection.sessionLog.length > 0 && <div className="font-serif text-ink-soft">{projection.sessionLog.length} session log entr{projection.sessionLog.length === 1 ? 'y' : 'ies'} shared</div>}
              {projection.pcGoals && projection.pcGoals.length > 0 && (
                <div>
                  <div className="font-display text-xs uppercase tracking-wider text-brass-deep mt-2">goals</div>
                  <ul className="list-disc pl-5 font-serif text-ink-soft">
                    {projection.pcGoals.map((g: any, idx: number) => (
                      <li key={idx}>{g.text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {projection.items && projection.items.length > 0 && (
                <div>
                  <div className="font-display text-xs uppercase tracking-wider text-brass-deep font-semibold mt-2">Given Items</div>
                  <ul className="list-disc pl-5 font-serif text-ink-soft">
                    {projection.items.map((it) => (
                      <li key={it.id}>{it.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
