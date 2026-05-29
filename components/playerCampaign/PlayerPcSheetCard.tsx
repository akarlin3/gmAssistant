'use client';

// The player's editable PC sheet. Players may edit a small allowlisted set of
// fields (HP, temp HP, conditions, exhaustion, death saves, notes, and the
// goals/bonds/ideals/flaws lists); edits are staged via submitPlayerUpdate and
// reconciled into the CRDT by the GM. Extracted verbatim from
// PlayerCampaignView — behavior (including the optimistic pending-writeback
// guard) is preserved exactly.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { X, Plus, Heart } from 'lucide-react';
import { submitPlayerUpdate } from '@/lib/playerMode/playerClient';
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

function loadStagedEdits(campaignId: string, pcId: string): StagedEditsMap {
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

function saveStagedEdit(campaignId: string, pcId: string, field: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadStagedEdits(campaignId, pcId);
    current[field] = { value, timestamp: Date.now() };
    window.localStorage.setItem(getStorageKey(campaignId, pcId), JSON.stringify(current));
  } catch {
    /* localStorage disabled or full */
  }
}

function clearStagedEdit(campaignId: string, pcId: string, field: string) {
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
  // Load staged edits to overlay on the loaded projection
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

  const [localHp, setLocalHp] = useState<number>(() => getInitialValue('hp.current', pc.hp?.current ?? 0));
  const [localTempHp, setLocalTempHp] = useState<number>(() => getInitialValue('hp.temp', pc.hp?.temp ?? 0));
  const [localNotes, setLocalNotes] = useState<string>(() => getInitialValue('notes', pc.notes ?? ''));
  const [localExhaustion, setLocalExhaustion] = useState<number>(() => getInitialValue('exhaustion', pc.exhaustion ?? 0));
  const [localDeathSaves, setLocalDeathSaves] = useState<{ successes: number; failures: number }>(() => {
    const successes = getInitialValue('deathSaves.successes', pc.deathSaves?.successes ?? 0);
    const failures = getInitialValue('deathSaves.failures', pc.deathSaves?.failures ?? 0);
    return { successes, failures };
  });
  const [localConditions, setLocalConditions] = useState<string[]>(() => getInitialValue('conditions', pc.conditions ?? []));

  // Track writebacks we've sent but haven't seen reflected in the projection
  // yet. Without this, an unrelated projection republish (e.g. music sync
  // anchor, GM editing an NPC) that fires before the writeback → reconciler →
  // CRDT autosave → republish round-trip completes carries the pre-edit value
  // and silently reverts the player's optimistic UI. Each entry is cleared
  // once the projection catches up; the 10s fallback covers the case where
  // the GM is offline or the value was rejected.
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
    if (!isPending('hp.temp', tempHp)) {
      setLocalTempHp(tempHp);
      clearStagedEdit(campaignId, pc.id, 'hp.temp');
    }
  }, [tempHp, campaignId, pc.id]);

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

  return (
    <div className="space-y-4 rounded-lg border border-rule bg-parchment p-4 shadow-md sm:p-5">
      {/* Identity Summary */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rule pb-3">
        <div>
          <h3 className="font-display text-xl font-semibold tracking-wide text-ink">{pc.name || 'Unnamed Character'}</h3>
          <p className="font-serif text-xs italic text-ink-mute">
            {[pc.race, classesLabel].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3 font-serif text-xs">
          <div className="flex items-center gap-1 rounded border border-rule bg-parchment-deep px-2.5 py-1">
            <span className="font-semibold text-ink">AC:</span>
            <span className="font-display font-medium text-crimson">{pc.ac ?? 10}</span>
          </div>
          <div className="flex items-center gap-1 rounded border border-rule bg-parchment-deep px-2.5 py-1">
            <span className="font-semibold text-ink">Speed:</span>
            <span className="text-ink-soft">{pc.speed ?? 30} ft.</span>
          </div>
        </div>
      </div>

      {/* HP and Vitality Dashboard */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* HP Panel */}
        <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
          <div className="flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            <Heart size={12} className="text-crimson" /> Hit Points
          </div>
          <div className="flex items-center justify-between gap-1.5">
            <button
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
                className="w-12 border-b border-rule bg-transparent text-center font-display text-lg text-ink focus:border-crimson focus:outline-none"
              />
              <span className="text-ink-mute">/</span>
              <span className="font-display text-ink-soft">{pc.hp?.max ?? 0}</span>
            </div>
            <button
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
                    onClick={() => handleRemoveListItem(field, idx)}
                    className="text-ink-mute opacity-0 transition-opacity hover:text-crimson group-hover:opacity-100"
                    aria-label={`Remove ${field} item`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
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
          Personal Notes
        </div>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Freeform character notes (session logs, inventory lists, sidekick stats...)"
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
