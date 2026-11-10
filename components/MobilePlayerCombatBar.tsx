'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Dices,
  Download,
  Heart,
  Lock,
  QrCode,
  Shield,
  Sparkles,
  Swords,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  computeEffectiveCharacterStats,
  type RollMode,
} from '@/lib/activeModifiers';
import {
  rollAbilityCheck,
  rollInitiativeCheck,
  rollSavingThrow,
  rollWeaponOrSpellAttack,
} from '@/lib/diceRoller';
import {
  ABILITY_NAMES,
  SPELL_SLOT_LEVELS,
  type PlayerCharacter,
  type RollEvent,
  type SpellSlotLevel,
} from '@/lib/pc/types';
import {
  buildSyncHandoffUrl,
  decryptPlayerSyncCapsule,
  encryptPlayerSyncCapsule,
  generateClientQrMatrix,
  serializeCapsuleFile,
  type PlayerSyncCapsulePayload,
} from '@/lib/playerSyncCapsule';
import type { PlayerTrackerState } from '@/lib/playerMode/playerTrackerStorage';

// ---- 1. Thumb-Zone Mobile Combat & Quick-Action Bottom Sheet (<768px) ------

export interface MobilePlayerCombatBarProps {
  pc: PlayerCharacter | Record<string, unknown>;
  isMyTurn?: boolean;
  isOnDeck?: boolean;
  rollMode?: RollMode;
  secretRoll?: boolean;
  onToggleSecretRoll?: () => void;
  onChangeRollMode?: (mode: RollMode) => void;
  onApplyHpChange: (nextCurrentHp: number, damageTakenDelta: number) => void;
  onRollEvent: (event: RollEvent) => void;
  onUpdatePc: (patch: Record<string, unknown>) => void;
}

export function MobilePlayerCombatBar({
  pc: rawPc,
  isMyTurn = false,
  isOnDeck = false,
  rollMode = 'normal',
  secretRoll = false,
  onToggleSecretRoll,
  onChangeRollMode,
  onApplyHpChange,
  onRollEvent,
  onUpdatePc,
}: MobilePlayerCombatBarProps) {
  const pc = rawPc as PlayerCharacter & {
    currentHp?: number;
    maxHp?: number;
    tempHp?: number;
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hpKeypadOpen, setHpKeypadOpen] = useState(false);
  const [customHpAmount, setCustomHpAmount] = useState('5');

  const effective = computeEffectiveCharacterStats(pc);
  const currentHp =
    typeof pc.currentHp === 'number' ? pc.currentHp : (pc.hp?.current ?? 0);
  const maxHp =
    effective.effectiveMaxHp ||
    (typeof pc.maxHp === 'number' ? pc.maxHp : pc.hp?.max) ||
    1;
  const tempHp =
    typeof pc.tempHp === 'number' ? pc.tempHp : (pc.hp?.temp ?? 0);

  const adjustHp = (delta: number) => {
    const next = Math.max(0, Math.min(maxHp, currentHp + delta));
    const damageDelta = delta < 0 ? Math.abs(delta) : 0;
    onApplyHpChange(next, damageDelta);
  };

  const toggleTurnEconomy = (
    key: 'action' | 'bonusAction' | 'movement' | 'reaction' | 'freeInteraction'
  ) => {
    const cur = pc.turnEconomy ?? {};
    onUpdatePc({
      turnEconomy: {
        ...cur,
        [key]: !cur[key],
      },
    });
  };

  const toggleSpellSlotPip = (level: SpellSlotLevel) => {
    if (Array.isArray(pc.spellSlots)) {
      const next = (
        pc.spellSlots as unknown as Array<{
          level: number;
          max: number;
          used: number;
        }>
      ).map((s) =>
        s.level === level
          ? { ...s, used: s.used < s.max ? s.used + 1 : 0 }
          : s
      );
      onUpdatePc({ spellSlots: next });
      return;
    }
    const slot = pc.spellSlots?.[level];
    if (!slot) return;
    const nextUsed = slot.used < slot.max ? slot.used + 1 : 0;
    onUpdatePc({
      spellSlots: {
        ...(pc.spellSlots ?? {}),
        [level]: { ...slot, used: nextUsed },
      },
    });
  };

  const toggleResourcePoolPip = (poolId: string) => {
    if (!pc.resourcePools) return;
    onUpdatePc({
      resourcePools: pc.resourcePools.map((p) =>
        p.id === poolId
          ? { ...p, current: p.current > 0 ? p.current - 1 : p.max }
          : p
      ),
    });
  };

  return (
    <div
      data-testid="mobile-player-combat-bar"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-2xl"
    >
      {/* Quick HP Keypad Popover */}
      {hpKeypadOpen && (
        <div className="border-b border-zinc-800 bg-zinc-900/95 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustHp(-5)}
              className="rounded bg-rose-950/80 border border-rose-500/40 px-2.5 py-1 font-bold text-rose-200"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => adjustHp(-1)}
              className="rounded bg-rose-950/80 border border-rose-500/40 px-2.5 py-1 font-bold text-rose-200"
            >
              -1
            </button>
            <input
              type="number"
              min={1}
              max={999}
              value={customHpAmount}
              onChange={(e) => setCustomHpAmount(e.target.value)}
              className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-center font-mono text-zinc-100"
            />
            <button
              type="button"
              onClick={() => adjustHp(-(parseInt(customHpAmount, 10) || 1))}
              className="rounded bg-rose-600 px-2.5 py-1 font-bold text-white"
            >
              Dmg
            </button>
            <button
              type="button"
              onClick={() => adjustHp(parseInt(customHpAmount, 10) || 1)}
              className="rounded bg-emerald-600 px-2.5 py-1 font-bold text-white"
            >
              Heal
            </button>
            <button
              type="button"
              onClick={() => adjustHp(1)}
              className="rounded bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 font-bold text-emerald-200"
            >
              +1
            </button>
          </div>
          <button
            type="button"
            onClick={() => setHpKeypadOpen(false)}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Swipe-Up / Tap Quick-Action Drawer */}
      {drawerOpen && (
        <div className="max-h-[62vh] overflow-y-auto border-b border-zinc-800 bg-zinc-900/95 p-3 space-y-3 text-xs">
          {/* Roll Mode & Secret Roll Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeRollMode?.(m)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                    rollMode === m
                      ? m === 'advantage'
                        ? 'bg-emerald-600 text-white'
                        : m === 'disadvantage'
                          ? 'bg-rose-600 text-white'
                          : 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Adv' : 'Dis'}
                </button>
              ))}
            </div>
            {onToggleSecretRoll && (
              <button
                type="button"
                onClick={onToggleSecretRoll}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  secretRoll
                    ? 'border-amber-500/60 bg-amber-950/60 text-amber-200'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                <Lock className="h-3 w-3" />
                {secretRoll ? '🔒 Secret Roll' : 'Public Roll'}
              </button>
            )}
          </div>

          {/* 1-Tap Ability Check & Save Grid */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Quick Tap Checks &amp; Saves
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ABILITY_NAMES.map((ab) => {
                const checkMod = effective.abilityChecks[ab].effectiveMod;
                const saveMod = effective.savingThrows[ab].effectiveMod;
                return (
                  <div
                    key={ab}
                    className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-2 py-1"
                  >
                    <span className="font-bold text-zinc-200">{ab}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onRollEvent(
                            rollAbilityCheck(pc, ab, { rollMode, secretRoll })
                          )
                        }
                        className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 hover:bg-indigo-950"
                      >
                        Chk {checkMod >= 0 ? `+${checkMod}` : checkMod}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onRollEvent(
                            rollSavingThrow(pc, ab, { rollMode, secretRoll })
                          )
                        }
                        className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 hover:bg-amber-950"
                      >
                        Sav {saveMod >= 0 ? `+${saveMod}` : saveMod}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Attacks */}
          {pc.attacks && pc.attacks.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Weapons &amp; Spell Attacks
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pc.attacks.map((atk) => (
                  <button
                    key={atk.id}
                    type="button"
                    onClick={() =>
                      onRollEvent(
                        rollWeaponOrSpellAttack(pc, atk, { rollMode, secretRoll })
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1 text-xs font-medium text-rose-200"
                  >
                    <Swords className="h-3 w-3" />
                    {atk.name} ({atk.attackBonus >= 0 ? `+${atk.attackBonus}` : atk.attackBonus})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Economy Checkboxes */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              My Turn Action Economy
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['action', 'Action'],
                  ['bonusAction', 'Bonus Action'],
                  ['movement', 'Movement'],
                  ['reaction', 'Reaction'],
                  ['freeInteraction', 'Object'],
                ] as const
              ).map(([key, label]) => {
                const used = Boolean(pc.turnEconomy?.[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTurnEconomy(key)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                      used
                        ? 'border-zinc-700 bg-zinc-800/60 text-zinc-500 line-through'
                        : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                    }`}
                  >
                    {used ? '✓ ' : '○ '}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spell Slots & Class Resource Pips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pc.spellSlots && Object.keys(pc.spellSlots).length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Spell Slots (Tap to Spend/Reset)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SPELL_SLOT_LEVELS.map((lvl) => {
                    const slot = Array.isArray(pc.spellSlots)
                      ? (
                          pc.spellSlots as unknown as Array<{
                            level: number;
                            max: number;
                            used: number;
                          }>
                        ).find((s) => s.level === lvl)
                      : pc.spellSlots?.[lvl];
                    if (!slot || slot.max <= 0) return null;
                    const rem = Math.max(0, slot.max - slot.used);
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => toggleSpellSlotPip(lvl)}
                        className="rounded border border-indigo-500/30 bg-indigo-950/30 px-2 py-1 text-[11px] font-mono text-indigo-200"
                      >
                        L{lvl}: {rem}/{slot.max}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {pc.resourcePools && pc.resourcePools.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Class Resources
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pc.resourcePools.map((pool) => (
                    <button
                      key={pool.id}
                      type="button"
                      onClick={() => toggleResourcePoolPip(pool.id)}
                      className="rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[11px] font-mono text-amber-200"
                    >
                      {pool.name}: {pool.current}/{pool.max}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent Bottom HUD Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {/* Live HP Pill */}
        <button
          type="button"
          onClick={() => setHpKeypadOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-xs font-bold text-rose-100"
        >
          <Heart className="h-3.5 w-3.5 text-rose-400" />
          <span>
            {currentHp}/{maxHp}
          </span>
          {tempHp > 0 && <span className="text-sky-300">+{tempHp}</span>}
        </button>

        {/* Effective AC Pill */}
        <div
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-100"
          title={effective.acSummary}
        >
          <Shield className="h-3.5 w-3.5 text-indigo-400" />
          <span>AC {effective.effectiveAc}</span>
          {effective.acDelta !== 0 && (
            <span className="text-[10px] text-emerald-400">
              ({effective.acDelta > 0 ? `+${effective.acDelta}` : effective.acDelta})
            </span>
          )}
        </div>

        {/* Turn / Concentration Pill */}
        <div className="flex items-center gap-1 min-w-0">
          {isMyTurn ? (
            <span className="truncate rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold text-zinc-950 animate-pulse">
              ⚔️ Your Turn!
            </span>
          ) : isOnDeck ? (
            <span className="truncate rounded-full border border-amber-500/50 bg-amber-950/60 px-2.5 py-1 text-[11px] font-bold text-amber-200">
              ⏳ On Deck
            </span>
          ) : pc.concentrationSpell ? (
            <span className="truncate rounded-full border border-purple-500/50 bg-purple-950/50 px-2.5 py-1 text-[11px] font-medium text-purple-200">
              🎯 {pc.concentrationSpell}
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                onRollEvent(rollInitiativeCheck(pc, { rollMode, secretRoll }))
              }
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-mono text-zinc-300"
            >
              <Zap className="h-3 w-3 text-amber-400" />
              Init {effective.initiativeMod >= 0 ? `+${effective.initiativeMod}` : effective.initiativeMod}
            </button>
          )}
        </div>

        {/* Drawer Toggle Button */}
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white"
        >
          <Dices className="h-3.5 w-3.5" />
          <span>Actions</span>
          {drawerOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ---- 2. Collapsible Shared Table Roll Feed ---------------------------------

export interface CollapsibleTableRollFeedProps {
  publicRolls?: readonly RollEvent[];
  rolls?: readonly RollEvent[];
  secretRolls?: readonly RollEvent[];
  currentPcId?: string;
  title?: string;
  onClearSecretRolls?: () => void;
  defaultOpen?: boolean;
}

export function CollapsibleTableRollFeed({
  publicRolls,
  rolls,
  secretRolls = [],
  title,
  onClearSecretRolls,
  defaultOpen = false,
}: CollapsibleTableRollFeedProps) {
  const [open, setOpen] = useState(defaultOpen);
  const baseRolls = publicRolls ?? rolls ?? [];
  const combined = [...baseRolls, ...secretRolls]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);

  const latestRoll = combined[0];

  return (
    <div
      data-testid="table-roll-feed"
      className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-zinc-800/50 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Dices className="h-4 w-4 text-indigo-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            {title || 'Table Roll Feed'} ({combined.length})
          </span>
          {latestRoll && (
            <span className="truncate text-xs text-zinc-400">
              Latest: <strong className="text-zinc-200">{latestRoll.actorName}</strong> •{' '}
              {latestRoll.label} ={' '}
              <strong
                className={
                  latestRoll.crit === 'nat20'
                    ? 'text-emerald-400'
                    : latestRoll.crit === 'nat1'
                      ? 'text-rose-400'
                      : 'text-amber-300'
                }
              >
                {latestRoll.total}
              </strong>
              {latestRoll.crit === 'nat20' && ' (NAT 20!)'}
              {latestRoll.crit === 'nat1' && ' (NAT 1!)'}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-2 max-h-64 overflow-y-auto">
          {combined.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-2">
              No rolls recorded yet. Tap any ability, save, skill, attack, or damage formula on your sheet to roll!
            </p>
          ) : (
            combined.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                  r.crit === 'nat20'
                    ? 'border-emerald-500/50 bg-emerald-950/30'
                    : r.crit === 'nat1'
                      ? 'border-rose-500/50 bg-rose-950/30'
                      : r.secretRoll
                        ? 'border-amber-500/30 bg-amber-950/20'
                        : 'border-zinc-800 bg-zinc-950/70'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.secretRoll && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        🔒 Secret (Local Only)
                      </span>
                    )}
                    <span className="font-bold text-zinc-100">{r.actorName}</span>
                    <span className="text-zinc-400">rolled</span>
                    <span className="font-semibold text-indigo-300">{r.label}</span>
                    {r.crit === 'nat20' && (
                      <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-extrabold text-zinc-950">
                        NAT 20!
                      </span>
                    )}
                    {r.crit === 'nat1' && (
                      <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        NAT 1!
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400 truncate">
                    {r.formula} → {r.breakdown}
                  </div>
                </div>
                <div
                  className={`text-base font-extrabold font-mono shrink-0 ${
                    r.crit === 'nat20'
                      ? 'text-emerald-400'
                      : r.crit === 'nat1'
                        ? 'text-rose-400'
                        : 'text-zinc-100'
                  }`}
                >
                  {r.total}
                </div>
              </div>
            ))
          )}
          {secretRolls.length > 0 && onClearSecretRolls && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClearSecretRolls}
                className="text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                Clear Local Secret Rolls
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 3. Cross-Device Encrypted Sync Capsule Modal --------------------------

export interface PlayerSyncCapsuleModalProps {
  open?: boolean;
  campaignId?: string;
  campaignName?: string;
  shareToken: string;
  slotId: string;
  pcId?: string;
  trackerState: PlayerTrackerState;
  onImportCapsule: (payload: PlayerSyncCapsulePayload) => void;
  onClose: () => void;
}

export function PlayerSyncCapsuleModal({
  open = true,
  campaignId = '',
  campaignName,
  shareToken,
  slotId,
  pcId = '',
  trackerState,
  onImportCapsule,
  onClose,
}: PlayerSyncCapsuleModalProps) {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [passphrase, setPassphrase] = useState('');
  const [encryptedString, setEncryptedString] = useState('');
  const [importInput, setImportInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const effectiveCampaignId = campaignId || campaignName || '';

  const handleGenerateCapsule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    if (!passphrase.trim()) {
      setErrorMessage('Enter a passphrase to encrypt your private notes.');
      return;
    }
    setBusy(true);
    try {
      const token = await encryptPlayerSyncCapsule(
        {
          campaignId,
          shareToken,
          slotId,
          pcId,
          trackerState,
        },
        passphrase
      );
      setEncryptedString(token);
      setStatusMessage(
        'Encrypted capsule ready! Derived via PBKDF2 (100,000 iterations) + AES-GCM-256.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Encryption failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadCapsuleFile = () => {
    if (!encryptedString) return;
    const content = serializeCapsuleFile(encryptedString, {
      campaignHint: campaignId,
      slotHint: slotId,
    });
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `player-backup-${slotId || 'notes'}.gmaplayer`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportInput(text);
    setStatusMessage(`Loaded ${file.name}. Enter your passphrase and click Decrypt & Restore.`);
  };

  const handleDecryptAndRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    if (!importInput.trim() || !passphrase.trim()) {
      setErrorMessage('Provide both the encrypted capsule/file and your passphrase.');
      return;
    }
    setBusy(true);
    try {
      const payload = await decryptPlayerSyncCapsule(importInput, passphrase);
      onImportCapsule(payload);
      setStatusMessage('Private notes, quests, journals, and conspiracy board restored!');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Invalid passphrase or corrupted capsule.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handoffUrl =
    encryptedString && typeof window !== 'undefined'
      ? buildSyncHandoffUrl(window.location.href, encryptedString)
      : '';

  const qrMatrix = encryptedString ? generateClientQrMatrix(handoffUrl || encryptedString, 25) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-indigo-500/30 bg-zinc-900 p-5 text-zinc-100 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-zinc-100">
              Sync Device / Backup Private Notes
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400 mb-3">
          Accountless end-to-end encrypted transfer (<code className="text-emerald-300">AES-GCM-256</code> +{' '}
          <code className="text-emerald-300">PBKDF2</code>). Transfers your private quests, lore annotations, journals, and conspiracy board between desktop and Android PWA with zero server exposure and zero GM visibility.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setTab('export');
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
              tab === 'export'
                ? 'border-indigo-500 bg-indigo-950/60 text-indigo-200'
                : 'border-zinc-700 bg-zinc-950 text-zinc-400'
            }`}
          >
            Export / Handoff Capsule
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('import');
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
              tab === 'import'
                ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                : 'border-zinc-700 bg-zinc-950 text-zinc-400'
            }`}
          >
            Import / Restore Capsule
          </button>
        </div>

        {tab === 'export' ? (
          <form onSubmit={handleGenerateCapsule} className="space-y-3 text-xs">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                Encryption Passphrase
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter a secret passphrase..."
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {busy ? 'Encrypting...' : 'Generate Encrypted Sync Capsule'}
            </button>

            {encryptedString && (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 mt-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCapsuleFile}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .gmaplayer File
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(encryptedString);
                      setStatusMessage('Copied encrypted sync string to clipboard!');
                    }}
                    className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Sync String
                  </button>
                  {handoffUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(handoffUrl);
                        setStatusMessage('Copied hash-fragment handoff link to clipboard!');
                      }}
                      className="inline-flex items-center gap-1.5 rounded border border-indigo-500/40 bg-indigo-950/40 px-3 py-1.5 font-semibold text-indigo-200"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      Copy Handoff Link
                    </button>
                  )}
                </div>

                {/* Client-side QR Code Matrix */}
                {qrMatrix && (
                  <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                    <svg
                      width={96}
                      height={96}
                      viewBox="0 0 25 25"
                      className="rounded bg-white p-1.5 shrink-0"
                    >
                      {qrMatrix.map((row, r) =>
                        row.map((cell, c) =>
                          cell ? (
                            <rect
                              key={`${r}-${c}`}
                              x={c}
                              y={r}
                              width={1}
                              height={1}
                              fill="#09090b"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                    <div className="space-y-1 text-[11px] text-zinc-400">
                      <div className="font-semibold text-zinc-200">
                        Client-Side QR / Link Handoff
                      </div>
                      <p>
                        Hash-fragment link (<code className="text-indigo-300">#gmasync=...</code>) keeps your ciphertext strictly inside the browser fragment so it never touches server logs.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleDecryptAndRestore} className="space-y-3 text-xs">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                Upload <code className="text-emerald-300">.gmaplayer</code> File or Paste Encrypted String
              </label>
              <label className="mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800">
                <Upload className="h-3.5 w-3.5" />
                Choose .gmaplayer File
                <input
                  type="file"
                  accept=".gmaplayer,application/json,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <textarea
                rows={3}
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder="Paste GMA1.... sync string or .gmaplayer JSON here"
                className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                Decryption Passphrase
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter passphrase used during export..."
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? 'Decrypting...' : 'Decrypt & Restore Private Notes'}
            </button>
          </form>
        )}

        {statusMessage && (
          <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 rounded border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
