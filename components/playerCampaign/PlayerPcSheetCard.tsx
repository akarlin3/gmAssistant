'use client';

// The player's editable PC sheet. Players may edit their allowlisted mechanical
// and roleplay fields (Vitals & Combat Resources, Class & Spell Resources with
// 1-tap Short/Long Rest recovery, Roleplay traits, and Notes); edits are staged
// via submitPlayerUpdate / submitPlayerBatchUpdate and reconciled into the CRDT
// by the GM.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  X,
  Plus,
  Heart,
  Sparkles,
  Shield,
  Zap,
  Footprints,
  Moon,
  Sun,
  Flame,
  Dice5,
  FileUp,
  Lock,
  Unlock,
  Swords,
  Wand2,
  ArrowUpCircle,
  AlertTriangle,
} from 'lucide-react';
import { submitPlayerUpdate, submitPlayerBatchUpdate } from '@/lib/playerMode/playerClient';
import type {
  AbilityKey,
  ActiveBuff,
  BuffExpiryTrigger,
  PactMagicSlots,
  PcAttackEntry,
  PcEvaluation,
  PcFeature,
  PcResourcePool,
  PlayerCharacter,
  RechargeTiming,
  RollEvent,
  RollMode,
  SpellSlotGroup,
} from '@/lib/pc/types';
import {
  ExportSheetPdfButton,
  EvaluationReportBadge,
  CharacterSheetUploadToast,
  type SheetUploadToastState,
} from '@/components/CharacterSheetLifecycleControls';
import {
  computeEffectiveCharacterStats,
  PRESET_BUFFS,
  createBuffFromPreset,
  expireActiveBuffs,
} from '@/lib/activeModifiers';
import {
  rollAbilityCheck,
  rollSavingThrow,
  rollSkillCheck,
  rollInitiativeCheck,
  rollWeaponOrSpellAttack,
  rollAttackDamage,
  rollCharacterHitDie,
  rollCharacterDeathSave,
  rollConcentrationCheck,
  parseSpellMetadata,
  getAvailableSpellSlotsForPc,
  applySpellCastToPc,
  deductFeatureOrResourceUse,
  appendRollEventRingBuffer,
  SKILL_DEFINITIONS,
} from '@/lib/diceRoller';
import CharacterWizardModal from '@/components/CharacterWizardModal';
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
  onRollRecorded,
  onAppendSecretRoll,
}: {
  pc: PlayerPc;
  token: string;
  slotId: string;
  campaignId: string;
  onRollRecorded?: (event: RollEvent, isSecret: boolean) => void;
  onAppendSecretRoll?: (roll: RollEvent) => void;
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
  const [localActiveBuffs, setLocalActiveBuffs] = useState<ActiveBuff[]>(() => getInitialValue('activeBuffs', pc.activeBuffs ?? []));
  const [localConcentrationSpell, setLocalConcentrationSpell] = useState<string>(() =>
    getInitialValue('concentrationSpell', pc.concentrationSpell ?? ''),
  );
  const [localRollEvents, setLocalRollEvents] = useState<RollEvent[]>(() => getInitialValue('rollEvents', pc.rollEvents ?? []));
  const [localSpellSlots, setLocalSpellSlots] = useState<SpellSlotGroup[]>(() => getInitialValue('spellSlots', pc.spellSlots ?? []));
  const [localPactSlots, setLocalPactSlots] = useState<PactMagicSlots | null>(() => getInitialValue('pactSlots', pc.pactSlots ?? null));
  const [localResourcePools, setLocalResourcePools] = useState<PcResourcePool[]>(() => getInitialValue('resourcePools', pc.resourcePools ?? []));

  // Interactive Roll Bar state
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const [situationalBonus, setSituationalBonus] = useState<string>('');
  const [secretRoll, setSecretRoll] = useState<boolean>(false);
  const [lastRollBanner, setLastRollBanner] = useState<RollEvent | null>(null);

  // Concentration Check Prompt state
  const [concentrationPrompt, setConcentrationPrompt] = useState<{
    damage: number;
    dc: number;
    spellName: string;
    rollResult?: { roll: RollEvent; passed: boolean };
  } | null>(null);

  // Smart Spell Cast / Concentration Overwrite Prompt state
  const [pendingSpellCast, setPendingSpellCast] = useState<{
    spellRaw: string;
    name: string;
    level: number;
    requiresConcentration: boolean;
  } | null>(null);

  // Custom Buff form state
  const [showCustomBuffForm, setShowCustomBuffForm] = useState(false);
  const [customBuffName, setCustomBuffName] = useState('');
  const [customBuffAc, setCustomBuffAc] = useState(0);
  const [customBuffAttack, setCustomBuffAttack] = useState('');
  const [customBuffSave, setCustomBuffSave] = useState('');
  const [customBuffExpiry, setCustomBuffExpiry] = useState<BuffExpiryTrigger>('round');

  // Character Wizard Modal state
  const [wizardMode, setWizardMode] = useState<'create' | 'levelUp' | null>(null);

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
    const incoming = pc.activeBuffs ?? [];
    if (!isPending('activeBuffs', incoming)) {
      setLocalActiveBuffs(incoming);
      clearStagedEdit(campaignId, pc.id, 'activeBuffs');
    }
  }, [pc.activeBuffs, campaignId, pc.id]);

  useEffect(() => {
    const incoming = pc.concentrationSpell ?? '';
    if (!isPending('concentrationSpell', incoming)) {
      setLocalConcentrationSpell(incoming);
      clearStagedEdit(campaignId, pc.id, 'concentrationSpell');
    }
  }, [pc.concentrationSpell, campaignId, pc.id]);

  useEffect(() => {
    const incoming = pc.rollEvents ?? [];
    if (!isPending('rollEvents', incoming)) {
      setLocalRollEvents(incoming);
      clearStagedEdit(campaignId, pc.id, 'rollEvents');
    }
  }, [pc.rollEvents, campaignId, pc.id]);

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

  const triggerConcentrationCheckIfNeeded = (prevHp: number, nextHp: number) => {
    const damage = prevHp - nextHp;
    if (damage > 0 && localConcentrationSpell.trim()) {
      const dc = Math.max(10, Math.floor(damage / 2));
      setConcentrationPrompt({
        damage,
        dc,
        spellName: localConcentrationSpell.trim(),
      });
    }
  };

  const adjustHp = (amount: number) => {
    const next = Math.max(0, Math.min(localMaxHp || 999, localHp + amount));
    triggerConcentrationCheckIfNeeded(localHp, next);
    setLocalHp(next);
    sendUpdate('hp.current', next);
  };

  const handleHpChange = (v: number) => {
    const next = Math.max(0, Math.min(localMaxHp || 999, v));
    triggerConcentrationCheckIfNeeded(localHp, next);
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

  const handleTogglePresetBuff = (presetId: string) => {
    const exists = localActiveBuffs.some((b) => b.id === presetId || b.id.startsWith(`${presetId}_`));
    let next: ActiveBuff[];
    if (exists) {
      next = localActiveBuffs.filter((b) => b.id !== presetId && !b.id.startsWith(`${presetId}_`));
    } else {
      const created = createBuffFromPreset(presetId);
      if (!created) return;
      next = [...localActiveBuffs, { ...created, id: presetId }];
    }
    setLocalActiveBuffs(next);
    sendUpdate('activeBuffs', next);
  };

  const handleAddCustomBuff = () => {
    if (!customBuffName.trim()) return;
    const buff: ActiveBuff = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: customBuffName.trim(),
      acBonus: customBuffAc || undefined,
      attackBonusFormula: customBuffAttack.trim() || undefined,
      saveBonusFormula: customBuffSave.trim() || undefined,
      expiresOn: customBuffExpiry,
      active: true,
    };
    const next = [...localActiveBuffs, buff];
    setLocalActiveBuffs(next);
    sendUpdate('activeBuffs', next);
    setCustomBuffName('');
    setCustomBuffAc(0);
    setCustomBuffAttack('');
    setCustomBuffSave('');
    setShowCustomBuffForm(false);
  };

  const handleRemoveBuff = (buffId: string) => {
    const next = localActiveBuffs.filter((b) => b.id !== buffId);
    setLocalActiveBuffs(next);
    sendUpdate('activeBuffs', next);
  };

  const handleConcentrationChange = (spellName: string) => {
    const trimmed = spellName.trim();
    setLocalConcentrationSpell(trimmed);
    if (!trimmed) setConcentrationPrompt(null);
    sendUpdate('concentrationSpell', trimmed);
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

  // 1-Tap Short Rest & Long Rest Recovery (also expires 'shortRest' / 'longRest' activeBuffs)
  const handleShortRest = () => {
    const nextPools = localResourcePools.map((p) =>
      p.rechargeOn === 'short' ? { ...p, current: p.max } : p,
    );
    const nextPact = localPactSlots ? { ...localPactSlots, used: 0 } : null;
    const nextBuffs = expireActiveBuffs(localActiveBuffs, 'shortRest');

    setLocalResourcePools(nextPools);
    if (localPactSlots) setLocalPactSlots(nextPact);
    setLocalActiveBuffs(nextBuffs);

    const updates: Record<string, unknown> = {
      resourcePools: nextPools,
      activeBuffs: nextBuffs,
    };
    if (localPactSlots) {
      updates.pactSlots = nextPact;
    }
    sendBatchUpdate(updates);
    setRestFeedback('Short Rest complete: Short-rest resources, Pact Magic restored & short-rest buffs expired.');
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
    const nextBuffs = expireActiveBuffs(localActiveBuffs, 'longRest');

    setLocalHp(recoveredHp);
    setLocalTempHp(recoveredTempHp);
    setLocalHitDice(nextHitDice);
    setLocalExhaustion(nextExhaustion);
    setLocalDeathSaves(nextDeathSaves);
    setLocalSpellSlots(nextSlots);
    if (localPactSlots) setLocalPactSlots(nextPact);
    setLocalResourcePools(nextPools);
    setLocalActiveBuffs(nextBuffs);

    const updates: Record<string, unknown> = {
      'hp.current': recoveredHp,
      'hp.temp': recoveredTempHp,
      hitDice: nextHitDice,
      exhaustion: nextExhaustion,
      'deathSaves.successes': 0,
      'deathSaves.failures': 0,
      spellSlots: nextSlots,
      resourcePools: nextPools,
      activeBuffs: nextBuffs,
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

  const [localEvaluation, setLocalEvaluation] = useState<PcEvaluation | undefined>(() =>
    getInitialValue('evaluation', pc.evaluation),
  );
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [sheetUploadError, setSheetUploadError] = useState<string | null>(null);
  const [uploadToast, setUploadToast] = useState<SheetUploadToastState | null>(null);
  const [dragOverCard, setDragOverCard] = useState(false);
  const sheetFileInputRef = useRef<HTMLInputElement>(null);

  const buildCurrentPcForLifecycle = (): PlayerCharacter =>
    ({
      ...pc,
      hp: { current: localHp, max: localMaxHp, temp: localTempHp },
      hitDice: localHitDice,
      ac: localAc,
      speed: localSpeed,
      initiativeMod: localInitMod,
      inspiration: localInspiration,
      notes: localNotes,
      exhaustion: localExhaustion,
      deathSaves: localDeathSaves,
      conditions: localConditions,
      activeBuffs: localActiveBuffs,
      concentrationSpell: localConcentrationSpell,
      rollEvents: localRollEvents,
      spellSlots: localSpellSlots,
      pactSlots: localPactSlots,
      resourcePools: localResourcePools,
      evaluation: localEvaluation ?? pc.evaluation,
    }) as unknown as PlayerCharacter;

  // Compute non-destructive effective stats from active conditions, exhaustion, and activeBuffs
  const effectiveStats = useMemo(
    () => computeEffectiveCharacterStats(buildCurrentPcForLifecycle()),
    [
      pc,
      localHp,
      localMaxHp,
      localTempHp,
      localAc,
      localSpeed,
      localInitMod,
      localExhaustion,
      localConditions,
      localActiveBuffs,
    ],
  );

  const normalizeToSpellSlotGroups = (
    raw: PlayerCharacter['spellSlots'] | SpellSlotGroup[] | undefined,
  ): SpellSlotGroup[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const out: SpellSlotGroup[] = [];
    for (const [k, v] of Object.entries(raw)) {
      const lvl = Number(k) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      if (lvl >= 1 && lvl <= 9 && typeof v === 'object' && v !== null && 'max' in v) {
        const slotObj = v as { max: number; used?: number };
        if (typeof slotObj.max === 'number' && slotObj.max > 0) {
          out.push({ level: lvl, max: slotObj.max, used: slotObj.used ?? 0 });
        }
      }
    }
    return out;
  };

  // Record a roll event: if secretRoll is true, keep strictly local and NEVER send to pcWritebacks
  const recordRollEvent = (event: RollEvent) => {
    setLastRollBanner(event);
    onRollRecorded?.(event, Boolean(event.secretRoll));
    if (event.secretRoll) {
      onAppendSecretRoll?.(event);
    } else {
      const nextRolls = appendRollEventRingBuffer(localRollEvents, event);
      setLocalRollEvents(nextRolls);
      void sendUpdate('rollEvents', nextRolls);
    }
  };

  // Click-to-Roll handlers
  const handleRollAbility = (ability: AbilityKey) => {
    const event = rollAbilityCheck(buildCurrentPcForLifecycle(), ability, {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(event);
  };

  const handleRollSave = (ability: AbilityKey) => {
    const event = rollSavingThrow(buildCurrentPcForLifecycle(), ability, {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(event);
  };

  const handleRollSkill = (skillName: string) => {
    const event = rollSkillCheck(buildCurrentPcForLifecycle(), skillName, {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(event);
  };

  const handleRollInitiative = () => {
    const event = rollInitiativeCheck(buildCurrentPcForLifecycle(), {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(event);
  };

  const handleRollAttack = (atk: PcAttackEntry) => {
    const event = rollWeaponOrSpellAttack(buildCurrentPcForLifecycle(), atk, {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(event);
  };

  const handleRollDamage = (atk: PcAttackEntry, isCrit = false) => {
    const event = rollAttackDamage(buildCurrentPcForLifecycle(), atk, {
      isCrit,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(event);
  };

  const handleRollHitDie = () => {
    if (localHitDice.used >= localHitDice.max) return;
    const res = rollCharacterHitDie(buildCurrentPcForLifecycle(), { secretRoll });
    recordRollEvent(res.roll);
    const nextHd = { ...localHitDice, used: Math.min(localHitDice.max, localHitDice.used + 1) };
    const nextHp = Math.min(localMaxHp, localHp + res.hpHealed);
    setLocalHitDice(nextHd);
    setLocalHp(nextHp);
    void sendBatchUpdate({
      hitDice: nextHd,
      'hp.current': nextHp,
    });
  };

  const handleRollDeathSave = () => {
    const res = rollCharacterDeathSave(buildCurrentPcForLifecycle(), {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(res.roll);
    setLocalDeathSaves(res.nextDeathSaves);
    const updates: Record<string, unknown> = {
      'deathSaves.successes': res.nextDeathSaves.successes,
      'deathSaves.failures': res.nextDeathSaves.failures,
    };
    if (res.regainedOneHp) {
      const nextHp = Math.max(1, localHp);
      setLocalHp(nextHp);
      updates['hp.current'] = nextHp;
    }
    void sendBatchUpdate(updates);
  };

  const handleExecuteConcentrationSave = () => {
    if (!concentrationPrompt) return;
    const res = rollConcentrationCheck(buildCurrentPcForLifecycle(), concentrationPrompt.damage, {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    recordRollEvent(res.roll);
    setConcentrationPrompt({
      ...concentrationPrompt,
      rollResult: { roll: res.roll, passed: res.passed },
    });
  };

  // Smart Spell Cast Hook
  const handleInitiateSpellCast = (spellRaw: string) => {
    const meta = parseSpellMetadata(spellRaw);
    setPendingSpellCast({ spellRaw, ...meta });
  };

  const handleConfirmSpellCast = (slotChoice: { kind: 'spell' | 'pact' | 'none'; level: number }, setConc: boolean) => {
    if (!pendingSpellCast) return;
    const currentPc = buildCurrentPcForLifecycle();
    const { updatedPc } = applySpellCastToPc(currentPc, {
      spellName: pendingSpellCast.name,
      slotKind: slotChoice.kind === 'none' ? undefined : slotChoice.kind,
      slotLevel: slotChoice.level,
      setConcentration: setConc,
    });

    // Roll a spell attack or ability check if applicable
    const spellAbility: AbilityKey = (pc.spellcastingAbility as AbilityKey) || 'int';
    const prof = pc.proficiencyBonus ?? 2;
    const spellMod = effectiveStats.abilityModifiers[spellAbility] + prof;
    const rollEvt = rollWeaponOrSpellAttack(
      currentPc,
      {
        name: `${pendingSpellCast.name}${slotChoice.kind !== 'none' ? ` (Lvl ${slotChoice.level})` : ''}`,
        attackBonus: spellMod,
        damage: '1d8',
      },
      { rollMode, situationalBonus, secretRoll },
    );
    recordRollEvent(rollEvt);

    const updates: Record<string, unknown> = {};
    if (updatedPc.spellSlots) {
      const normalizedSlots = normalizeToSpellSlotGroups(updatedPc.spellSlots);
      setLocalSpellSlots(normalizedSlots);
      updates.spellSlots = normalizedSlots;
    }
    if (updatedPc.pactSlots !== undefined) {
      setLocalPactSlots(updatedPc.pactSlots ?? null);
      updates.pactSlots = updatedPc.pactSlots ?? null;
    }
    if (setConc) {
      setLocalConcentrationSpell(pendingSpellCast.name);
      updates.concentrationSpell = pendingSpellCast.name;
    }
    if (Object.keys(updates).length > 0) {
      void sendBatchUpdate(updates);
    }
    setPendingSpellCast(null);
  };

  // Smart Class Feature Roll & Resource Deduction Hook
  const handleRollAndUseFeature = (feat: PcFeature, deductResource: boolean) => {
    const currentPc = buildCurrentPcForLifecycle();
    const primaryAbil: AbilityKey = (pc.spellcastingAbility as AbilityKey) || 'str';
    const evt = rollAbilityCheck(currentPc, primaryAbil, {
      rollMode,
      situationalBonus,
      secretRoll,
    });
    const customEvt: RollEvent = {
      ...evt,
      label: `Feature: ${feat.name}`,
    };
    recordRollEvent(customEvt);

    if (deductResource) {
      // Find matching resource pool or feature uses
      const matchingPool = localResourcePools.find(
        (p) => p.name.toLowerCase() === feat.name.toLowerCase() && p.current > 0,
      );
      const { updatedPc } = deductFeatureOrResourceUse(currentPc, {
        featureName: feat.name,
        poolId: matchingPool?.id,
      });
      const updates: Record<string, unknown> = {};
      if (updatedPc.resourcePools) {
        setLocalResourcePools(updatedPc.resourcePools);
        updates.resourcePools = updatedPc.resourcePools;
      }
      if (updatedPc.features) {
        updates.features = updatedPc.features;
      }
      if (Object.keys(updates).length > 0) {
        void sendBatchUpdate(updates);
      }
    }
  };

  // Character Wizard commit handler
  const handleCommitCharacterWizard = async (nextPc: PlayerCharacter) => {
    setLocalHp(nextPc.hp.current);
    setLocalMaxHp(nextPc.hp.max);
    setLocalTempHp(nextPc.hp.temp);
    if (nextPc.hitDice) {
      const ds = ([4, 6, 8, 10, 12].includes(nextPc.hitDice.dieSize) ? nextPc.hitDice.dieSize : 8) as
        | 4
        | 6
        | 8
        | 10
        | 12;
      setLocalHitDice({ dieSize: ds, max: nextPc.hitDice.max, used: nextPc.hitDice.used });
    }
    setLocalAc(nextPc.ac);
    setLocalSpeed(nextPc.speed);
    setLocalInitMod(nextPc.initiativeMod);
    if (nextPc.spellSlots) {
      setLocalSpellSlots(normalizeToSpellSlotGroups(nextPc.spellSlots));
    }
    if (nextPc.pactSlots !== undefined) setLocalPactSlots(nextPc.pactSlots ?? null);
    if (nextPc.resourcePools) setLocalResourcePools(nextPc.resourcePools);
    if (nextPc.evaluation) setLocalEvaluation(nextPc.evaluation);

    const updates: Record<string, unknown> = {
      race: nextPc.race ?? '',
      background: nextPc.background ?? '',
      alignment: nextPc.alignment ?? '',
      'hp.current': nextPc.hp.current,
      'hp.max': nextPc.hp.max,
      'hp.temp': nextPc.hp.temp,
      hitDice: nextPc.hitDice,
      ac: nextPc.ac,
      speed: nextPc.speed,
      initiativeMod: nextPc.initiativeMod,
      abilities: nextPc.abilities,
      proficiencies: nextPc.proficiencies,
      skillExpertise: nextPc.skillExpertise ?? [],
      classes: nextPc.classes ?? [],
      spellSlots: nextPc.spellSlots ?? [],
      pactSlots: nextPc.pactSlots ?? null,
      resourcePools: nextPc.resourcePools ?? [],
      features: nextPc.features ?? [],
      attacks: nextPc.attacks ?? [],
      spellsKnown: nextPc.spellsKnown ?? [],
      spellcastingAbility: nextPc.spellcastingAbility ?? null,
      inventory: nextPc.inventory ?? [],
      ...(nextPc.evaluation ? { evaluation: nextPc.evaluation } : {}),
    };
    await sendBatchUpdate(updates);
    setWizardMode(null);
    setRestFeedback(
      wizardMode === 'levelUp'
        ? `Leveled up to Level ${nextPc.level}! Active HP damage, conditions & private notes preserved.`
        : `Created ${nextPc.name} (Level ${nextPc.level})!`,
    );
    setTimeout(() => setRestFeedback(null), 4500);
  };

  const handleUploadCharacterSheet = async (file: File) => {
    setSheetUploadError(null);
    setUploadingSheet(true);

    const prevLocalSnapshot = {
      hp: localHp,
      maxHp: localMaxHp,
      tempHp: localTempHp,
      hitDice: localHitDice,
      ac: localAc,
      speed: localSpeed,
      initMod: localInitMod,
      inspiration: localInspiration,
      exhaustion: localExhaustion,
      conditions: localConditions,
      spellSlots: localSpellSlots,
      pactSlots: localPactSlots,
      resourcePools: localResourcePools,
      evaluation: localEvaluation,
    };

    try {
      const { parseCharacterSheet } = await import('@/lib/characterSheetParser');
      const existingPc = buildCurrentPcForLifecycle();
      const res = await parseCharacterSheet(file, {
        existingPc: existingPc as any,
        targetPcId: pc.id,
        targetSlotId: slotId,
        shareToken: token,
      });

      const merged = res.pc;
      const nextHp = merged.hp?.current ?? localHp;
      const nextMaxHp = merged.hp?.max ?? localMaxHp;
      const nextTempHp = merged.hp?.temp ?? localTempHp;
      const nextHitDice = {
        dieSize: (merged.hitDice?.dieSize ?? localHitDice.dieSize) as 4 | 6 | 8 | 10 | 12,
        max: merged.hitDice?.max ?? localHitDice.max,
        used: merged.hitDice?.used ?? localHitDice.used,
      };
      const nextAc = merged.ac ?? localAc;
      const nextSpeed = merged.speed ?? localSpeed;
      const nextInitMod = merged.initiativeMod ?? localInitMod;
      const nextInspiration = Boolean(merged.inspiration ?? localInspiration);
      const nextExhaustion = merged.exhaustion ?? localExhaustion;
      const nextConditions = merged.conditions ?? localConditions;
      const nextSpellSlots: SpellSlotGroup[] = Array.isArray(merged.spellSlots)
        ? (merged.spellSlots as SpellSlotGroup[])
        : merged.spellSlots && typeof merged.spellSlots === 'object'
          ? Object.entries(merged.spellSlots)
              .filter(([k, v]) => !Number.isNaN(Number(k)) && v && typeof v === 'object')
              .map(([k, v]) => ({
                level: Number(k),
                max: Number((v as any).max ?? 0),
                used: Number((v as any).used ?? Math.max(0, Number((v as any).max ?? 0) - Number((v as any).current ?? 0))),
              }))
          : localSpellSlots;
      const nextPactSlots = merged.pactSlots ?? localPactSlots;
      const nextResourcePools = merged.resourcePools ?? localResourcePools;

      setLocalHp(nextHp);
      setLocalMaxHp(nextMaxHp);
      setLocalTempHp(nextTempHp);
      setLocalHitDice(nextHitDice);
      setLocalAc(nextAc);
      setLocalSpeed(nextSpeed);
      setLocalInitMod(nextInitMod);
      setLocalInspiration(nextInspiration);
      setLocalExhaustion(nextExhaustion);
      setLocalConditions(nextConditions);
      setLocalSpellSlots(nextSpellSlots);
      setLocalPactSlots(nextPactSlots);
      setLocalResourcePools(nextResourcePools);
      setLocalEvaluation(res.evaluation);

      const updates: Record<string, unknown> = {
        'hp.current': nextHp,
        'hp.max': nextMaxHp,
        'hp.temp': nextTempHp,
        hitDice: nextHitDice,
        ac: nextAc,
        speed: nextSpeed,
        initiativeMod: nextInitMod,
        inspiration: nextInspiration,
        exhaustion: nextExhaustion,
        conditions: nextConditions,
        spellSlots: nextSpellSlots,
        pactSlots: nextPactSlots,
        resourcePools: nextResourcePools,
        features: merged.features ?? [],
        attacks: merged.attacks ?? [],
        spellsKnown: merged.spellsKnown ?? [],
        spellcastingAbility: merged.spellcastingAbility ?? null,
        classes: merged.classes ?? [],
        race: merged.race ?? '',
        background: merged.background ?? '',
        alignment: merged.alignment ?? '',
        abilities: merged.abilities,
        proficiencies: merged.proficiencies,
        skillExpertise: merged.skillExpertise ?? [],
        resistances: merged.resistances ?? [],
        immunities: merged.immunities ?? [],
        senses: merged.senses ?? [],
        inventory: merged.inventory ?? [],
        attunedCount: merged.attunedCount ?? 0,
        currency: merged.currency,
        evaluation: res.evaluation,
      };

      await sendBatchUpdate(updates);

      setUploadToast({
        message: `${merged.name || pc.name || 'Character'} (Lv ${merged.level}) · Active HP & resources preserved`,
        evaluation: res.evaluation,
        onUndo: () => {
          setLocalHp(prevLocalSnapshot.hp);
          setLocalMaxHp(prevLocalSnapshot.maxHp);
          setLocalTempHp(prevLocalSnapshot.tempHp);
          setLocalHitDice(prevLocalSnapshot.hitDice);
          setLocalAc(prevLocalSnapshot.ac);
          setLocalSpeed(prevLocalSnapshot.speed);
          setLocalInitMod(prevLocalSnapshot.initMod);
          setLocalInspiration(prevLocalSnapshot.inspiration);
          setLocalExhaustion(prevLocalSnapshot.exhaustion);
          setLocalConditions(prevLocalSnapshot.conditions);
          setLocalSpellSlots(prevLocalSnapshot.spellSlots);
          setLocalPactSlots(prevLocalSnapshot.pactSlots);
          setLocalResourcePools(prevLocalSnapshot.resourcePools);
          setLocalEvaluation(prevLocalSnapshot.evaluation);
          void sendBatchUpdate({
            'hp.current': prevLocalSnapshot.hp,
            'hp.max': prevLocalSnapshot.maxHp,
            'hp.temp': prevLocalSnapshot.tempHp,
            hitDice: prevLocalSnapshot.hitDice,
            ac: prevLocalSnapshot.ac,
            speed: prevLocalSnapshot.speed,
            initiativeMod: prevLocalSnapshot.initMod,
            inspiration: prevLocalSnapshot.inspiration,
            exhaustion: prevLocalSnapshot.exhaustion,
            conditions: prevLocalSnapshot.conditions,
            spellSlots: prevLocalSnapshot.spellSlots,
            pactSlots: prevLocalSnapshot.pactSlots,
            resourcePools: prevLocalSnapshot.resourcePools,
            ...(prevLocalSnapshot.evaluation ? { evaluation: prevLocalSnapshot.evaluation } : {}),
          });
        },
      });
    } catch (err: any) {
      setSheetUploadError(err?.message || 'Failed to parse character sheet.');
    } finally {
      setUploadingSheet(false);
    }
  };

  const classesLabel = pc.classes?.length
    ? pc.classes.map((c) => `${c.name} ${c.level}`).join(' / ')
    : `Level ${pc.level ?? 1}`;

  const hitDiceRemaining = Math.max(0, localHitDice.max - localHitDice.used);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverCard(true);
      }}
      onDragLeave={() => setDragOverCard(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOverCard(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) void handleUploadCharacterSheet(file);
      }}
      className={`space-y-4 rounded-lg border p-4 shadow-md transition sm:p-5 ${
        dragOverCard ? 'border-emerald-500 bg-emerald-500/5' : 'border-rule bg-parchment'
      }`}
    >
      {/* Identity, Sheet Upload/Export & Rest Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
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
            <EvaluationReportBadge evaluation={localEvaluation ?? pc.evaluation} compact />
          </div>
          <p className="font-serif text-xs italic text-ink-mute">
            {[pc.race, classesLabel].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* Create / Level Up, Upload Sheet, Export Fillable PDF & 1-Tap Short/Long Rest Recovery Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWizardMode('create')}
            className="inline-flex items-center gap-1.5 rounded border border-wax/60 bg-wax/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-wax transition-colors hover:bg-wax/20"
            title="Guided Character Builder (from scratch)"
          >
            <Wand2 size={13} />
            Create Character
          </button>
          <button
            type="button"
            onClick={() => setWizardMode('levelUp')}
            className="inline-flex items-center gap-1.5 rounded border border-emerald-600/60 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20"
            title="1-Tap Level-Up Wizard (preserves active HP damage, conditions & private notes)"
          >
            <ArrowUpCircle size={13} />
            Level Up
          </button>
          <button
            type="button"
            onClick={() => sheetFileInputRef.current?.click()}
            disabled={uploadingSheet}
            className="inline-flex items-center gap-1.5 rounded border border-brass-deep/60 bg-brass/15 px-2.5 py-1.5 font-mono text-xs font-semibold text-brass-deep transition-colors hover:bg-brass/25 disabled:opacity-50"
            title="Upload or drop a Character Sheet (.pdf, .json, .png/.jpg) to evaluate and sync while preserving active HP & spent slots"
          >
            <FileUp size={13} />
            {uploadingSheet ? 'Evaluating…' : 'Upload Sheet'}
          </button>
          <input
            ref={sheetFileInputRef}
            type="file"
            accept=".pdf,.json,.png,.jpg,.jpeg,.webp,application/pdf,application/json,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleUploadCharacterSheet(file);
            }}
            className="hidden"
          />
          <ExportSheetPdfButton
            pc={buildCurrentPcForLifecycle() as any}
            mode="player"
          />
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

      <CharacterSheetUploadToast
        toast={uploadToast}
        onDismiss={() => setUploadToast(null)}
      />

      {sheetUploadError && (
        <div className="rounded border border-crimson/40 bg-crimson/10 px-3 py-1.5 font-serif text-xs text-crimson">
          {sheetUploadError}
        </div>
      )}

      {restFeedback && (
        <div className="rounded border border-forest/40 bg-forest/10 px-3 py-1.5 font-serif text-xs text-forest">
          {restFeedback}
        </div>
      )}

      {/* Automatic Concentration Check Prompt Toast/Banner */}
      {concentrationPrompt && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-500/15 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-700" />
              <div className="font-serif text-xs text-ink">
                <span className="font-bold">Concentration Check Required!</span> You took{' '}
                <span className="font-mono font-bold text-crimson">{concentrationPrompt.damage}</span> damage while concentrating on{' '}
                <span className="font-semibold text-amber-900">{concentrationPrompt.spellName}</span>.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!concentrationPrompt.rollResult ? (
                <button
                  type="button"
                  onClick={handleExecuteConcentrationSave}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-700 bg-amber-600 px-3 py-1 font-mono text-xs font-bold text-white shadow-sm hover:bg-amber-700"
                >
                  <Dice5 size={13} />
                  Roll Concentration Save (CON DC {concentrationPrompt.dc})
                </button>
              ) : (
                <span
                  className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                    concentrationPrompt.rollResult.passed
                      ? 'bg-emerald-500/20 text-emerald-800'
                      : 'bg-crimson/20 text-crimson'
                  }`}
                >
                  Rolled {concentrationPrompt.rollResult.roll.total} vs DC {concentrationPrompt.dc} (
                  {concentrationPrompt.rollResult.passed ? 'PASSED' : 'FAILED'})
                </span>
              )}
              <button
                type="button"
                onClick={() => setConcentrationPrompt(null)}
                className="rounded border border-emerald-600/60 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/25"
              >
                Keep Concentration
              </button>
              <button
                type="button"
                onClick={() => {
                  handleConcentrationChange('');
                  setConcentrationPrompt(null);
                }}
                className="rounded border border-crimson/60 bg-crimson/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-crimson hover:bg-crimson/25"
              >
                Drop Concentration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Spell Cast / Slot & Concentration Prompt */}
      {pendingSpellCast && (
        <div className="rounded-lg border border-wax/60 bg-wax/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="font-display text-xs font-bold uppercase tracking-wider text-wax">
                Cast Spell: {pendingSpellCast.name}{' '}
                {pendingSpellCast.level > 0 ? `(Level ${pendingSpellCast.level})` : '(Cantrip)'}
              </div>
              {pendingSpellCast.requiresConcentration && localConcentrationSpell && localConcentrationSpell !== pendingSpellCast.name && (
                <div className="flex items-center gap-1 font-serif text-xs text-amber-800">
                  <AlertTriangle size={12} />
                  Warning: Casting this spell will overwrite active concentration on{' '}
                  <span className="font-bold">{localConcentrationSpell}</span>!
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPendingSpellCast(null)}
              className="text-ink-faint hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pendingSpellCast.level > 0 &&
              getAvailableSpellSlotsForPc(buildCurrentPcForLifecycle(), pendingSpellCast.level).map((slotOpt) => (
                <button
                  key={`${slotOpt.kind}_${slotOpt.level}`}
                  type="button"
                  onClick={() =>
                    handleConfirmSpellCast(
                      { kind: slotOpt.kind, level: slotOpt.level },
                      pendingSpellCast.requiresConcentration,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-wax bg-wax px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-wax/90"
                >
                  <Flame size={12} /> Use {slotOpt.label}
                </button>
              ))}
            <button
              type="button"
              onClick={() =>
                handleConfirmSpellCast({ kind: 'none', level: 0 }, pendingSpellCast.requiresConcentration)
              }
              className="inline-flex items-center gap-1 rounded border border-rule bg-parchment px-2.5 py-1 font-mono text-xs font-semibold text-ink hover:bg-parchment-deep"
            >
              <Dice5 size={12} /> Roll Only (No Slot)
            </button>
          </div>
        </div>
      )}

      {/* Roll Modifier Pill Bar + Secret Roll Toggle + Last Roll Banner */}
      <div className="space-y-2 rounded-lg border border-brass-deep/40 bg-parchment-soft p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              <Dice5 size={12} /> Roll Mode:
            </span>
            {(['normal', 'advantage', 'disadvantage'] as RollMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRollMode(mode)}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  rollMode === mode
                    ? mode === 'advantage'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : mode === 'disadvantage'
                        ? 'border-crimson bg-crimson text-white'
                        : 'border-brass-deep bg-brass-deep text-white'
                    : 'border-rule bg-parchment text-ink-soft hover:bg-parchment-deep'
                }`}
              >
                {mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Advantage' : 'Disadvantage'}
              </button>
            ))}

            <span className="ml-1 font-mono text-[10px] text-ink-faint">Bonus:</span>
            {['+1d4', '+2'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSituationalBonus((prev) => (prev === preset ? '' : preset))}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                  situationalBonus === preset
                    ? 'border-gold-deep bg-gold/25 text-gold-deep'
                    : 'border-rule bg-parchment text-ink-soft hover:bg-parchment-deep'
                }`}
              >
                {preset}
              </button>
            ))}
            <input
              type="text"
              value={situationalBonus}
              onChange={(e) => setSituationalBonus(e.target.value)}
              placeholder="+1d6 / -2"
              aria-label="Custom Situational Roll Bonus"
              className="w-20 rounded border border-rule bg-parchment px-2 py-0.5 font-mono text-[10px] text-ink placeholder:text-ink-faint focus:border-wax focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setSecretRoll((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors ${
              secretRoll
                ? 'border-amber-600 bg-amber-500/20 text-amber-900 shadow-sm'
                : 'border-rule bg-parchment text-ink-soft hover:text-ink'
            }`}
            title="When enabled, rolls stay 100% in local client state and NEVER enter pcWritebacks or Firestore"
          >
            {secretRoll ? <Lock size={11} /> : <Unlock size={11} />}
            {secretRoll ? '🔒 Secret Roll (Local Only)' : 'Public Table Roll'}
          </button>
        </div>

        {lastRollBanner && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-1.5 font-mono text-xs ${
              lastRollBanner.crit === 'nat20'
                ? 'border-emerald-600 bg-emerald-500/15 text-emerald-900'
                : lastRollBanner.crit === 'nat1'
                  ? 'border-crimson bg-crimson/15 text-crimson'
                  : 'border-rule bg-parchment text-ink'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{lastRollBanner.label}:</span>
              <span className="text-base font-extrabold">{lastRollBanner.total}</span>
              {lastRollBanner.crit === 'nat20' && (
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  ★ NATURAL 20!
                </span>
              )}
              {lastRollBanner.crit === 'nat1' && (
                <span className="rounded bg-crimson px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  ☠ NATURAL 1!
                </span>
              )}
              {lastRollBanner.secretRoll && (
                <span className="rounded border border-amber-600/50 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  🔒 Secret (Local Only)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink-soft">
              <span>{lastRollBanner.breakdown}</span>
              <button
                type="button"
                onClick={() => setLastRollBanner(null)}
                className="text-ink-faint hover:text-ink"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Combat Stats Row: AC, Speed, Initiative (1-tap roll), Hit Dice (1-tap roll) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="flex flex-col justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              <Shield size={12} className="text-wax" /> AC
            </span>
            <div className="flex items-center gap-1.5">
              {effectiveStats.acDelta !== 0 && (
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    effectiveStats.acDelta > 0
                      ? 'bg-emerald-500/20 text-emerald-800'
                      : 'bg-crimson/20 text-crimson'
                  }`}
                  title={effectiveStats.acReasons.join(', ')}
                >
                  Eff {effectiveStats.effectiveAc} ({effectiveStats.acDelta > 0 ? `+${effectiveStats.acDelta}` : effectiveStats.acDelta})
                </span>
              )}
              <input
                type="number"
                value={localAc}
                onChange={(e) => setLocalAc(parseInt(e.target.value, 10) || 0)}
                onBlur={() => handleAcChange(localAc)}
                aria-label="Armor Class"
                className="w-12 border-b border-rule bg-transparent text-right font-display text-base font-bold text-ink focus:border-wax focus:outline-none"
              />
            </div>
          </div>
          {effectiveStats.acReasons.length > 0 && (
            <div className="mt-1 truncate font-mono text-[9px] text-emerald-800">
              {effectiveStats.acReasons.join(' · ')}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              <Footprints size={12} className="text-gold-deep" /> Speed
            </span>
            <div className="flex items-center gap-1">
              {effectiveStats.speedDelta !== 0 && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                  {effectiveStats.effectiveSpeed} ft
                </span>
              )}
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
          {effectiveStats.speedReasons.length > 0 && (
            <div className="mt-1 truncate font-mono text-[9px] text-amber-900">
              [{effectiveStats.speedReasons.join(', ')}]
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded border border-rule bg-parchment-soft px-3 py-2">
          <button
            type="button"
            onClick={handleRollInitiative}
            className="flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-gold-deep transition-colors hover:bg-gold/20"
            title="1-Tap Roll Initiative"
          >
            <Zap size={12} className="text-gold-deep" /> Roll Init 🎲
          </button>
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
          <button
            type="button"
            onClick={handleRollHitDie}
            disabled={hitDiceRemaining <= 0}
            className="flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-wax transition-colors hover:bg-wax/15 disabled:opacity-40"
            title="1-Tap Roll Hit Die + CON mod and heal HP"
          >
            <Dice5 size={12} className="text-wax" /> Roll HD 🎲
          </button>
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
        {/* HP Panel + Active Concentration Input */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              <Heart size={12} className="text-crimson" /> Hit Points
            </div>
            {localConcentrationSpell && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] font-semibold text-amber-900">
                🎯 {localConcentrationSpell}
                <button
                  type="button"
                  onClick={() => handleConcentrationChange('')}
                  title="Drop Concentration"
                  className="hover:text-crimson"
                >
                  <X size={10} />
                </button>
              </span>
            )}
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
          <div className="flex items-center gap-1.5 border-t border-rule/50 pt-1.5">
            <span className="font-mono text-[9px] uppercase text-ink-faint">Concentrating:</span>
            <input
              type="text"
              value={localConcentrationSpell}
              onChange={(e) => setLocalConcentrationSpell(e.target.value)}
              onBlur={() => handleConcentrationChange(localConcentrationSpell)}
              placeholder="None (e.g. Bless, Hex)"
              className="flex-1 border-b border-rule bg-transparent px-1 py-0.5 font-serif text-xs text-ink focus:border-wax focus:outline-none"
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

        {/* Death Saves Panel with 1-Tap Roll Button */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="flex items-center justify-between">
            <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              Death Saves
            </div>
            <button
              type="button"
              onClick={handleRollDeathSave}
              className="inline-flex items-center gap-1 rounded border border-crimson/50 bg-crimson/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-crimson hover:bg-crimson/20"
              title="1-Tap Roll Death Saving Throw"
            >
              <Dice5 size={11} /> Roll Death Save
            </button>
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

      {/* Active Buffs & Dynamic Condition Stat Engine */}
      <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              Active Buffs & Spells
            </span>
            {effectiveStats.summaryBadges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {effectiveStats.summaryBadges.map((badge, i) => (
                  <span
                    key={i}
                    className="rounded border border-emerald-600/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-800"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCustomBuffForm((v) => !v)}
            className="font-mono text-[10px] text-brass-deep hover:underline"
          >
            {showCustomBuffForm ? 'Cancel' : '+ Custom Buff'}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESET_BUFFS.map((preset) => {
            const isActive = localActiveBuffs.some(
              (b) => b.id === preset.id || b.id.startsWith(`${preset.id}_`),
            );
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleTogglePresetBuff(preset.id)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  isActive
                    ? 'border-emerald-600 bg-emerald-500/20 font-bold text-emerald-900 shadow-sm'
                    : 'border-rule bg-parchment text-ink-soft hover:bg-parchment-deep'
                }`}
              >
                {preset.name}
              </button>
            );
          })}
          {localActiveBuffs
            .filter((b) => !PRESET_BUFFS.some((p) => p.id === b.id || b.id.startsWith(`${p.id}_`)))
            .map((custom) => (
              <span
                key={custom.id}
                className="inline-flex items-center gap-1 rounded border border-gold-deep bg-gold/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-gold-deep"
              >
                {custom.name}
                <button
                  type="button"
                  onClick={() => handleRemoveBuff(custom.id)}
                  className="hover:text-crimson"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
        </div>

        {showCustomBuffForm && (
          <div className="flex flex-wrap items-center gap-1.5 rounded border border-rule bg-parchment p-2 text-xs">
            <input
              type="text"
              value={customBuffName}
              onChange={(e) => setCustomBuffName(e.target.value)}
              placeholder="Buff name (e.g. Shield of Faith)"
              className="min-w-[140px] flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
            />
            <input
              type="number"
              value={customBuffAc}
              onChange={(e) => setCustomBuffAc(parseInt(e.target.value, 10) || 0)}
              placeholder="+AC"
              title="AC Bonus"
              className="w-14 rounded border border-rule bg-parchment-soft px-1.5 py-1 text-center font-mono text-xs text-ink"
            />
            <input
              type="text"
              value={customBuffAttack}
              onChange={(e) => setCustomBuffAttack(e.target.value)}
              placeholder="Atk (+1d4)"
              className="w-20 rounded border border-rule bg-parchment-soft px-1.5 py-1 font-mono text-xs text-ink"
            />
            <input
              type="text"
              value={customBuffSave}
              onChange={(e) => setCustomBuffSave(e.target.value)}
              placeholder="Save (+1d4)"
              className="w-20 rounded border border-rule bg-parchment-soft px-1.5 py-1 font-mono text-xs text-ink"
            />
            <select
              value={customBuffExpiry}
              onChange={(e) => setCustomBuffExpiry(e.target.value as BuffExpiryTrigger)}
              className="rounded border border-rule bg-parchment-soft px-1.5 py-1 font-mono text-[10px] text-ink"
            >
              <option value="turn">Expires: Turn</option>
              <option value="round">Expires: Round</option>
              <option value="shortRest">Expires: Short Rest</option>
              <option value="longRest">Expires: Long Rest</option>
            </select>
            <button
              type="button"
              onClick={handleAddCustomBuff}
              className="rounded border border-wax bg-wax px-2.5 py-1 font-mono text-[10px] font-semibold text-white"
            >
              Add Buff
            </button>
          </div>
        )}
      </div>

      {/* 1-Tap Weapon/Spell Attacks, Spells Known & Class Features */}
      {((pc.attacks && pc.attacks.length > 0) ||
        (pc.spellsKnown && pc.spellsKnown.length > 0) ||
        (pc.features && pc.features.length > 0)) && (
        <div className="grid gap-3 md:grid-cols-2">
          {/* Weapon & Spell Attacks */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
            <div className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              <Swords size={12} className="text-crimson" /> 1-Tap Attacks & Damage
            </div>
            {(!pc.attacks || pc.attacks.length === 0) ? (
              <p className="font-serif text-xs italic text-ink-faint">No attacks listed on sheet.</p>
            ) : (
              <div className="space-y-1.5">
                {pc.attacks.map((atk, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-parchment px-2.5 py-1.5"
                  >
                    <div>
                      <span className="font-serif text-xs font-semibold text-ink">{atk.name}</span>
                      {atk.damageType && (
                        <span className="ml-1.5 font-mono text-[9px] uppercase text-ink-faint">
                          {atk.damageType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRollAttack(atk)}
                        className="inline-flex items-center gap-1 rounded border border-wax/60 bg-wax/10 px-2 py-0.5 font-mono text-[10px] font-bold text-wax hover:bg-wax/20"
                        title={`Roll ${atk.name} Attack`}
                      >
                        🎲 Hit {atk.attackBonus >= 0 ? `+${atk.attackBonus}` : atk.attackBonus}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRollDamage(atk, false)}
                        className="inline-flex items-center gap-1 rounded border border-crimson/50 bg-crimson/10 px-2 py-0.5 font-mono text-[10px] font-bold text-crimson hover:bg-crimson/20"
                        title={`Roll ${atk.name} Damage (${atk.damage})`}
                      >
                        💥 {atk.damage}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spells & Limited-Use Class Features */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
            <div className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              <Wand2 size={12} className="text-wax" /> Smart Spells & Class Features
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(pc.spellsKnown ?? []).map((spell, idx) => (
                <button
                  key={`spell_${idx}`}
                  type="button"
                  onClick={() => handleInitiateSpellCast(spell)}
                  className="inline-flex items-center gap-1 rounded border border-wax/50 bg-parchment px-2 py-1 font-serif text-xs text-ink transition-colors hover:border-wax hover:bg-wax/10"
                  title="Cast spell (prompts for Spell Slot / Concentration)"
                >
                  <Flame size={11} className="text-wax" /> {spell}
                </button>
              ))}
              {(pc.features ?? []).map((feat, idx) => (
                <button
                  key={`feat_${idx}`}
                  type="button"
                  onClick={() => handleRollAndUseFeature(feat, Boolean(feat.uses || localResourcePools.some((p) => p.name.toLowerCase() === feat.name.toLowerCase())))}
                  className="inline-flex items-center gap-1 rounded border border-gold-deep/50 bg-parchment px-2 py-1 font-serif text-xs text-ink transition-colors hover:border-gold-deep hover:bg-gold/15"
                  title="Roll & expend class feature charge"
                >
                  <Sparkles size={11} className="text-gold-deep" /> {feat.name}
                  {feat.uses ? ` (${feat.uses.current}/${feat.uses.max})` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* 1-Tap Click-to-Roll Ability Scores, Saving Throws & Skills */}
      <details open className="group border-t border-rule pt-2">
        <summary className="flex cursor-pointer select-none items-center justify-between font-display text-[10px] uppercase tracking-wider text-ink-mute hover:text-ink">
          <span>1-Tap Ability Checks, Saving Throws & Skills</span>
          <span className="font-serif text-[9px] text-ink-faint">(Click any stat or skill to roll)</span>
        </summary>
        <div className="animate-fade-in mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="font-display text-[9px] font-semibold uppercase tracking-wider text-brass-deep">
              Ability Checks & Saving Throws
            </div>
            <div className="grid grid-cols-3 gap-1.5 rounded border border-rule bg-parchment-soft p-2">
              {ABILITY_KEYS.map((a) => {
                const abilKey = a as AbilityKey;
                const score = pc.abilities?.[a] ?? 10;
                const checkMod = effectiveStats.abilityModifiers[abilKey];
                const saveMod = effectiveStats.savingThrowModifiers[abilKey];
                const isSaveProf = pc.proficiencies?.savingThrows?.some(
                  (s) => s.toLowerCase() === a.toLowerCase(),
                );
                return (
                  <div
                    key={a}
                    className="flex flex-col items-center justify-between rounded border border-rule/70 bg-parchment p-1.5 text-center"
                  >
                    <div className="font-display text-[9px] font-bold uppercase text-brass-deep">{a}</div>
                    <div className="font-serif text-sm font-semibold text-ink">{score}</div>
                    <div className="mt-1 flex w-full flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleRollAbility(abilKey)}
                        className="w-full rounded border border-rule bg-parchment-soft px-1 py-0.5 font-mono text-[9px] font-semibold text-ink hover:border-wax hover:bg-wax/10"
                        title={`Roll ${a.toUpperCase()} Check`}
                      >
                        Chk {checkMod >= 0 ? `+${checkMod}` : checkMod}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRollSave(abilKey)}
                        className={`w-full rounded border px-1 py-0.5 font-mono text-[9px] font-semibold transition-colors ${
                          isSaveProf
                            ? 'border-crimson/50 bg-crimson/10 text-crimson hover:bg-crimson/20'
                            : 'border-rule bg-parchment-soft text-ink-soft hover:border-crimson/40'
                        }`}
                        title={`Roll ${a.toUpperCase()} Saving Throw`}
                      >
                        Save {saveMod >= 0 ? `+${saveMod}` : saveMod}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-display text-[9px] font-semibold uppercase tracking-wider text-brass-deep">
                1-Tap Skills
              </span>
              <span className="font-mono text-[9px] text-ink-faint">
                Prof Bonus: +{pc.proficiencyBonus ?? 2}
              </span>
            </div>
            <div className="grid max-h-52 grid-cols-2 gap-1 overflow-y-auto rounded border border-rule bg-parchment-soft p-2">
              {SKILL_DEFINITIONS.map((sk) => {
                const mod = effectiveStats.skillModifiers[sk.name] ?? 0;
                const isProf = pc.proficiencies?.skills?.some(
                  (s) => s.toLowerCase() === sk.name.toLowerCase(),
                );
                return (
                  <button
                    key={sk.name}
                    type="button"
                    onClick={() => handleRollSkill(sk.name)}
                    className={`flex items-center justify-between rounded border px-2 py-1 text-left font-serif text-[11px] transition-colors ${
                      isProf
                        ? 'border-gold-deep/50 bg-gold/15 font-semibold text-ink hover:bg-gold/25'
                        : 'border-rule/60 bg-parchment text-ink-soft hover:bg-parchment-deep'
                    }`}
                  >
                    <span className="truncate">{sk.name}</span>
                    <span className="ml-1 font-mono text-[10px] font-bold text-crimson">
                      {mod >= 0 ? `+${mod}` : mod}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </details>

      {/* Guided Character Builder / 1-Tap Level-Up Wizard Modal */}
      {wizardMode && (
        <CharacterWizardModal
          isOpen={true}
          mode={wizardMode}
          existingPc={wizardMode === 'levelUp' ? buildCurrentPcForLifecycle() : undefined}
          onClose={() => setWizardMode(null)}
          onCommit={(nextPc) => void handleCommitCharacterWizard(nextPc)}
        />
      )}
    </div>
  );
}
