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
import type { CoinPurse, InventoryItem, PartyLootItem, PlayerQuestStatus } from '@/lib/pc/types';
import { splitPartyLootGold } from '@/lib/crdt/writeback-merge';
import { loadStagedEdits, saveStagedEdit } from './PlayerPcSheetCard';
import type { PlayerPc } from './types';

export default function PlayerQuestsGearJournalTab({
  pc,
  partyPcs = [],
  projectedPartyLootItems = [],
  token,
  slotId,
  campaignId,
  trackerState,
  onUpdateTrackerState,
  revealedEntities,
}: {
  pc?: PlayerPc;
  partyPcs?: PlayerPc[];
  projectedPartyLootItems?: PartyLootItem[];
  token: string;
  slotId: string;
  campaignId: string;
  trackerState: PlayerLocalTrackerState;
  onUpdateTrackerState: (next: PlayerLocalTrackerState) => void;
  revealedEntities: Array<{ id: string; name: string; category: string }>;
}) {
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
  const [partyLootItems, setPartyLootItems] = useState<PartyLootItem[]>(() => {
    const s = staged['partyLootItems']?.value;
    if (Array.isArray(s)) return s;
    if (projectedPartyLootItems.length > 0) return projectedPartyLootItems;
    return pc?.partyLootItems ?? [];
  });

  // New Party Loot drop form
  const [newLootName, setNewLootName] = useState('');
  const [newLootQty, setNewLootQty] = useState(1);
  const [newLootGp, setNewLootGp] = useState(0);
  const [newLootSp, setNewLootSp] = useState(0);
  const [newLootNotes, setNewLootNotes] = useState('');
  const [lootFeedback, setLootFeedback] = useState<string | null>(null);

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
    if (!latestStaged['partyLootItems']) {
      if (projectedPartyLootItems.length > 0) {
        setPartyLootItems(projectedPartyLootItems);
      } else if (pc.partyLootItems) {
        setPartyLootItems(pc.partyLootItems);
      }
    }
  }, [pc, projectedPartyLootItems, campaignId]);

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

  // --- Structured Claimable Party Loot & Gold Splitter Handlers ---
  const handlePostLootDrop = () => {
    if (!newLootName.trim() && newLootGp <= 0 && newLootSp <= 0) return;
    const drop: PartyLootItem = {
      id: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newLootName.trim() || `Treasure Chest (${newLootGp} gp)`,
      qty: Math.max(1, newLootQty),
      weight: 0,
      notes: newLootNotes.trim(),
      currency:
        newLootGp > 0 || newLootSp > 0
          ? { cp: 0, sp: Math.max(0, newLootSp), ep: 0, gp: Math.max(0, newLootGp), pp: 0 }
          : undefined,
      createdAt: Date.now(),
    };
    const next = [drop, ...partyLootItems];
    setPartyLootItems(next);
    setNewLootName('');
    setNewLootQty(1);
    setNewLootGp(0);
    setNewLootSp(0);
    setNewLootNotes('');
    void syncGearFields({ partyLootItems: next });
  };

  const handleClaimPartyLoot = (lootId: string) => {
    if (!pc) return;
    const target = partyLootItems.find((item) => item.id === lootId);
    if (!target || target.claimedByPcId) return;

    const nonce = `claim_${pc.id}_${Date.now()}`;
    const claimedItem: PartyLootItem = {
      ...target,
      claimedByPcId: pc.id,
      claimedByName: pc.name || 'Party Member',
      claimNonce: nonce,
      claimedAt: Date.now(),
    };

    const nextLoot = partyLootItems.map((it) => (it.id === lootId ? claimedItem : it));
    const newInvItem: InventoryItem = {
      id: `claimed_${target.id}`,
      name: target.name,
      qty: target.qty || 1,
      weight: target.weight || 0,
      equipped: false,
      attuned: false,
      notes: target.notes || 'Claimed from Party Loot',
      sharedWithGm: true,
    };
    const nextInv = [...inventory, newInvItem];
    const nextCurr = { ...currency };
    if (target.currency) {
      nextCurr.cp = (nextCurr.cp || 0) + (target.currency.cp || 0);
      nextCurr.sp = (nextCurr.sp || 0) + (target.currency.sp || 0);
      nextCurr.ep = (nextCurr.ep || 0) + (target.currency.ep || 0);
      nextCurr.gp = (nextCurr.gp || 0) + (target.currency.gp || 0);
      nextCurr.pp = (nextCurr.pp || 0) + (target.currency.pp || 0);
    }

    setPartyLootItems(nextLoot);
    setInventory(nextInv);
    setCurrency(nextCurr);
    void syncGearFields({
      partyLootItems: nextLoot,
      inventory: nextInv,
      currency: nextCurr,
    });
    setLootFeedback(`Claimed "${target.name}" into your inventory!`);
    setTimeout(() => setLootFeedback(null), 3500);
  };

  const handleSplitPartyGold = (lootId: string) => {
    if (!pc) return;
    const target = partyLootItems.find((item) => item.id === lootId);
    if (!target || !target.currency) return;

    const partyCount = Math.max(1, partyPcs.length || 1);
    const split = splitPartyLootGold(target.currency, partyCount);

    const nextCurr: CoinPurse = {
      cp: (currency.cp || 0) + split.perMemberShare.cp,
      sp: (currency.sp || 0) + split.perMemberShare.sp,
      ep: (currency.ep || 0) + split.perMemberShare.ep,
      gp: (currency.gp || 0) + split.perMemberShare.gp,
      pp: (currency.pp || 0) + split.perMemberShare.pp,
    };

    const hasRemainder =
      split.remainder.cp > 0 ||
      split.remainder.sp > 0 ||
      split.remainder.ep > 0 ||
      split.remainder.gp > 0 ||
      split.remainder.pp > 0;

    const nextLoot = partyLootItems.map((it) =>
      it.id === lootId
        ? {
            ...it,
            currency: split.remainder,
            claimedByPcId: hasRemainder ? undefined : pc.id,
            claimedByName: hasRemainder
              ? `Split across ${partyCount} PCs (remainder in pool)`
              : `Split evenly (${partyCount} PCs)`,
            claimNonce: `split_${pc.id}_${Date.now()}`,
            claimedAt: Date.now(),
          }
        : it,
    );

    setPartyLootItems(nextLoot);
    setCurrency(nextCurr);
    void syncGearFields({
      partyLootItems: nextLoot,
      currency: nextCurr,
    });
    setLootFeedback(
      `Split gold across ${partyCount} party members (+${split.perMemberShare.gp} gp, +${split.perMemberShare.sp} sp each; remainder ${split.remainder.gp} gp tracked).`,
    );
    setTimeout(() => setLootFeedback(null), 4000);
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
    if (!item.attuned && currentAttunedItems >= 3) return; // Max 3 attunement slots
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

  return (
    <div className="space-y-6">
      {/* Privacy Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-parchment px-4 py-2.5 text-xs text-ink-soft shadow-sm">
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-wax" />
          <span className="font-serif">
            <strong>Player Privacy Guarantee:</strong> Personal quests, entity notes, and journal entries are{' '}
            <span className="font-semibold text-ink">🔒 100% local &amp; private by default</span>. Only items you explicitly toggle to{' '}
            <span className="font-semibold text-gold-deep">👁️ Share with GM</span> are sent to the GM.
          </span>
        </div>
      </div>

      {/* SECTION 1: Personal Quest & Rumor Tracker */}
      <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={18} className="text-wax" />
            <div>
              <h3 className="font-display text-lg tracking-wide text-ink">My Quests &amp; Rumors</h3>
              <p className="font-serif text-xs text-ink-faint">
                Track active quests, personal goals, and rumors. Private to your device unless shared.
              </p>
            </div>
          </div>

          {trackerState.quests.length > 0 && (
            <button
              type="button"
              onClick={handleBatchToggleQuests}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                allQuestsShared
                  ? 'border-gold/60 bg-gold/15 text-gold-deep hover:bg-gold/25'
                  : 'border-rule bg-surface text-ink-soft hover:border-gold/50 hover:text-ink'
              }`}
            >
              <Share2 size={11} />
              {allQuestsShared ? '👁️ All Quests Shared (Click to Make Private)' : 'Share All Quests with GM'}
            </button>
          )}
        </div>

        {/* Add Quest Form */}
        <div className="grid gap-2 rounded border border-rule bg-parchment-soft p-3 sm:grid-cols-12">
          <input
            type="text"
            value={newQuestTitle}
            onChange={(e) => setNewQuestTitle(e.target.value)}
            placeholder="New quest, rumor, or personal objective..."
            className="rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none sm:col-span-5"
          />
          <input
            type="text"
            value={newQuestNotes}
            onChange={(e) => setNewQuestNotes(e.target.value)}
            placeholder="Clues, rewards, or leads..."
            className="rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none sm:col-span-4"
          />
          <select
            value={newQuestLinkedEntity}
            onChange={(e) => setNewQuestLinkedEntity(e.target.value)}
            className="rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-xs text-ink sm:col-span-2"
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
            className="inline-flex items-center justify-center gap-1 rounded border border-wax bg-wax px-3 py-1.5 font-mono text-xs font-semibold text-ivory hover:bg-wax/90 sm:col-span-1"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {/* Quest List */}
        {trackerState.quests.length === 0 ? (
          <p className="py-3 text-center font-serif text-xs italic text-ink-faint">
            No quests or rumors recorded yet. Add one above—it stays 100% private until you toggle &ldquo;Share with GM&rdquo;.
          </p>
        ) : (
          <div className="space-y-2">
            {trackerState.quests.map((q) => (
              <div
                key={q.id}
                className="space-y-2 rounded border border-rule bg-parchment-soft p-3 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-display text-sm font-semibold ${
                        q.status === 'completed'
                          ? 'line-through text-ink-faint'
                          : q.status === 'failed'
                            ? 'line-through text-wax/70'
                            : 'text-ink'
                      }`}
                    >
                      {q.title}
                    </span>
                    {q.linkedEntityIds.map((eid) => {
                      const ent = revealedEntities.find((e) => e.id === eid);
                      return (
                        <span
                          key={eid}
                          className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[9px] text-ink-soft"
                        >
                          @{ent?.name ?? eid}
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Status selector */}
                    {(['active', 'completed', 'failed'] as PlayerQuestStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleUpdateQuestStatus(q.id, st)}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                          q.status === st
                            ? st === 'completed'
                              ? 'border-forest/50 bg-forest/15 text-forest font-bold'
                              : st === 'failed'
                                ? 'border-wax/50 bg-wax/15 text-wax font-bold'
                                : 'border-gold/50 bg-gold/15 text-gold-deep font-bold'
                            : 'border-rule bg-parchment text-ink-faint hover:text-ink'
                        }`}
                      >
                        {st === 'active' && <Clock size={10} />}
                        {st === 'completed' && <CheckCircle2 size={10} />}
                        {st === 'failed' && <XCircle size={10} />}
                        {st}
                      </button>
                    ))}

                    {/* 1-tap Private / Share with GM Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTrackerState(toggleQuestShareWithGm(trackerState, q.id, !q.sharedWithGm))
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                        q.sharedWithGm
                          ? 'border-gold/60 bg-gold/15 text-gold-deep hover:bg-gold/25'
                          : 'border-rule bg-parchment text-ink-soft hover:border-ink-faint hover:text-ink'
                      }`}
                    >
                      {q.sharedWithGm ? '👁️ Share with GM' : '🔒 Private'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteQuest(q.id)}
                      className="rounded p-1 text-ink-faint hover:text-crimson"
                      title="Delete quest"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <textarea
                  value={q.notes}
                  onChange={(e) => handleUpdateQuestNotes(q.id, e.target.value)}
                  rows={2}
                  placeholder="Add quest notes, clues, or steps..."
                  className="w-full rounded border border-rule/70 bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: Inventory, Currency, 3-Slot Attunement & Party Loot */}
      <section className="space-y-4 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <div className="flex items-center gap-2">
            <Backpack size={18} className="text-gold-deep" />
            <div>
              <h3 className="font-display text-lg tracking-wide text-ink">
                Inventory, Attunement &amp; Coin Purse
              </h3>
              <p className="font-serif text-xs text-ink-faint">
                Total Carried Weight: <span className="font-mono font-semibold text-ink">{totalWeight} lb.</span>
              </p>
            </div>
          </div>

          {/* 3-Slot Attunement Pips */}
          <div className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-3 py-1.5">
            <Sparkles size={13} className="text-gold-deep" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
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
                      active ? 'border-gold-deep bg-gold shadow-sm' : 'border-rule bg-parchment'
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
          <div className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            <Coins size={12} className="text-gold-deep" /> Coin Purse
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(['cp', 'sp', 'ep', 'gp', 'pp'] as Array<keyof CoinPurse>).map((coin) => (
              <div
                key={coin}
                className="flex flex-col items-center rounded border border-rule bg-parchment-soft p-2"
              >
                <span className="font-mono text-[10px] font-bold uppercase text-brass-deep">{coin}</span>
                <input
                  type="number"
                  min={0}
                  value={currency[coin] ?? 0}
                  onChange={(e) => handleCurrencyChange(coin, parseInt(e.target.value, 10) || 0)}
                  aria-label={`${coin.toUpperCase()} Coins`}
                  className="mt-1 w-full border-b border-rule bg-transparent text-center font-mono text-sm font-bold text-ink focus:border-wax focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Equipment List */}
        <div className="space-y-2">
          <div className="grid gap-2 rounded border border-rule bg-parchment-soft p-2.5 sm:grid-cols-12">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name (e.g. Cloak of Protection)..."
              className="rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink sm:col-span-5"
            />
            <input
              type="number"
              min={1}
              value={newItemQty}
              onChange={(e) => setNewItemQty(parseInt(e.target.value, 10) || 1)}
              placeholder="Qty"
              title="Quantity"
              className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-2"
            />
            <input
              type="number"
              min={0}
              step={0.5}
              value={newItemWeight}
              onChange={(e) => setNewItemWeight(parseFloat(e.target.value) || 0)}
              placeholder="Weight (lb)"
              title="Weight in lbs"
              className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-2"
            />
            <input
              type="text"
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              placeholder="Notes (+1 AC)..."
              className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink sm:col-span-2"
            />
            <button
              type="button"
              onClick={handleAddInventoryItem}
              className="inline-flex items-center justify-center gap-1 rounded border border-wax bg-wax px-2 py-1 font-mono text-xs font-semibold text-ivory hover:bg-wax/90 sm:col-span-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {inventory.length === 0 ? (
            <p className="py-2 text-center font-serif text-xs italic text-ink-faint">
              No personal equipment listed yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {inventory.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-parchment-soft px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif font-semibold text-ink">{item.name}</span>
                    {item.weight ? (
                      <span className="font-mono text-[10px] text-ink-faint">{item.weight} lb</span>
                    ) : null}
                    {item.notes ? (
                      <span className="font-serif italic text-ink-soft">— {item.notes}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateItemQty(idx, -1)}
                        className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold">×{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateItemQty(idx, 1)}
                        className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleEquipped(idx)}
                      className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase ${
                        item.equipped
                          ? 'border-forest/50 bg-forest/15 text-forest font-bold'
                          : 'border-rule bg-parchment text-ink-faint'
                      }`}
                    >
                      {item.equipped ? 'Equipped' : 'Unequipped'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAttuned(idx)}
                      className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase ${
                        item.attuned
                          ? 'border-gold/60 bg-gold/20 text-gold-deep font-bold'
                          : 'border-rule bg-parchment text-ink-faint'
                      }`}
                    >
                      {item.attuned ? '✦ Attuned' : 'Attune'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveInventoryItem(idx)}
                      className="text-ink-faint hover:text-crimson"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Structured Claimable Party Loot & Gold Splitter */}
        <div className="space-y-2.5 border-t border-rule pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              Party Loot / Unclaimed Drops (1-Tap Claim &amp; Gold Splitter)
            </label>
            <span className="font-mono text-[10px] text-ink-faint">
              Active Party Size: {Math.max(1, partyPcs.length || 1)} PCs
            </span>
          </div>

          {lootFeedback && (
            <div className="rounded border border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 font-serif text-xs text-emerald-900">
              {lootFeedback}
            </div>
          )}

          {/* Post Loot Drop Form */}
          <div className="grid gap-2 rounded border border-rule bg-parchment-soft p-2.5 sm:grid-cols-12">
            <input
              type="text"
              value={newLootName}
              onChange={(e) => setNewLootName(e.target.value)}
              placeholder="Loot drop item or chest name..."
              className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink sm:col-span-4"
            />
            <input
              type="number"
              min={1}
              value={newLootQty}
              onChange={(e) => setNewLootQty(parseInt(e.target.value, 10) || 1)}
              placeholder="Qty"
              title="Quantity"
              className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-1"
            />
            <input
              type="number"
              min={0}
              value={newLootGp}
              onChange={(e) => setNewLootGp(parseInt(e.target.value, 10) || 0)}
              placeholder="GP"
              title="Gold Pieces (GP)"
              className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-2"
            />
            <input
              type="number"
              min={0}
              value={newLootSp}
              onChange={(e) => setNewLootSp(parseInt(e.target.value, 10) || 0)}
              placeholder="SP"
              title="Silver Pieces (SP)"
              className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-2"
            />
            <input
              type="text"
              value={newLootNotes}
              onChange={(e) => setNewLootNotes(e.target.value)}
              placeholder="Notes..."
              className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink sm:col-span-2"
            />
            <button
              type="button"
              onClick={handlePostLootDrop}
              className="inline-flex items-center justify-center gap-1 rounded border border-gold-deep bg-gold/25 px-2 py-1 font-mono text-xs font-semibold text-gold-deep hover:bg-gold/35 sm:col-span-1"
            >
              <Plus size={12} /> Drop
            </button>
          </div>

          {partyLootItems.length > 0 && (
            <div className="space-y-1.5">
              {partyLootItems.map((drop) => {
                const isClaimed = Boolean(drop.claimedByPcId);
                const hasGold =
                  Boolean(drop.currency) &&
                  ((drop.currency?.gp ?? 0) > 0 ||
                    (drop.currency?.sp ?? 0) > 0 ||
                    (drop.currency?.cp ?? 0) > 0 ||
                    (drop.currency?.pp ?? 0) > 0);
                return (
                  <div
                    key={drop.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs ${
                      isClaimed
                        ? 'border-rule/60 bg-parchment-soft/60 text-ink-faint'
                        : 'border-gold-deep/50 bg-gold/10 text-ink'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-serif font-semibold ${isClaimed ? 'line-through' : 'text-ink'}`}>
                        {drop.name} {drop.qty > 1 ? `×${drop.qty}` : ''}
                      </span>
                      {hasGold && (
                        <span className="rounded border border-gold-deep/40 bg-parchment px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold-deep">
                          {[
                            drop.currency?.pp ? `${drop.currency.pp}pp` : null,
                            drop.currency?.gp ? `${drop.currency.gp}gp` : null,
                            drop.currency?.ep ? `${drop.currency.ep}ep` : null,
                            drop.currency?.sp ? `${drop.currency.sp}sp` : null,
                            drop.currency?.cp ? `${drop.currency.cp}cp` : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        </span>
                      )}
                      {drop.notes && <span className="font-serif italic text-ink-soft">— {drop.notes}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isClaimed ? (
                        <span className="rounded bg-parchment px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                          ✓ Claimed by {drop.claimedByName || drop.claimedByPcId}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleClaimPartyLoot(drop.id)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-600 bg-emerald-600 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-emerald-700"
                          >
                            Claim Item
                          </button>
                          {hasGold && (
                            <button
                              type="button"
                              onClick={() => handleSplitPartyGold(drop.id)}
                              className="inline-flex items-center gap-1 rounded border border-gold-deep bg-gold/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-gold-deep hover:bg-gold/40"
                            >
                              <Coins size={11} /> Split Party Gold
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            value={partyLoot}
            onChange={(e) => setPartyLoot(e.target.value)}
            onBlur={() => syncGearFields({ partyLoot })}
            rows={2}
            placeholder="Unclaimed treasure notes, art objects, bag of holding scratchpad..."
            className="w-full rounded border border-rule bg-parchment-soft p-2.5 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none"
          />
        </div>
      </section>

      {/* SECTION 3: Player Session Journal */}
      <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <BookOpen size={18} className="text-wax" />
          <div>
            <h3 className="font-display text-lg tracking-wide text-ink">Player Session Journal</h3>
            <p className="font-serif text-xs text-ink-faint">
              Write personal session recaps and diary entries. Each entry defaults to 🔒 Private.
            </p>
          </div>
        </div>

        {/* New Journal Entry Form */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="grid gap-2 sm:grid-cols-12">
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <span className="font-mono text-[10px] uppercase text-ink-soft">Session #</span>
              <input
                type="number"
                min={1}
                value={newJournalSession}
                onChange={(e) => setNewJournalSession(parseInt(e.target.value, 10) || 1)}
                className="w-14 rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink"
              />
            </div>
            <input
              type="date"
              value={newJournalDate}
              onChange={(e) => setNewJournalDate(e.target.value)}
              className="rounded border border-rule bg-parchment px-2.5 py-1 font-mono text-xs text-ink sm:col-span-3"
            />
            <input
              type="text"
              value={newJournalTitle}
              onChange={(e) => setNewJournalTitle(e.target.value)}
              placeholder="Entry Title (e.g. Into the Sunken Citadel)..."
              className="rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink sm:col-span-5"
            />
            <button
              type="button"
              onClick={handleAddJournalEntry}
              className="inline-flex items-center justify-center gap-1 rounded border border-wax bg-wax px-3 py-1 font-mono text-xs font-semibold text-ivory hover:bg-wax/90 sm:col-span-2"
            >
              <Plus size={13} /> Add Entry
            </button>
          </div>
          <textarea
            value={newJournalContent}
            onChange={(e) => setNewJournalContent(e.target.value)}
            rows={3}
            placeholder="Write your character's perspective, reflections, or session recap..."
            className="w-full rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none"
          />
        </div>

        {/* Journal Entries List */}
        {trackerState.journal.length === 0 ? (
          <p className="py-3 text-center font-serif text-xs italic text-ink-faint">
            No personal journal entries yet.
          </p>
        ) : (
          <div className="space-y-3">
            {trackerState.journal.map((entry) => (
              <div
                key={entry.id}
                className="space-y-2 rounded border border-rule bg-parchment-soft p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-wax">
                      Session {entry.sessionNumber} · {entry.date}
                    </span>
                    <h4 className="font-display text-base text-ink">{entry.title}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTrackerState(
                          toggleJournalShareWithGm(trackerState, entry.id, !entry.sharedWithGm),
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                        entry.sharedWithGm
                          ? 'border-gold/60 bg-gold/15 text-gold-deep hover:bg-gold/25'
                          : 'border-rule bg-parchment text-ink-soft hover:border-ink-faint hover:text-ink'
                      }`}
                    >
                      {entry.sharedWithGm ? '👁️ Share with GM' : '🔒 Private'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteJournalEntry(entry.id)}
                      className="text-ink-faint hover:text-crimson"
                      title="Delete journal entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <textarea
                  value={entry.content}
                  onChange={(e) => handleUpdateJournalContent(entry.id, e.target.value)}
                  rows={3}
                  className="w-full rounded border border-rule/70 bg-parchment px-2.5 py-1.5 font-serif text-xs leading-relaxed text-ink focus:border-wax focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
