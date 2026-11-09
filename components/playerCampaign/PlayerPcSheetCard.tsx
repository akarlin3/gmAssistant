'use client';

// The player's editable PC sheet. Players may edit their allowlisted mechanical
// and roleplay fields (Vitals & Combat Resources, Class & Spell Resources with
// 1-tap Short/Long Rest recovery, Roleplay traits, and Notes); edits are staged
// via submitPlayerUpdate / submitPlayerBatchUpdate and reconciled into the CRDT
// by the GM.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { X, Plus, Heart, Sparkles, Shield, Zap, Footprints, Moon, Sun, Flame, Dice5 } from 'lucide-react';
import { submitPlayerUpdate, submitPlayerBatchUpdate } from '@/lib/playerMode/playerClient';
import type { PactMagicSlots, PcResourcePool, RechargeTiming, SpellSlotGroup } from '@/lib/pc/types';
import {
  ABILITY_KEYS,
  CONDITION_OPTIONS,
  EXHAUSTION_LABELS,
  PC_ROLEPLAY_FIELDS,
} from './constants';
import { prettify } from './fieldRendering';
import type { PcListField, PlayerPc } from './types';

// Staged edits helpers for robust offline-first persistence in localStorage
const getStorageKey = (campaignId: string, pcId: string) => `playerEdits:${campaignId}:${pcId}`;

type StagedEdit = {
  value: any;
  timestamp: number;
};

type StagedEditsMap = Record<string, StagedEdit>;

export function loadStagedEdits(campaignId: string, pcId: string): StagedEditsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getStorageKey(campaignId, pcId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StagedEditsMap;
    const clean: StagedEditsMap = {};
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.timestamp === 'number' && now - v.timestamp < oneHour) {
        clean[k] = v;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveStagedEdit(campaignId: string, pcId: string, field: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadStagedEdits(campaignId, pcId);
    current[field] = { value, timestamp: Date.now() };
    window.localStorage.setItem(getStorageKey(campaignId, pcId), JSON.stringify(current));
  } catch {
    /* localStorage disabled or full */
  }
}

export function clearStagedEdit(campaignId: string, pcId: string, field: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadStagedEdits(campaignId, pcId);
    delete current[field];
    if (Object.keys(current).length === 0) {
      window.localStorage.removeItem(getStorageKey(campaignId, pcId));
    } else {
      window.localStorage.setItem(getStorageKey(campaignId, pcId), JSON.stringify(current));
    }
  } catch {
    /* ignore */
  }
}

export default function PlayerPcSheetCard({
  pc,
  token,
  slotId,
  campaignId,
}: {
  pc: PlayerPc;
  token: string;
  slotId: string;
  campaignId: string;
}) {
  const stagedEdits = useMemo(() => loadStagedEdits(campaignId, pc.id), [campaignId, pc.id]);

  const getInitialValue = <T,>(field: string, pcValue: T): T => {
    const staged = stagedEdits[field];
    if (staged !== undefined) {
      if (JSON.stringify(staged.value) === JSON.stringify(pcValue)) {
        clearStagedEdit(campaignId, pc.id, field);
        return pcValue;
      }
      return staged.value as T;
    }
    return pcValue;
  };

  const [localHp, setLocalHp] = useState<number>(() => getInitialValue('hp.current', pc.hp?.current ?? 10));
  const [localMaxHp, setLocalMaxHp] = useState<number>(() => getInitialValue('hp.max', pc.hp?.max ?? 10));
  const [localTempHp, setLocalTempHp] = useState<number>(() => getInitialValue('hp.temp', pc.hp?.temp ?? 0));
  const [localHitDice, setLocalHitDice] = useState<{ dieSize: 4 | 6 | 8 | 10 | 12; max: number; used: number }>(() =>
    getInitialValue('hitDice', {
      dieSize: pc.hitDice?.dieSize ?? 8,
      max: pc.hitDice?.max ?? (pc.level ?? 1),
      used: pc.hitDice?.used ?? 0,
    }),
  );
  const [localAc, setLocalAc] = useState<number>(() => getInitialValue('ac', pc.ac ?? 10));
  const [localSpeed, setLocalSpeed] = useState<number>(() => getInitialValue('speed', pc.speed ?? 30));
  const [localInitMod, setLocalInitMod] = useState<number>(() => getInitialValue('initiativeMod', pc.initiativeMod ?? 0));
  const [localInspiration, setLocalInspiration] = useState<boolean>(() => getInitialValue('inspiration', Boolean(pc.inspiration)));
  const [localNotes, setLocalNotes] = useState<string>(() => getInitialValue('notes', pc.notes ?? ''));
  const [localExhaustion, setLocalExhaustion] = useState<number>(() => getInitialValue('exhaustion', pc.exhaustion ?? 0));
  const [localDeathSaves, setLocalDeathSaves] = useState<{ successes: number; failures: number }>(() => {
    const successes = getInitialValue('deathSaves.successes', pc.deathSaves?.successes ?? 0);
    const failures = getInitialValue('deathSaves.failures', pc.deathSaves?.failures ?? 0);
    return { successes, failures };
  });
  const [localConditions, setLocalConditions] = useState<string[]>(() => getInitialValue('conditions', pc.conditions ?? []));
  const [localSpellSlots, setLocalSpellSlots] = useState<SpellSlotGroup[]>(() => getInitialValue('spellSlots', pc.spellSlots ?? []));
  const [localPactSlots, setLocalPactSlots] = useState<PactMagicSlots | null>(() => getInitialValue('pactSlots', pc.pactSlots ?? null));
  const [localResourcePools, setLocalResourcePools] = useState<PcResourcePool[]>(() => getInitialValue('resourcePools', pc.resourcePools ?? []));

  // New resource pool inline form state
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolMax, setNewPoolMax] = useState(3);
  const [newPoolRecharge, setNewPoolRecharge] = useState<RechargeTiming>('short');
  const [showAddSlotLevel, setShowAddSlotLevel] = useState(false);
  const [restFeedback, setRestFeedback] = useState<string | null>(null);

  const pendingRef = useRef<Record<string, { value: unknown; sentAt: number }>>({});

  const isPending = (field: string, incoming: unknown): boolean => {
    const p = pendingRef.current[field];
    if (!p) return false;
    if (Date.now() - p.sentAt > 10000) {
      delete pendingRef.current[field];
      return false;
    }
    if (JSON.stringify(p.value) === JSON.stringify(incoming)) {
      delete pendingRef.current[field];
      return false;
    }
    return true;
  };

  const currentHp = pc.hp?.current ?? 0;
  const maxHp = pc.hp?.max ?? 10;
  const tempHp = pc.hp?.temp ?? 0;
  const deathSavesSuccesses = pc.deathSaves?.successes ?? 0;
  const deathSavesFailures = pc.deathSaves?.failures ?? 0;

  useEffect(() => {
    if (!isPending('hp.current', currentHp)) {
      setLocalHp(currentHp);
      clearStagedEdit(campaignId, pc.id, 'hp.current');
    }
  }, [currentHp, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('hp.max', maxHp)) {
      setLocalMaxHp(maxHp);
      clearStagedEdit(campaignId, pc.id, 'hp.max');
    }
  }, [maxHp, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('hp.temp', tempHp)) {
      setLocalTempHp(tempHp);
      clearStagedEdit(campaignId, pc.id, 'hp.temp');
    }
  }, [tempHp, campaignId, pc.id]);

  useEffect(() => {
    const incomingHd = {
      dieSize: pc.hitDice?.dieSize ?? 8,
      max: pc.hitDice?.max ?? (pc.level ?? 1),
      used: pc.hitDice?.used ?? 0,
    };
    if (!isPending('hitDice', incomingHd)) {
      setLocalHitDice(incomingHd);
      clearStagedEdit(campaignId, pc.id, 'hitDice');
    }
  }, [pc.hitDice, pc.level, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('ac', pc.ac ?? 10)) {
      setLocalAc(pc.ac ?? 10);
      clearStagedEdit(campaignId, pc.id, 'ac');
    }
  }, [pc.ac, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('speed', pc.speed ?? 30)) {
      setLocalSpeed(pc.speed ?? 30);
      clearStagedEdit(campaignId, pc.id, 'speed');
    }
  }, [pc.speed, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('initiativeMod', pc.initiativeMod ?? 0)) {
      setLocalInitMod(pc.initiativeMod ?? 0);
      clearStagedEdit(campaignId, pc.id, 'initiativeMod');
    }
  }, [pc.initiativeMod, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('inspiration', Boolean(pc.inspiration))) {
      setLocalInspiration(Boolean(pc.inspiration));
      clearStagedEdit(campaignId, pc.id, 'inspiration');
    }
  }, [pc.inspiration, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('notes', pc.notes ?? '')) {
      setLocalNotes(pc.notes ?? '');
      clearStagedEdit(campaignId, pc.id, 'notes');
    }
  }, [pc.notes, campaignId, pc.id]);

  useEffect(() => {
    if (!isPending('exhaustion', pc.exhaustion ?? 0)) {
      setLocalExhaustion(pc.exhaustion ?? 0);
      clearStagedEdit(campaignId, pc.id, 'exhaustion');
    }
  }, [pc.exhaustion, campaignId, pc.id]);

  useEffect(() => {
    const pendingSuccesses = isPending('deathSaves.successes', deathSavesSuccesses);
    const pendingFailures = isPending('deathSaves.failures', deathSavesFailures);

    setLocalDeathSaves((prev) => ({
      successes: pendingSuccesses ? prev.successes : deathSavesSuccesses,
      failures: pendingFailures ? prev.failures : deathSavesFailures,
    }));

    if (!pendingSuccesses) clearStagedEdit(campaignId, pc.id, 'deathSaves.successes');
    if (!pendingFailures) clearStagedEdit(campaignId, pc.id, 'deathSaves.failures');
  }, [deathSavesSuccesses, deathSavesFailures, campaignId, pc.id]);

  useEffect(() => {
    const incoming = pc.conditions ?? [];
    if (!isPending('conditions', incoming)) {
      setLocalConditions(incoming);
      clearStagedEdit(campaignId, pc.id, 'conditions');
    }
  }, [pc.conditions, campaignId, pc.id]);

  useEffect(() => {
    const incoming = pc.spellSlots ?? [];
    if (!isPending('spellSlots', incoming)) {
      setLocalSpellSlots(incoming);
      clearStagedEdit(campaignId, pc.id, 'spellSlots');
    }
  }, [pc.spellSlots, campaignId, pc.id]);

  useEffect(() => {
    const incoming = pc.pactSlots ?? null;
    if (!isPending('pactSlots', incoming)) {
      setLocalPactSlots(incoming);
      clearStagedEdit(campaignId, pc.id, 'pactSlots');
    }
  }, [pc.pactSlots, campaignId, pc.id]);

  useEffect(() => {
    const incoming = pc.resourcePools ?? [];
    if (!isPending('resourcePools', incoming)) {
      setLocalResourcePools(incoming);
      clearStagedEdit(campaignId, pc.id, 'resourcePools');
    }
  }, [pc.resourcePools, campaignId, pc.id]);

  const sendUpdate = async (field: string, value: unknown) => {
    pendingRef.current[field] = { value, sentAt: Date.now() };
    saveStagedEdit(campaignId, pc.id, field, value);
    try {
      await submitPlayerUpdate({
        campaignId,
        shareToken: token,
        slotId,
        pcId: pc.id,
        field,
        value,
      });
    } catch (e) {
      delete pendingRef.current[field];
      clearStagedEdit(campaignId, pc.id, field);
      console.error('Failed to send player update:', e);
    }
  };

  const sendBatchUpdate = async (updates: Record<string, unknown>) => {
    const now = Date.now();
    for (const [k, v] of Object.entries(updates)) {
      pendingRef.current[k] = { value: v, sentAt: now };
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
      for (const k of Object.keys(updates)) {
        delete pendingRef.current[k];
        clearStagedEdit(campaignId, pc.id, k);
      }
      console.error('Failed to send player batch update:', e);
    }
  };

  const adjustHp = (amount: number) => {
    const next = Math.max(0, Math.min(localMaxHp || 999, localHp + amount));
    setLocalHp(next);
    sendUpdate('hp.current', next);
  };

  const handleHpChange = (v: number) => {
    const next = Math.max(0, Math.min(localMaxHp || 999, v));
    setLocalHp(next);
    sendUpdate('hp.current', next);
  };

  const handleMaxHpChange = (v: number) => {
    const next = Math.max(1, Math.min(9999, v));
    setLocalMaxHp(next);
    sendUpdate('hp.max', next);
  };

  const handleTempHpChange = (v: number) => {
    const next = Math.max(0, v);
    setLocalTempHp(next);
    sendUpdate('hp.temp', next);
  };

  const handleHitDiceChange = (next: { dieSize: 4 | 6 | 8 | 10 | 12; max: number; used: number }) => {
    const clamped = {
      dieSize: next.dieSize,
      max: Math.max(0, Math.min(40, next.max)),
      used: Math.max(0, Math.min(next.max, next.used)),
    };
    setLocalHitDice(clamped);
    sendUpdate('hitDice', clamped);
  };

  const handleAcChange = (v: number) => {
    const next = Math.max(0, Math.min(50, v));
    setLocalAc(next);
    sendUpdate('ac', next);
  };

  const handleSpeedChange = (v: number) => {
    const next = Math.max(0, Math.min(999, v));
    setLocalSpeed(next);
    sendUpdate('speed', next);
  };

  const handleInitModChange = (v: number) => {
    const next = Math.max(-20, Math.min(30, v));
    setLocalInitMod(next);
    sendUpdate('initiativeMod', next);
  };

  const toggleInspiration = () => {
    const next = !localInspiration;
    setLocalInspiration(next);
    sendUpdate('inspiration', next);
  };

  const handleNotesBlur = () => {
    if (localNotes !== pc.notes) {
      sendUpdate('notes', localNotes);
    }
  };

  const toggleCondition = (cond: string) => {
    const next = localConditions.includes(cond)
      ? localConditions.filter((c) => c !== cond)
      : [...localConditions, cond];
    setLocalConditions(next);
    sendUpdate('conditions', next);
  };

  const handleExhaustionChange = (n: number) => {
    setLocalExhaustion(n);
    sendUpdate('exhaustion', n);
  };

  const handleDeathSave = (type: 'successes' | 'failures', count: number) => {
    const current = localDeathSaves[type];
    const next = current === count ? count - 1 : count;
    const nextClamped = Math.max(0, Math.min(3, next));
    setLocalDeathSaves((prev) => ({ ...prev, [type]: nextClamped }));
    sendUpdate(`deathSaves.${type}`, nextClamped);
  };

  // Spell Slots & Pact Magic handlers
  const handleToggleSpellSlotPip = (level: number, pipIndex: number) => {
    const next = localSpellSlots.map((slot) => {
      if (slot.level !== level) return slot;
      const nextUsed = slot.used === pipIndex + 1 ? pipIndex : pipIndex + 1;
      return { ...slot, used: Math.max(0, Math.min(slot.max, nextUsed)) };
    });
    setLocalSpellSlots(next);
    sendUpdate('spellSlots', next);
  };

  const handleAddSpellSlotLevel = (level: number, max: number) => {
    const existing = localSpellSlots.find((s) => s.level === level);
    const next = existing
      ? localSpellSlots.map((s) => (s.level === level ? { ...s, max: Math.max(1, max), used: Math.min(s.used, max) } : s))
      : [...localSpellSlots, { level: level as SpellSlotGroup['level'], max: Math.max(1, max), used: 0 }].sort((a, b) => a.level - b.level);
    setLocalSpellSlots(next);
    sendUpdate('spellSlots', next);
  };

  const handleRemoveSpellSlotLevel = (level: number) => {
    const next = localSpellSlots.filter((s) => s.level !== level);
    setLocalSpellSlots(next);
    sendUpdate('spellSlots', next);
  };

  const handlePactSlotChange = (next: PactMagicSlots | null) => {
    setLocalPactSlots(next);
    sendUpdate('pactSlots', next);
  };

  // Class Resource Pools handlers
  const handleAddResourcePool = () => {
    if (!newPoolName.trim()) return;
    const maxVal = Math.max(1, newPoolMax);
    const pool: PcResourcePool = {
      id: `pool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newPoolName.trim(),
      current: maxVal,
      max: maxVal,
      rechargeOn: newPoolRecharge,
    };
    const next = [...localResourcePools, pool];
    setLocalResourcePools(next);
    setNewPoolName('');
    sendUpdate('resourcePools', next);
  };

  const handleUpdateResourcePool = (id: string, delta: number) => {
    const next = localResourcePools.map((p) =>
      p.id === id ? { ...p, current: Math.max(0, Math.min(p.max, p.current + delta)) } : p,
    );
    setLocalResourcePools(next);
    sendUpdate('resourcePools', next);
  };

  const handleRemoveResourcePool = (id: string) => {
    const next = localResourcePools.filter((p) => p.id !== id);
    setLocalResourcePools(next);
    sendUpdate('resourcePools', next);
  };

  // 1-Tap Short Rest & Long Rest Recovery
  const handleShortRest = () => {
    const nextPools = localResourcePools.map((p) =>
      p.rechargeOn === 'short' ? { ...p, current: p.max } : p,
    );
    const nextPact = localPactSlots ? { ...localPactSlots, used: 0 } : null;

    setLocalResourcePools(nextPools);
    if (localPactSlots) setLocalPactSlots(nextPact);

    const updates: Record<string, unknown> = {
      resourcePools: nextPools,
    };
    if (localPactSlots) {
      updates.pactSlots = nextPact;
    }
    sendBatchUpdate(updates);
    setRestFeedback('Short Rest complete: Short-rest resources & Pact Magic restored.');
    setTimeout(() => setRestFeedback(null), 4000);
  };

  const handleLongRest = () => {
    const recoveredHp = localMaxHp;
    const recoveredTempHp = 0;
    const hdRegained = Math.max(1, Math.floor((localHitDice.max || 1) / 2));
    const nextHitDice = {
      ...localHitDice,
      used: Math.max(0, localHitDice.used - hdRegained),
    };
    const nextExhaustion = Math.max(0, localExhaustion - 1);
    const nextDeathSaves = { successes: 0, failures: 0 };
    const nextSlots = localSpellSlots.map((s) => ({ ...s, used: 0 }));
    const nextPact = localPactSlots ? { ...localPactSlots, used: 0 } : null;
    const nextPools = localResourcePools.map((p) =>
      p.rechargeOn === 'short' || p.rechargeOn === 'long' || p.rechargeOn === 'dawn'
        ? { ...p, current: p.max }
        : p,
    );

    setLocalHp(recoveredHp);
    setLocalTempHp(recoveredTempHp);
    setLocalHitDice(nextHitDice);
    setLocalExhaustion(nextExhaustion);
    setLocalDeathSaves(nextDeathSaves);
    setLocalSpellSlots(nextSlots);
    if (localPactSlots) setLocalPactSlots(nextPact);
    setLocalResourcePools(nextPools);

    const updates: Record<string, unknown> = {
      'hp.current': recoveredHp,
      'hp.temp': recoveredTempHp,
      hitDice: nextHitDice,
      exhaustion: nextExhaustion,
      'deathSaves.successes': 0,
      'deathSaves.failures': 0,
      spellSlots: nextSlots,
      resourcePools: nextPools,
    };
    if (localPactSlots) {
      updates.pactSlots = nextPact;
    }
    sendBatchUpdate(updates);
    setRestFeedback('Long Rest complete: Full HP, spell slots, class resources, and ½ Hit Dice restored.');
    setTimeout(() => setRestFeedback(null), 4000);
  };

  const getRenderedList = (field: PcListField): string[] => {
    const staged = loadStagedEdits(campaignId, pc.id)[field];
    if (staged !== undefined) {
      if (JSON.stringify(staged.value) === JSON.stringify(pc[field] ?? [])) {
        clearStagedEdit(campaignId, pc.id, field);
        return pc[field] ?? [];
      }
      return staged.value as string[];
    }
    return pc[field] ?? [];
  };

  const handleAddListItem = (field: PcListField, text: string) => {
    const current = getRenderedList(field);
    const next = [...current, text];
    saveStagedEdit(campaignId, pc.id, field, next);
    sendUpdate(field, next);
  };

  const handleRemoveListItem = (field: PcListField, index: number) => {
    const current = getRenderedList(field);
    const next = current.filter((_, i) => i !== index);
    saveStagedEdit(campaignId, pc.id, field, next);
    sendUpdate(field, next);
  };

  const handleEditListItem = (field: PcListField, index: number, text: string) => {
    const current = [...getRenderedList(field)];
    current[index] = text;
    saveStagedEdit(campaignId, pc.id, field, current);
    sendUpdate(field, current);
  };

  const classesLabel = pc.classes?.length
    ? pc.classes.map((c) => `${c.name} ${c.level}`).join(' / ')
    : `Level ${pc.level ?? 1}`;

  const hitDiceRemaining = Math.max(0, localHitDice.max - localHitDice.used);

  return (
    <div className="space-y-4 rounded-lg border border-rule bg-parchment p-4 shadow-md sm:p-5">
      {/* Identity & Rest Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl font-semibold tracking-wide text-ink">
              {pc.name || 'Unnamed Character'}
            </h3>
            <button
              type="button"
              onClick={toggleInspiration}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                localInspiration
                  ? 'border-gold bg-gold/20 text-gold-deep shadow-sm'
                  : 'border-rule bg-parchment-soft text-ink-faint hover:text-ink'
              }`}
              title="Toggle Heroic Inspiration"
            >
              <Sparkles size={11} />
              {localInspiration ? 'Inspired' : 'No Inspiration'}
            </button>
          </div>
          <p className="font-serif text-xs italic text-ink-mute">
            {[pc.race, classesLabel].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* 1-Tap Short Rest & Long Rest Recovery Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleShortRest}
            className="inline-flex items-center gap-1.5 rounded border border-gold/50 bg-gold/10 px-3 py-1.5 font-mono text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/20"
            title="Recover short-rest resource pools and Warlock Pact Magic slots"
          >
            <Sun size={13} /> Short Rest
          </button>
          <button
            type="button"
            onClick={handleLongRest}
            className="inline-flex items-center gap-1.5 rounded border border-wax/50 bg-wax/10 px-3 py-1.5 font-mono text-xs font-semibold text-wax transition-colors hover:bg-wax/20"
            title="Restore full HP, all spell slots, long-rest resources, ½ Hit Dice, and -1 Exhaustion"
          >
            <Moon size={13} /> Long Rest
          </button>
        </div>
      </div>

      {restFeedback && (
        <div className="rounded border border-forest/40 bg-forest/10 px-3 py-1.5 font-serif text-xs text-forest">
          {restFeedback}
        </div>
      )}

      {/* Combat Stats Row: AC, Speed, Initiative, Hit Dice */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="flex items-center justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            <Shield size={12} className="text-wax" /> AC
          </span>
          <input
            type="number"
            value={localAc}
            onChange={(e) => setLocalAc(parseInt(e.target.value, 10) || 0)}
            onBlur={() => handleAcChange(localAc)}
            aria-label="Armor Class"
            className="w-12 border-b border-rule bg-transparent text-right font-display text-base font-bold text-ink focus:border-wax focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            <Footprints size={12} className="text-gold-deep" /> Speed
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={localSpeed}
              onChange={(e) => setLocalSpeed(parseInt(e.target.value, 10) || 0)}
              onBlur={() => handleSpeedChange(localSpeed)}
              aria-label="Speed"
              className="w-12 border-b border-rule bg-transparent text-right font-display text-base font-bold text-ink focus:border-wax focus:outline-none"
            />
            <span className="font-mono text-[10px] text-ink-faint">ft</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            <Zap size={12} className="text-gold-deep" /> Init Mod
          </span>
          <input
            type="number"
            value={localInitMod}
            onChange={(e) => setLocalInitMod(parseInt(e.target.value, 10) || 0)}
            onBlur={() => handleInitModChange(localInitMod)}
            aria-label="Initiative Modifier"
            className="w-12 border-b border-rule bg-transparent text-right font-display text-base font-bold text-ink focus:border-wax focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            <Dice5 size={12} className="text-wax" /> Hit Dice
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleHitDiceChange({ ...localHitDice, used: Math.min(localHitDice.max, localHitDice.used + 1) })}
              title="Spend 1 Hit Die"
              className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[10px] text-ink hover:bg-parchment-deep"
            >
              -1
            </button>
            <span className="font-mono text-xs font-bold text-ink">
              {hitDiceRemaining}/{localHitDice.max}d{localHitDice.dieSize}
            </span>
            <button
              type="button"
              onClick={() => handleHitDiceChange({ ...localHitDice, used: Math.max(0, localHitDice.used - 1) })}
              title="Recover 1 Hit Die"
              className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[10px] text-ink hover:bg-parchment-deep"
            >
              +1
            </button>
          </div>
        </div>
      </div>

      {/* HP, Exhaustion, and Death Saves Dashboard */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* HP Panel */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            <Heart size={12} className="text-crimson" /> Hit Points
          </div>
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => adjustHp(-1)}
              className="flex size-7 items-center justify-center rounded border border-rule bg-parchment font-bold text-ink hover:bg-parchment-deep"
            >
              -
            </button>
            <div className="flex items-center gap-1 font-serif">
              <input
                type="number"
                value={localHp}
                onChange={(e) => setLocalHp(parseInt(e.target.value, 10) || 0)}
                onBlur={() => handleHpChange(localHp)}
                aria-label="Current Hit Points"
                className="w-12 border-b border-rule bg-transparent text-center font-display text-lg text-ink focus:border-crimson focus:outline-none"
              />
              <span className="text-ink-mute">/</span>
              <input
                type="number"
                value={localMaxHp}
                onChange={(e) => setLocalMaxHp(parseInt(e.target.value, 10) || 1)}
                onBlur={() => handleMaxHpChange(localMaxHp)}
                aria-label="Maximum Hit Points"
                className="w-12 border-b border-rule bg-transparent text-center font-display text-sm text-ink-soft focus:border-crimson focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => adjustHp(1)}
              className="flex size-7 items-center justify-center rounded border border-rule bg-parchment font-bold text-ink hover:bg-parchment-deep"
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
              aria-label="Temporary Hit Points"
              className="w-12 border-b border-rule bg-transparent text-center font-display text-sm text-ink focus:border-crimson focus:outline-none"
            />
          </div>
        </div>

        {/* Exhaustion Panel */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            Exhaustion
          </div>
          <div className="flex justify-between gap-1 pt-1">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleExhaustionChange(n)}
                className={`h-6 flex-1 rounded border font-display text-[10px] transition-colors ${
                  localExhaustion === n
                    ? 'border-crimson bg-crimson font-semibold text-white'
                    : 'border-rule text-ink-soft hover:bg-parchment'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="pt-0.5 text-center font-serif text-[10px] italic leading-normal text-ink-faint">
            {localExhaustion >= 6 ? '☠ Level 6: Death' : EXHAUSTION_LABELS[localExhaustion]}
          </p>
        </div>

        {/* Death Saves Panel */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            Death Saves
          </div>
          <div className="space-y-1.5 pt-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-serif text-ink-soft">Successes</span>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleDeathSave('successes', n)}
                    className={`size-5 rounded-full border transition-all ${
                      localDeathSaves.successes >= n
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
                    type="button"
                    onClick={() => handleDeathSave('failures', n)}
                    className={`size-5 rounded-full border transition-all ${
                      localDeathSaves.failures >= n
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

      {/* Spell Slots (Levels 1-9 + Pact Magic) & Class Resource Pools */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Spell Slots & Pact Magic */}
        <div className="space-y-2.5 rounded border border-rule bg-parchment-soft p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              <Flame size={12} className="text-wax" /> Spell Slots & Pact Magic
            </div>
            <button
              type="button"
              onClick={() => setShowAddSlotLevel((v) => !v)}
              className="font-mono text-[10px] text-brass-deep hover:underline"
            >
              {showAddSlotLevel ? 'Done' : '+ Configure Slots'}
            </button>
          </div>

          {showAddSlotLevel && (
            <div className="space-y-2 rounded border border-rule bg-parchment p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] text-ink-soft">Add/Set Level:</span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      const cur = localSpellSlots.find((s) => s.level === lvl);
                      handleAddSpellSlotLevel(lvl, (cur?.max ?? 0) + 1);
                    }}
                    className="rounded border border-rule bg-parchment-soft px-2 py-0.5 font-mono text-[10px] hover:bg-parchment-deep"
                  >
                    L{lvl} (+1)
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-rule/50 pt-1.5">
                <span className="font-mono text-[10px] text-ink-soft">Warlock Pact Magic:</span>
                {localPactSlots ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px]">
                      L{localPactSlots.level} × {localPactSlots.max}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handlePactSlotChange({
                          ...localPactSlots,
                          level: (localPactSlots.level < 5 ? localPactSlots.level + 1 : 1) as PactMagicSlots['level'],
                        })
                      }
                      className="rounded border border-rule px-1.5 py-0.5 font-mono text-[9px]"
                    >
                      Cycle Lvl
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handlePactSlotChange({
                          ...localPactSlots,
                          max: (localPactSlots.max % 4) + 1,
                        })
                      }
                      className="rounded border border-rule px-1.5 py-0.5 font-mono text-[9px]"
                    >
                      Cycle Max
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePactSlotChange(null)}
                      className="text-crimson hover:underline font-mono text-[9px]"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handlePactSlotChange({ level: 1, max: 2, used: 0 })}
                    className="rounded border border-rule bg-parchment-soft px-2 py-0.5 font-mono text-[10px] hover:bg-parchment-deep"
                  >
                    + Enable Pact Slots
                  </button>
                )}
              </div>
            </div>
          )}

          {localPactSlots && (
            <div className="flex items-center justify-between rounded border border-gold/40 bg-gold/10 px-2.5 py-1.5">
              <span className="font-mono text-[11px] font-semibold text-gold-deep">
                Pact Magic (Lvl {localPactSlots.level} · Short Rest)
              </span>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: localPactSlots.max }, (_, idx) => {
                  const isUsed = idx < localPactSlots.used;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const nextUsed = localPactSlots.used === idx + 1 ? idx : idx + 1;
                        handlePactSlotChange({ ...localPactSlots, used: Math.max(0, Math.min(localPactSlots.max, nextUsed)) });
                      }}
                      title={isUsed ? 'Slot expended (click to restore)' : 'Slot available (click to expend)'}
                      className={`size-4 rounded-full border transition-all ${
                        isUsed ? 'border-gold-deep bg-gold-deep/30' : 'border-gold-deep bg-gold shadow-sm'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {localSpellSlots.length === 0 && !localPactSlots ? (
            <p className="font-serif text-xs italic text-ink-faint">
              No spell slots configured. Click &ldquo;+ Configure Slots&rdquo; to track spell levels 1–9 or Pact Magic.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {localSpellSlots.map((slot) => (
                <div
                  key={slot.level}
                  className="flex items-center justify-between rounded border border-rule bg-parchment px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-ink">Lvl {slot.level}</span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      ({slot.max - slot.used}/{slot.max})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: slot.max }, (_, idx) => {
                      const isUsed = idx < slot.used;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleSpellSlotPip(slot.level, idx)}
                          title={isUsed ? 'Expended (click to restore)' : 'Available (click to expend)'}
                          className={`size-3.5 rounded-full border transition-all ${
                            isUsed ? 'border-rule bg-parchment-deep' : 'border-wax bg-wax shadow-sm'
                          }`}
                        />
                      );
                    })}
                    {showAddSlotLevel && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSpellSlotLevel(slot.level)}
                        className="ml-1 text-ink-faint hover:text-crimson"
                        title="Remove slot level"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Class & Feat Resource Pools */}
        <div className="space-y-2.5 rounded border border-rule bg-parchment-soft p-3">
          <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            Class & Feat Resources
          </div>

          <div className="space-y-1.5">
            {localResourcePools.map((pool) => (
              <div
                key={pool.id}
                className="flex items-center justify-between gap-2 rounded border border-rule bg-parchment px-2.5 py-1.5"
              >
                <div>
                  <div className="font-serif text-xs font-semibold text-ink">{pool.name}</div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
                    Recharges on {pool.rechargeOn}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateResourcePool(pool.id, -1)}
                    className="flex size-5 items-center justify-center rounded border border-rule bg-parchment-soft font-mono text-xs text-ink hover:bg-parchment-deep"
                  >
                    -
                  </button>
                  <span className="min-w-[38px] text-center font-mono text-xs font-bold text-ink">
                    {pool.current}/{pool.max}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateResourcePool(pool.id, 1)}
                    className="flex size-5 items-center justify-center rounded border border-rule bg-parchment-soft font-mono text-xs text-ink hover:bg-parchment-deep"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveResourcePool(pool.id)}
                    className="text-ink-faint hover:text-crimson"
                    title="Remove resource pool"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <input
              type="text"
              value={newPoolName}
              onChange={(e) => setNewPoolName(e.target.value)}
              placeholder="e.g. Ki Points, Rage, Bardic Insp."
              className="min-w-[120px] flex-1 rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none"
            />
            <input
              type="number"
              min={1}
              max={99}
              value={newPoolMax}
              onChange={(e) => setNewPoolMax(parseInt(e.target.value, 10) || 1)}
              className="w-12 rounded border border-rule bg-parchment px-1.5 py-1 text-center font-mono text-xs text-ink"
              title="Max Charges"
            />
            <select
              value={newPoolRecharge}
              onChange={(e) => setNewPoolRecharge(e.target.value as RechargeTiming)}
              className="rounded border border-rule bg-parchment px-1.5 py-1 font-mono text-[10px] text-ink"
            >
              <option value="short">Short Rest</option>
              <option value="long">Long Rest</option>
              <option value="dawn">Dawn</option>
              <option value="manual">Manual</option>
            </select>
            <button
              type="button"
              onClick={handleAddResourcePool}
              className="inline-flex items-center gap-1 rounded border border-wax/50 bg-wax/10 px-2 py-1 font-mono text-[10px] font-semibold text-wax hover:bg-wax/20"
            >
              <Plus size={11} /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Conditions Editor */}
      <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
        <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
          Active Conditions
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONDITION_OPTIONS.map((cond) => {
            const isActive = localConditions.includes(cond);
            return (
              <button
                key={cond}
                type="button"
                onClick={() => toggleCondition(cond)}
                className={`rounded border px-2 py-0.5 font-display text-[9px] uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'border-wine/50 bg-wine/15 font-semibold text-wine'
                    : 'border-rule bg-parchment text-ink-soft hover:bg-parchment-deep'
                }`}
              >
                {cond}
              </button>
            );
          })}
        </div>
      </div>

      {/* Roleplay Fields (Editable Roster Lists) */}
      <div className="grid gap-3 border-t border-rule pt-3 sm:grid-cols-2">
        {PC_ROLEPLAY_FIELDS.map((field) => (
          <div key={field} className="space-y-1.5">
            <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              {prettify(field)}
            </div>
            <div className="space-y-1 rounded border border-rule/50 bg-parchment-soft/50 p-2">
              {getRenderedList(field).map((val: string, idx: number) => (
                <div key={idx} className="group flex items-center gap-1.5">
                  <input
                    value={val}
                    onChange={(e) => handleEditListItem(field, idx, e.target.value)}
                    className="w-full border-b border-transparent bg-transparent px-1 py-0.5 font-serif text-xs text-ink-soft hover:border-rule focus:border-crimson focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveListItem(field, idx)}
                    className="text-ink-mute opacity-0 transition-opacity hover:text-crimson group-hover:opacity-100"
                    aria-label={`Remove ${field} item`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleAddListItem(field, '')}
                className="flex items-center gap-1 pt-1 font-display text-[9px] uppercase tracking-wider text-brass-deep hover:text-crimson"
              >
                <Plus size={10} /> Add {prettify(field.replace(/s$/, ''))}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Personal Notes (Editable Textarea) */}
      <div className="space-y-1.5 border-t border-rule pt-3">
        <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
          Quick Sheet Notes
        </div>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Freeform character sheet notes (combat reminders, sidekick stats...)"
          rows={3}
          className="w-full resize-none rounded border border-rule bg-parchment-soft p-2.5 font-serif text-xs leading-relaxed text-ink focus:border-crimson focus:outline-none"
        />
      </div>

      {/* Read-only PC Properties */}
      <details className="group border-t border-rule pt-2">
        <summary className="flex cursor-pointer select-none items-center justify-between font-display text-[10px] uppercase tracking-wider text-ink-mute hover:text-ink">
          <span>View Ability Scores & Skills</span>
          <span className="font-serif text-[9px] text-ink-faint">(Click to Expand)</span>
        </summary>
        <div className="animate-fade-in mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="font-display text-[9px] font-semibold uppercase tracking-wider text-brass-deep">Ability Scores</div>
            <div className="grid grid-cols-3 gap-1 rounded border border-rule bg-parchment-soft p-2">
              {ABILITY_KEYS.map((a) => (
                <div key={a} className="py-1 text-center">
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
            <div className="font-display text-[9px] font-semibold uppercase tracking-wider text-brass-deep">Details</div>
            <div className="space-y-1 rounded border border-rule bg-parchment-soft p-2.5 font-serif text-xs text-ink-soft">
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
