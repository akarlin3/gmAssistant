'use client';

import React, { useMemo, useState } from 'react';
import type {
  CampaignWhisper,
  ProjectedWhisper,
  RosterSlot,
} from '@/lib/playerMode/types';
import type {
  PlayerCharacter,
  PlayerWhisperMessage,
  TablePauseSignal,
} from '@/lib/pc/types';

export interface WhisperDrawerProps {
  role: 'gm' | 'player';
  /** Roster slots available for GM targeted whispers. */
  roster?: RosterSlot[];
  /** Active slotId when role === 'player'. */
  activeSlotId?: string;
  /** Full campaign whispers list (for GM). */
  gmWhispers?: CampaignWhisper[];
  /** Party PCs (so GM can also read incoming `pc.playerWhispers`). */
  pcs?: PlayerCharacter[];
  /** Projected whispers for this specific player slot (for `/player`). */
  playerWhispers?: ProjectedWhisper[];
  /** Outbound whispers sent by this player back to the GM. */
  playerSentWhispers?: PlayerWhisperMessage[];
  /** Entities available to attach to a whisper. */
  entities?: Array<{ id: string; name: string; category?: string }>;
  /** GM callback to append a new targeted whisper to `data.whispers`. */
  onGmSendWhisper?: (whisper: CampaignWhisper) => void;
  /** Player callback to send a private whisper back to the GM via `pcWritebacks`. */
  onPlayerSendWhisperToGm?: (msg: PlayerWhisperMessage) => void;
  /** Whether the optional Table Safety Check-In (X-Card / Pause) button is enabled. */
  tableSafetyEnabled?: boolean;
  onToggleTableSafetyEnabled?: (enabled: boolean) => void;
  /** Player callback to emit an anonymous `{ type: 'table_pause_requested', timestamp }` signal. */
  onRequestAnonymousTablePause?: () => void;
  /** Active pause signal banner on the GM's Run screen. */
  activePauseSignal?: TablePauseSignal | null;
  onDismissPauseSignal?: () => void;
}

export function TableSafetyBanner({
  signal,
  onDismiss,
}: {
  signal: TablePauseSignal | null | undefined;
  onDismiss?: () => void;
}) {
  if (!signal || signal.type !== 'table_pause_requested') return null;
  const timeStr = new Date(signal.timestamp || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-400/80 bg-amber-950/90 px-4 py-3 text-amber-100 shadow-xl"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">⏸️</span>
        <div>
          <div className="text-sm font-bold tracking-wide text-amber-200">
            ⏸️ Table Check-In / Pause Requested
          </div>
          <p className="text-xs text-amber-100/85">
            An anonymous player requested a brief pause or check-in at {timeStr}. Take a moment to check in with the table, adjust scene content, or take a quick break—no questions asked.
          </p>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
        >
          ✓ Acknowledge &amp; Resume
        </button>
      )}
    </div>
  );
}

export function WhisperDrawer({
  role,
  roster = [],
  activeSlotId,
  gmWhispers = [],
  pcs = [],
  playerWhispers = [],
  playerSentWhispers = [],
  entities = [],
  onGmSendWhisper,
  onPlayerSendWhisperToGm,
  tableSafetyEnabled = false,
  onToggleTableSafetyEnabled,
  onRequestAnonymousTablePause,
  activePauseSignal,
  onDismissPauseSignal,
}: WhisperDrawerProps) {
  const [open, setOpen] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [linkedEntityId, setLinkedEntityId] = useState('');
  const [pauseConfirmed, setPauseConfirmed] = useState(false);

  // Merge GM whispers and incoming player->GM whispers from `pcs[*].playerWhispers`
  const mergedGmThread = useMemo(() => {
    if (role !== 'gm') return [];
    const list: CampaignWhisper[] = [...gmWhispers];
    const seenIds = new Set(list.map((w) => w.id));
    for (const pc of pcs) {
      const slotId = pc.ownership?.playerSlotId || pc.id;
      const incoming = Array.isArray(pc.playerWhispers) ? pc.playerWhispers : [];
      for (const pw of incoming) {
        if (!pw || typeof pw.id !== 'string' || seenIds.has(pw.id)) continue;
        seenIds.add(pw.id);
        list.push({
          id: pw.id,
          from: slotId,
          fromLabel: pc.name || 'Player',
          toSlotIds: ['gm'],
          text: pw.text,
          entityId: pw.entityId,
          entityName: pw.entityName,
          timestamp: pw.timestamp || 0,
        });
      }
    }
    return list.sort((a, b) => (a.timestamp ?? a.sentAtMs ?? 0) - (b.timestamp ?? b.sentAtMs ?? 0));
  }, [gmWhispers, pcs, role]);

  const mergedPlayerThread = useMemo(() => {
    if (role !== 'player') return [];
    const list: ProjectedWhisper[] = [...playerWhispers];
    const seenIds = new Set(list.map((w) => w.id));
    for (const sent of playerSentWhispers) {
      if (!sent || typeof sent.id !== 'string' || seenIds.has(sent.id)) continue;
      seenIds.add(sent.id);
      list.push({
        id: sent.id,
        from: activeSlotId || 'player',
        fromLabel: 'You',
        text: sent.text,
        entityId: sent.entityId,
        entityName: sent.entityName,
        timestamp: sent.timestamp || 0,
      });
    }
    return list.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }, [activeSlotId, playerSentWhispers, playerWhispers, role]);

  const slotLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of roster) {
      map.set(s.slotId, s.displayName || s.slotId);
    }
    return map;
  }, [roster]);

  const toggleSlotRecipient = (slotId: string) => {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId],
    );
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = Date.now();
    const entity = entities.find((en) => en.id === linkedEntityId);

    if (role === 'gm') {
      const recipients =
        selectedSlotIds.length > 0
          ? selectedSlotIds
          : roster.length > 0
            ? [roster[0].slotId]
            : [];
      if (recipients.length === 0 || !onGmSendWhisper) return;
      onGmSendWhisper({
        id: `wh_${now}_${Math.random().toString(36).slice(2, 7)}`,
        from: 'gm',
        fromLabel: 'GM Whisper',
        toSlotIds: recipients,
        text: trimmed,
        ...(entity ? { entityId: entity.id, entityName: entity.name, entityCategory: entity.category } : {}),
        timestamp: now,
      });
      setText('');
      setLinkedEntityId('');
    } else if (role === 'player' && onPlayerSendWhisperToGm) {
      onPlayerSendWhisperToGm({
        id: `pwh_${now}_${Math.random().toString(36).slice(2, 7)}`,
        text: trimmed,
        ...(entity ? { entityId: entity.id, entityName: entity.name } : {}),
        timestamp: now,
      });
      setText('');
      setLinkedEntityId('');
    }
  };

  const handleAnonymousPauseClick = () => {
    if (!onRequestAnonymousTablePause) return;
    onRequestAnonymousTablePause();
    setPauseConfirmed(true);
    window.setTimeout(() => setPauseConfirmed(false), 4000);
  };

  const unreadCount = role === 'gm' ? mergedGmThread.length : mergedPlayerThread.length;

  return (
    <div className="space-y-2">
      {/* GM Pause Requested Alert Banner */}
      {role === 'gm' && activePauseSignal && (
        <TableSafetyBanner
          signal={activePauseSignal}
          onDismiss={onDismissPauseSignal}
        />
      )}

      <div className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
            open
              ? 'border-purple-500/60 bg-purple-500/20 text-purple-600 dark:text-purple-200'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-purple-500/40'
          }`}
        >
          <span>🤫 Secret Whispers</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-purple-500/30 px-1.5 py-0.2 text-[10px] font-bold text-purple-700 dark:text-purple-200">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Subtle, Optional Table Safety Check-In (X-Card / Pause) Button for Players */}
        {role === 'player' && tableSafetyEnabled && onRequestAnonymousTablePause && (
          <button
            type="button"
            onClick={handleAnonymousPauseClick}
            title="Anonymous Table Safety Check-In (X-Card / Pause) — notifies the GM with zero player/PC identity attached"
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-200 hover:bg-amber-500/25"
          >
            <span>🛡️ {pauseConfirmed ? 'Pause Signal Sent (Anonymous)' : 'Table Pause / Check-In'}</span>
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-purple-500/30 bg-[var(--bg-elevated)] p-3.5 text-[var(--text-primary)] shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-300">
                🤫 Two-Way Secret Whispers
              </h4>
              <p className="text-[11px] text-[var(--text-muted)]">
                {role === 'gm'
                  ? 'Whispers are projected ONLY into the selected player slot(s) and never leak to other players.'
                  : 'Private channel between your slot and the GM via per-slot projection & pcWritebacks.'}
              </p>
            </div>
            {role === 'gm' && onToggleTableSafetyEnabled && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={tableSafetyEnabled}
                  onChange={(e) => onToggleTableSafetyEnabled(e.target.checked)}
                />
                <span>🛡️ Enable Player X-Card / Pause Shield</span>
              </label>
            )}
          </div>

          {/* Message History */}
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {role === 'gm' ? (
              mergedGmThread.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-2">
                  No secret whispers sent or received yet.
                </p>
              ) : (
                mergedGmThread.map((w) => (
                  <div
                    key={w.id}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      w.from === 'gm'
                        ? 'border-purple-500/30 bg-purple-500/10 text-[var(--text-primary)]'
                        : 'border-sky-500/30 bg-sky-500/10 text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>
                        {w.from === 'gm'
                          ? `GM → ${w.toSlotIds.map((id) => slotLabelById.get(id) || id).join(', ')}`
                          : `${w.fromLabel || w.from} → GM`}
                      </span>
                      <span>
                        {w.timestamp
                          ? new Date(w.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[var(--text-primary)]">{w.text}</div>
                    {w.entityName && (
                      <span className="mt-1 inline-block rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                        📎 {w.entityName}
                      </span>
                    )}
                  </div>
                ))
              )
            ) : mergedPlayerThread.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-2">
                No private whispers for your slot yet.
              </p>
            ) : (
              mergedPlayerThread.map((w) => (
                <div
                  key={w.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                    w.from === 'gm'
                      ? 'border-purple-500/30 bg-purple-500/10 text-[var(--text-primary)]'
                      : 'border-sky-500/30 bg-sky-500/10 text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span>
                      {w.from === 'gm' ? '🔒 From GM (Private to you)' : `You (${activeSlotId || 'Player'}) → GM`}
                    </span>
                    <span>
                      {w.timestamp
                        ? new Date(w.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[var(--text-primary)]">{w.text}</div>
                  {w.entityName && (
                    <span className="mt-1 inline-block rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                      📎 {w.entityName}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Compose Form */}
          <form onSubmit={handleSend} className="space-y-2 border-t border-[var(--border-subtle)] pt-2">
            {role === 'gm' && roster.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[var(--text-muted)]">To Slot(s):</span>
                {roster.map((slot) => {
                  const active = selectedSlotIds.includes(slot.slotId);
                  return (
                    <button
                      key={slot.slotId}
                      type="button"
                      onClick={() => toggleSlotRecipient(slot.slotId)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        active
                          ? 'bg-purple-500/30 text-purple-700 dark:text-purple-200 border border-purple-500/50'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      {slot.displayName || slot.slotId}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  role === 'gm'
                    ? 'Write a private whisper to selected player slot(s)…'
                    : 'Send a secret whisper to the GM…'
                }
                className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
              />
              {entities.length > 0 && (
                <select
                  value={linkedEntityId}
                  onChange={(e) => setLinkedEntityId(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-secondary)]"
                >
                  <option value="">Attach Lore…</option>
                  {entities.map((en) => (
                    <option key={en.id} value={en.id}>
                      {en.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                className="rounded-lg bg-purple-500/25 border border-purple-500/50 px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-200 hover:bg-purple-500/35"
              >
                Send Whisper
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default WhisperDrawer;
