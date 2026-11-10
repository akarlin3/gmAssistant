'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Backpack,
  BookOpen,
  Plus,
  Trash2,
  Coins,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Share2,
  Lock,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { submitPlayerBatchUpdate } from '@/lib/playerMode/playerClient';
import {
  createPlayerQuest,
  createPlayerJournalEntry,
  toggleQuestShareWithGm,
  toggleAllQuestsShareWithGm,
  toggleJournalShareWithGm,
  type PlayerLocalTrackerState,
} from '@/lib/playerMode/playerTrackerStorage';
import type { CoinPurse, InventoryItem, PlayerQuestStatus } from '@/lib/pc/types';
import { loadStagedEdits, saveStagedEdit } from './PlayerPcSheetCard';
import type { PlayerPc } from './types';
import { PlayerPrivacyPill } from '@/components/ui/VisibilityBadge';
import { GuidedEmptyState } from '@/components/ui/GuidedEmptyState';
import { useEntityPeek } from '@/components/ui/EntityPeekDrawer';

export type PrivacyFilterMode = 'all' | 'shared' | 'private';

export default function PlayerQuestsGearJournalTab({
  pc,
  token,
  slotId,
  campaignId,
  trackerState,
  onUpdateTrackerState,
  revealedEntities,
}: {
  pc?: PlayerPc;
  token: string;
  slotId: string;
  campaignId: string;
  trackerState: PlayerLocalTrackerState;
  onUpdateTrackerState: (next: PlayerLocalTrackerState) => void;
  revealedEntities: Array<{ id: string; name: string; category: string }>;
}) {
  const entityPeek = useEntityPeek();

  // Privacy filter state ("Filter: Shared with GM")
  const [questPrivacyFilter, setQuestPrivacyFilter] = useState<PrivacyFilterMode>('all');
  const [journalPrivacyFilter, setJournalPrivacyFilter] = useState<PrivacyFilterMode>('all');

  // Progressive disclosure expanded maps
  const [expandedQuestIds, setExpandedQuestIds] = useState<Record<string, boolean>>({});
  const [expandedJournalIds, setExpandedJournalIds] = useState<Record<string, boolean>>({});

  // Quest creation form state
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestNotes, setNewQuestNotes] = useState('');
  const [newQuestLinkedEntity, setNewQuestLinkedEntity] = useState('');

  // Journal creation form state
  const [newJournalSession, setNewJournalSession] = useState<number>(
    () => (trackerState.journal[0]?.sessionNumber ?? 0) + 1,
  );
  const [newJournalDate, setNewJournalDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [newJournalTitle, setNewJournalTitle] = useState('');
  const [newJournalContent, setNewJournalContent] = useState('');

  // Inventory, Currency, Attunement, Party Loot state (synced to PC if owned)
  const staged = pc ? loadStagedEdits(campaignId, pc.id) : {};
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const s = staged['inventory']?.value;
    return Array.isArray(s) ? s : (pc?.inventory ?? []);
  });
  const [currency, setCurrency] = useState<CoinPurse>(() => {
    const s = staged['currency']?.value;
    return s ?? pc?.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  });
  const [attunedCount, setAttunedCount] = useState<number>(() => {
    const s = staged['attunedCount']?.value;
    if (typeof s === 'number') return s;
    if (typeof pc?.attunedCount === 'number') return pc.attunedCount;
    return (pc?.inventory ?? []).filter((i) => i.attuned).length;
  });
  const [partyLoot, setPartyLoot] = useState<string>(() => {
    const s = staged['partyLoot']?.value;
    return typeof s === 'string' ? s : (pc?.partyLoot ?? '');
  });

  // New inventory item form
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemWeight, setNewItemWeight] = useState(0);
  const [newItemNotes, setNewItemNotes] = useState('');

  useEffect(() => {
    if (!pc) return;
    const latestStaged = loadStagedEdits(campaignId, pc.id);
    if (!latestStaged['inventory'] && pc.inventory) setInventory(pc.inventory);
    if (!latestStaged['currency'] && pc.currency) setCurrency(pc.currency);
    if (!latestStaged['attunedCount'] && typeof pc.attunedCount === 'number') setAttunedCount(pc.attunedCount);
    if (!latestStaged['partyLoot'] && typeof pc.partyLoot === 'string') setPartyLoot(pc.partyLoot);
  }, [pc, campaignId]);

  const syncGearFields = async (updates: Record<string, unknown>) => {
    if (!pc) return;
    for (const [k, v] of Object.entries(updates)) {
      saveStagedEdit(campaignId, pc.id, k, v);
    }
    try {
      await submitPlayerBatchUpdate({
        campaignId,
        shareToken: token,
        slotId,
        pcId: pc.id,
        updates,
      });
    } catch (e) {
      console.error('Failed to sync gear update:', e);
    }
  };

  // --- Quests Handlers ---
  const handleAddQuest = () => {
    if (!newQuestTitle.trim()) return;
    const quest = createPlayerQuest({
      title: newQuestTitle.trim(),
      notes: newQuestNotes.trim(),
      linkedEntityIds: newQuestLinkedEntity ? [newQuestLinkedEntity] : [],
      sharedWithGm: false, // Strictly private by default
    });
    onUpdateTrackerState({
      ...trackerState,
      quests: [quest, ...trackerState.quests],
    });
    setExpandedQuestIds((prev) => ({ ...prev, [quest.id]: true }));
    setNewQuestTitle('');
    setNewQuestNotes('');
    setNewQuestLinkedEntity('');
  };

  const handleUpdateQuestStatus = (questId: string, status: PlayerQuestStatus) => {
    onUpdateTrackerState({
      ...trackerState,
      quests: trackerState.quests.map((q) =>
        q.id === questId ? { ...q, status, updatedAt: Date.now() } : q,
      ),
    });
  };

  const handleUpdateQuestNotes = (questId: string, notes: string) => {
    onUpdateTrackerState({
      ...trackerState,
      quests: trackerState.quests.map((q) =>
        q.id === questId ? { ...q, notes, updatedAt: Date.now() } : q,
      ),
    });
  };

  const handleDeleteQuest = (questId: string) => {
    const existing = trackerState.quests.find((q) => q.id === questId);
    const prevTombstones = trackerState.tombstones ?? trackerState.pendingTombstones ?? [];
    const nextTombstones = existing?.sharedWithGm
      ? [...prevTombstones, { id: questId, kind: 'quest' as const, removedAtMs: Date.now() }]
      : prevTombstones;
    onUpdateTrackerState({
      ...trackerState,
      quests: trackerState.quests.filter((q) => q.id !== questId),
      tombstones: nextTombstones,
      pendingTombstones: nextTombstones,
    });
  };

  const allQuestsShared =
    trackerState.quests.length > 0 && trackerState.quests.every((q) => q.sharedWithGm);

  const handleBatchToggleQuests = () => {
    onUpdateTrackerState(toggleAllQuestsShareWithGm(trackerState, !allQuestsShared));
  };

  // --- Inventory & Gear Handlers ---
  const handleAddInventoryItem = () => {
    if (!newItemName.trim()) return;
    const item: InventoryItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newItemName.trim(),
      qty: Math.max(1, newItemQty),
      weight: Math.max(0, newItemWeight),
      equipped: false,
      attuned: false,
      notes: newItemNotes.trim(),
      sharedWithGm: true,
    };
    const next = [...inventory, item];
    setInventory(next);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemWeight(0);
    setNewItemNotes('');
    syncGearFields({ inventory: next });
  };

  const handleToggleEquipped = (idx: number) => {
    const next = inventory.map((item, i) =>
      i === idx ? { ...item, equipped: !item.equipped } : item,
    );
    setInventory(next);
    syncGearFields({ inventory: next });
  };

  const handleToggleAttuned = (idx: number) => {
    const item = inventory[idx];
    if (!item) return;
    const currentAttunedItems = inventory.filter((i) => i.attuned).length;
    if (!item.attuned && currentAttunedItems >= 3) return;
    const next = inventory.map((it, i) =>
      i === idx ? { ...it, attuned: !it.attuned } : it,
    );
    const nextCount = Math.min(3, next.filter((i) => i.attuned).length);
    setInventory(next);
    setAttunedCount(nextCount);
    syncGearFields({ inventory: next, attunedCount: nextCount });
  };

  const handleUpdateItemQty = (idx: number, delta: number) => {
    const next = inventory.map((it, i) =>
      i === idx ? { ...it, qty: Math.max(0, (it.qty ?? 1) + delta) } : it,
    );
    setInventory(next);
    syncGearFields({ inventory: next });
  };

  const handleRemoveInventoryItem = (idx: number) => {
    const next = inventory.filter((_, i) => i !== idx);
    const nextCount = Math.min(3, next.filter((i) => i.attuned).length);
    setInventory(next);
    setAttunedCount(nextCount);
    syncGearFields({ inventory: next, attunedCount: nextCount });
  };

  const handleCurrencyChange = (coin: keyof CoinPurse, val: number) => {
    const next = { ...currency, [coin]: Math.max(0, val) };
    setCurrency(next);
    syncGearFields({ currency: next });
  };

  // --- Journal Handlers ---
  const handleAddJournalEntry = () => {
    if (!newJournalTitle.trim() && !newJournalContent.trim()) return;
    const entry = createPlayerJournalEntry({
      sessionNumber: Math.max(1, newJournalSession),
      date: newJournalDate || new Date().toISOString().slice(0, 10),
      title: newJournalTitle.trim() || `Session ${newJournalSession} Notes`,
      content: newJournalContent.trim(),
      sharedWithGm: false, // Strictly private by default
    });
    onUpdateTrackerState({
      ...trackerState,
      journal: [entry, ...trackerState.journal],
    });
    setExpandedJournalIds((prev) => ({ ...prev, [entry.id]: true }));
    setNewJournalSession((s) => s + 1);
    setNewJournalTitle('');
    setNewJournalContent('');
  };

  const handleUpdateJournalContent = (entryId: string, content: string) => {
    onUpdateTrackerState({
      ...trackerState,
      journal: trackerState.journal.map((j) =>
        j.id === entryId ? { ...j, content, updatedAt: Date.now() } : j,
      ),
    });
  };

  const handleDeleteJournalEntry = (entryId: string) => {
    const existing = trackerState.journal.find((j) => j.id === entryId);
    const prevTombstones = trackerState.tombstones ?? trackerState.pendingTombstones ?? [];
    const nextTombstones = existing?.sharedWithGm
      ? [...prevTombstones, { id: entryId, kind: 'journal' as const, removedAtMs: Date.now() }]
      : prevTombstones;
    onUpdateTrackerState({
      ...trackerState,
      journal: trackerState.journal.filter((j) => j.id !== entryId),
      tombstones: nextTombstones,
      pendingTombstones: nextTombstones,
    });
  };

  const totalWeight = inventory.reduce((sum, i) => sum + (i.weight ?? 0) * (i.qty ?? 1), 0);

  const filteredQuests = trackerState.quests.filter((q) => {
    if (questPrivacyFilter === 'shared') return q.sharedWithGm === true;
    if (questPrivacyFilter === 'private') return !q.sharedWithGm;
    return true;
  });

  const filteredJournal = trackerState.journal.filter((j) => {
    if (journalPrivacyFilter === 'shared') return j.sharedWithGm === true;
    if (journalPrivacyFilter === 'private') return !j.sharedWithGm;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Privacy Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-muted)] shadow-sm">
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-violet-400" />
          <span className="font-sans">
            <strong className="text-[var(--text-primary)]">Player Privacy Guarantee:</strong> Personal quests, entity notes, and journal entries are{' '}
            <span className="font-semibold text-[var(--text-primary)]">🔒 Private (Local Only)</span> by default. Only items you explicitly toggle to{' '}
            <span className="font-semibold text-emerald-500 dark:text-emerald-300">👁️ Shared with GM</span> are synced via <code className="font-mono">pcWritebacks</code>.
          </span>
        </div>
      </div>

      {/* SECTION 1: Personal Quest & Rumor Tracker */}
      <section className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={18} className="text-[var(--accent-primary)]" />
            <div>
              <h3 className="font-display text-lg font-semibold tracking-wide text-[var(--text-primary)]">
                My Quests &amp; Rumors
              </h3>
              <p className="font-sans text-xs text-[var(--text-muted)]">
                Track active quests, personal goals, and rumors. Private to your device unless shared.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter: Shared with GM quick filter pills */}
            <div
              role="group"
              aria-label="Filter quests by privacy"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5"
            >
              <Filter size={11} className="ml-2 text-[var(--text-muted)]" />
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'shared', label: 'Filter: Shared with GM' },
                  { id: 'private', label: '🔒 Private Only' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setQuestPrivacyFilter(f.id)}
                  className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium transition-colors ${
                    questPrivacyFilter === f.id
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {trackerState.quests.length > 0 && (
              <button
                type="button"
                onClick={handleBatchToggleQuests}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-[11px] font-medium transition-colors ${
                  allQuestsShared
                    ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 dark:text-emerald-300'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Share2 size={11} />
                {allQuestsShared ? '👁️ All Quests Shared' : 'Share All with GM'}
              </button>
            )}
          </div>
        </div>

        {/* Add Quest Form */}
        <div className="grid gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3 sm:grid-cols-12">
          <input
            type="text"
            value={newQuestTitle}
            onChange={(e) => setNewQuestTitle(e.target.value)}
            placeholder="New quest, rumor, or personal objective..."
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] sm:col-span-5"
          />
          <input
            type="text"
            value={newQuestNotes}
            onChange={(e) => setNewQuestNotes(e.target.value)}
            placeholder="Clues, rewards, or leads..."
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] sm:col-span-4"
          />
          <select
            value={newQuestLinkedEntity}
            onChange={(e) => setNewQuestLinkedEntity(e.target.value)}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 font-sans text-xs text-[var(--text-primary)] sm:col-span-2"
          >
            <option value="">Link Entity (Optional)</option>
            {revealedEntities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name} ({ent.category})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddQuest}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-[var(--accent-primary)] px-3 py-1.5 font-sans text-xs font-semibold text-white hover:opacity-90 sm:col-span-1"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {/* Quest List (Progressive Disclosure Cards) */}
        {filteredQuests.length === 0 ? (
          <GuidedEmptyState
            icon={<CheckSquare size={18} />}
            title={
              questPrivacyFilter === 'shared'
                ? 'No Quests Shared with GM Yet'
                : 'No Quests or Rumors Recorded Yet'
            }
            description={
              questPrivacyFilter === 'shared'
                ? 'Toggle any quest pill from 🔒 Private (Local Only) to 👁️ Shared with GM to sync it with your GM.'
                : 'Add your first quest, character goal, or tavern rumor above — it stays 100% local unless shared.'
            }
            actions={
              questPrivacyFilter !== 'all'
                ? [{ label: 'Show All Quests', onClick: () => setQuestPrivacyFilter('all') }]
                : []
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredQuests.map((q) => {
              const isExpanded = Boolean(expandedQuestIds[q.id]);
              return (
                <div
                  key={q.id}
                  className={`rounded-lg border border-l-2 border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3 transition-all ${
                    q.sharedWithGm ? 'border-l-emerald-500' : 'border-l-violet-500/60'
                  }`}
                >
                  {/* Collapsed Row: Cormorant Garamond Title, 1-line summary, max 2 badges (Status chip + Privacy Pill) */}
                  <div className="flex items-start justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedQuestIds((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span className="mt-1 shrink-0 text-[var(--text-muted)]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4
                          className={`truncate font-display text-base font-semibold tracking-wide ${
                            q.status === 'completed'
                              ? 'line-through text-[var(--text-muted)]'
                              : q.status === 'failed'
                                ? 'line-through text-rose-400/80'
                                : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {q.title}
                        </h4>
                        <p className="mt-0.5 line-clamp-1 font-sans text-xs text-[var(--text-muted)]">
                          {q.notes || 'Click to expand quest clues, status & linked entities'}
                        </p>
                      </div>
                    </button>

                    {/* Strictly max 2 badges visible in collapsed state: 1) Status chip, 2) Privacy Pill */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-sans text-[11px] font-medium capitalize text-[var(--text-muted)]">
                        {q.status}
                      </span>
                      <PlayerPrivacyPill
                        sharedWithGm={q.sharedWithGm}
                        onToggle={(next) =>
                          onUpdateTrackerState(toggleQuestShareWithGm(trackerState, q.id, next))
                        }
                        compact
                      />
                    </div>
                  </div>

                  {/* Expandable Accordion Body */}
                  <div className={`gm-collapse ${isExpanded ? 'gm-collapse-open' : ''}`}>
                    <div className="gm-collapse-content">
                      <div className="mt-3 space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(['active', 'completed', 'failed'] as PlayerQuestStatus[]).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleUpdateQuestStatus(q.id, st)}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-sans text-[11px] font-medium capitalize ${
                                  q.status === st
                                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 text-[var(--text-primary)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                                }`}
                              >
                                {st === 'active' && <Clock size={10} />}
                                {st === 'completed' && <CheckCircle2 size={10} />}
                                {st === 'failed' && <XCircle size={10} />}
                                {st}
                              </button>
                            ))}

                            {q.linkedEntityIds.map((eid) => {
                              const ent = revealedEntities.find((e) => e.id === eid);
                              return (
                                <button
                                  key={eid}
                                  type="button"
                                  onClick={() =>
                                    entityPeek?.openPeek(
                                      (ent?.category === 'locations'
                                        ? 'location'
                                        : ent?.category === 'factions'
                                          ? 'faction'
                                          : 'npc') as any,
                                      eid,
                                      ent?.name,
                                    )
                                  }
                                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent-primary)] hover:underline"
                                >
                                  @{ent?.name ?? eid}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteQuest(q.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-sans text-xs text-rose-400 hover:bg-rose-500/10"
                            title="Delete quest"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </div>

                        <textarea
                          value={q.notes}
                          onChange={(e) => handleUpdateQuestNotes(q.id, e.target.value)}
                          rows={2}
                          placeholder="Add quest notes, clues, or steps..."
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: Inventory, Currency, 3-Slot Attunement & Party Loot */}
      <section className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Backpack size={18} className="text-amber-500" />
            <div>
              <h3 className="font-display text-lg font-semibold tracking-wide text-[var(--text-primary)]">
                Inventory, Attunement &amp; Coin Purse
              </h3>
              <p className="font-sans text-xs text-[var(--text-muted)]">
                Total Carried Weight: <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">{totalWeight} lb.</span>
              </p>
            </div>
          </div>

          {/* 3-Slot Attunement Pips */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5">
            <Sparkles size={13} className="text-amber-500" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider tabular-nums text-[var(--text-muted)]">
              Attunement ({attunedCount}/3):
            </span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((slotNum) => {
                const active = attunedCount >= slotNum;
                return (
                  <button
                    key={slotNum}
                    type="button"
                    onClick={() => {
                      const next = attunedCount === slotNum ? slotNum - 1 : slotNum;
                      setAttunedCount(next);
                      syncGearFields({ attunedCount: next });
                    }}
                    className={`size-4 rounded-full border transition-all ${
                      active ? 'border-amber-500 bg-amber-500 shadow-sm' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                    }`}
                    title={`Attunement Slot ${slotNum}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Coin Purse (cp, sp, ep, gp, pp) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Coins size={12} className="text-amber-500" /> Coin Purse
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(['cp', 'sp', 'ep', 'gp', 'pp'] as Array<keyof CoinPurse>).map((coin) => (
              <div
                key={coin}
                className="flex flex-col items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2"
              >
                <span className="font-mono text-[10px] font-bold uppercase text-[var(--text-muted)]">{coin}</span>
                <input
                  type="number"
                  min={0}
                  value={currency[coin] ?? 0}
                  onChange={(e) => handleCurrencyChange(coin, parseInt(e.target.value, 10) || 0)}
                  aria-label={`${coin.toUpperCase()} Coins`}
                  className="mt-1 w-full border-b border-[var(--border-subtle)] bg-transparent text-center font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Equipment List */}
        <div className="space-y-2">
          <div className="grid gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-2.5 sm:grid-cols-12">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name (e.g. Cloak of Protection)..."
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-sans text-xs text-[var(--text-primary)] sm:col-span-5"
            />
            <input
              type="number"
              min={1}
              value={newItemQty}
              onChange={(e) => setNewItemQty(parseInt(e.target.value, 10) || 1)}
              placeholder="Qty"
              title="Quantity"
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--text-primary)] sm:col-span-2"
            />
            <input
              type="number"
              min={0}
              step={0.5}
              value={newItemWeight}
              onChange={(e) => setNewItemWeight(parseFloat(e.target.value) || 0)}
              placeholder="Weight (lb)"
              title="Weight in lbs"
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--text-primary)] sm:col-span-2"
            />
            <input
              type="text"
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              placeholder="Notes (+1 AC)..."
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-sans text-xs text-[var(--text-primary)] sm:col-span-2"
            />
            <button
              type="button"
              onClick={handleAddInventoryItem}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-[var(--accent-primary)] px-2 py-1 font-sans text-xs font-semibold text-white hover:opacity-90 sm:col-span-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {inventory.length === 0 ? (
            <p className="py-2 text-center font-sans text-xs text-[var(--text-muted)]">
              No personal equipment listed yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {inventory.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold text-[var(--text-primary)]">{item.name}</span>
                    {item.weight ? (
                      <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">{item.weight} lb</span>
                    ) : null}
                    {item.notes ? (
                      <span className="font-sans text-xs text-[var(--text-muted)]">— {item.notes}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateItemQty(idx, -1)}
                        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold tabular-nums">×{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateItemQty(idx, 1)}
                        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleEquipped(idx)}
                      className={`rounded-full border px-2 py-0.5 font-sans text-[10px] font-medium ${
                        item.equipped
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                      }`}
                    >
                      {item.equipped ? 'Equipped' : 'Unequipped'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAttuned(idx)}
                      className={`rounded-full border px-2 py-0.5 font-sans text-[10px] font-medium ${
                        item.attuned
                          ? 'border-amber-500/60 bg-amber-500/15 text-amber-500'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                      }`}
                    >
                      {item.attuned ? '✦ Attuned' : 'Attune'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveInventoryItem(idx)}
                      className="text-[var(--text-muted)] hover:text-rose-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Party Loot / Unclaimed Scratchpad */}
        <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Party Loot / Unclaimed Scratchpad
          </label>
          <textarea
            value={partyLoot}
            onChange={(e) => setPartyLoot(e.target.value)}
            onBlur={() => syncGearFields({ partyLoot })}
            rows={2}
            placeholder="Unclaimed treasure, art objects, bag of holding contents, party fund..."
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </section>

      {/* SECTION 3: Player Session Journal */}
      <section className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-[var(--accent-primary)]" />
            <div>
              <h3 className="font-display text-lg font-semibold tracking-wide text-[var(--text-primary)]">
                Player Session Journal
              </h3>
              <p className="font-sans text-xs text-[var(--text-muted)]">
                Write personal session recaps and diary entries. Each entry defaults to 🔒 Private (Local Only).
              </p>
            </div>
          </div>

          {/* Filter: Shared with GM quick filter pills for Journal */}
          <div
            role="group"
            aria-label="Filter journal entries by privacy"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5"
          >
            <Filter size={11} className="ml-2 text-[var(--text-muted)]" />
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'shared', label: 'Filter: Shared with GM' },
                { id: 'private', label: '🔒 Private Only' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setJournalPrivacyFilter(f.id)}
                className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium transition-colors ${
                  journalPrivacyFilter === f.id
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* New Journal Entry Form */}
        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3">
          <div className="grid gap-2 sm:grid-cols-12">
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">Session #</span>
              <input
                type="number"
                min={1}
                value={newJournalSession}
                onChange={(e) => setNewJournalSession(parseInt(e.target.value, 10) || 1)}
                className="w-14 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--text-primary)]"
              />
            </div>
            <input
              type="date"
              value={newJournalDate}
              onChange={(e) => setNewJournalDate(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-xs tabular-nums text-[var(--text-primary)] sm:col-span-3"
            />
            <input
              type="text"
              value={newJournalTitle}
              onChange={(e) => setNewJournalTitle(e.target.value)}
              placeholder="Entry Title (e.g. Into the Sunken Citadel)..."
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-sans text-xs text-[var(--text-primary)] sm:col-span-5"
            />
            <button
              type="button"
              onClick={handleAddJournalEntry}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-[var(--accent-primary)] px-3 py-1 font-sans text-xs font-semibold text-white hover:opacity-90 sm:col-span-2"
            >
              <Plus size={13} /> Add Entry
            </button>
          </div>
          <textarea
            value={newJournalContent}
            onChange={(e) => setNewJournalContent(e.target.value)}
            rows={3}
            placeholder="Write your character's perspective, reflections, or session recap..."
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        {/* Journal Entries List (Progressive Disclosure Cards) */}
        {filteredJournal.length === 0 ? (
          <GuidedEmptyState
            icon={<BookOpen size={18} />}
            title={
              journalPrivacyFilter === 'shared'
                ? 'No Journal Entries Shared with GM'
                : 'No Personal Journal Entries Yet'
            }
            description={
              journalPrivacyFilter === 'shared'
                ? 'Toggle any journal entry to 👁️ Shared with GM to share your character diary with the GM.'
                : 'Write your first session recap above — entries remain 🔒 Private (Local Only) unless shared.'
            }
            actions={
              journalPrivacyFilter !== 'all'
                ? [{ label: 'Show All Entries', onClick: () => setJournalPrivacyFilter('all') }]
                : []
            }
          />
        ) : (
          <div className="space-y-2.5">
            {filteredJournal.map((entry) => {
              const isExpanded = Boolean(expandedJournalIds[entry.id]);
              return (
                <div
                  key={entry.id}
                  className={`rounded-lg border border-l-2 border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3 transition-all ${
                    entry.sharedWithGm ? 'border-l-emerald-500' : 'border-l-violet-500/60'
                  }`}
                >
                  {/* Collapsed Row: Cormorant Garamond Title, 1-line summary, max 2 badges (Session chip + Privacy Pill) */}
                  <div className="flex items-start justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedJournalIds((prev) => ({
                          ...prev,
                          [entry.id]: !prev[entry.id],
                        }))
                      }
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span className="mt-1 shrink-0 text-[var(--text-muted)]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-display text-base font-semibold tracking-wide text-[var(--text-primary)]">
                          {entry.title}
                        </h4>
                        <p className="mt-0.5 line-clamp-1 font-sans text-xs text-[var(--text-muted)]">
                          {entry.content || 'Click to expand & edit session journal entry'}
                        </p>
                      </div>
                    </button>

                    {/* Strictly max 2 badges: 1) Session # chip, 2) Privacy Pill */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
                        S{entry.sessionNumber} · {entry.date}
                      </span>
                      <PlayerPrivacyPill
                        sharedWithGm={entry.sharedWithGm}
                        onToggle={(next) =>
                          onUpdateTrackerState(toggleJournalShareWithGm(trackerState, entry.id, next))
                        }
                        compact
                      />
                    </div>
                  </div>

                  {/* Expandable Accordion Body */}
                  <div className={`gm-collapse ${isExpanded ? 'gm-collapse-open' : ''}`}>
                    <div className="gm-collapse-content">
                      <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
                        <textarea
                          value={entry.content}
                          onChange={(e) => handleUpdateJournalContent(entry.id, e.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-sans text-xs leading-relaxed text-[var(--text-primary)]"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteJournalEntry(entry.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-sans text-xs text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 size={12} />
                            <span>Delete Entry</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

