'use client';

import { useMemo, useContext, useRef, useState } from 'react';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';
import {
  ChevronDown, ChevronRight, X, Plus, Trash2, Download, Heart, Shield,
  Moon, Sun, Dice5, FileUp, Dices, Lock, Sparkles, Wand2, ArrowUpCircle, ShieldAlert, Zap,
} from 'lucide-react';
import {
  abilityMod, formatMod, pcInitiative, pcTotalLevel, proficiencyBonusForLevel,
} from '@/lib/pc/derived';
import {
  SKILL_ABILITIES, SKILL_NAMES, skillModifier, savingThrowModifier, passivePerception,
} from '@/lib/pc/skills';
import { longRest, shortRest } from '@/lib/pc/rest';
import { pcToMarkdown } from '@/lib/pc/export';
import { makePcId } from '@/lib/pc/factory';
import {
  ABILITY_NAMES, SPELL_SLOT_LEVELS,
  type AbilityName, type ActiveBuff, type Attack, type FeatureEntry, type InventoryItem,
  type PlayerCharacter, type RollEvent, type SkillName, type SpellSlotLevel,
} from '@/lib/pc/types';
import { CONDITIONS } from '@/lib/initiative';
import { Label, SectionTitle, inputCls, chipBtn } from './pcSheet/primitives';
import { TextInput, NumInput, Bubbles, ListEditor } from './pcSheet/fields';
import PlayerSharedQuestsNotesPanel from './PlayerSharedQuestsNotesPanel';
import { evaluateCharacterSheet } from '@/lib/characterEvaluator';
import { parseCharacterSheet } from '@/lib/characterSheetParser';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  EvaluationReportBadge,
  ExportSheetPdfButton,
} from './CharacterSheetLifecycleControls';
import {
  computeEffectiveCharacterStats,
  createBuffFromPreset,
  PRESET_BUFFS,
  type RollMode,
} from '@/lib/activeModifiers';
import {
  appendRollEventRingBuffer,
  parseSpellMetadata,
  rollAbilityCheck,
  rollAttackDamage,
  rollCharacterDeathSave,
  rollCharacterHitDie,
  rollConcentrationCheck,
  rollInitiativeCheck,
  rollSavingThrow,
  rollSkillCheck,
  rollWeaponOrSpellAttack,
  sanitizeRollEventsForOutbound,
} from '@/lib/diceRoller';
import { CharacterWizardModal } from './CharacterWizardModal';

type Props = {
  pc: PlayerCharacter;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (next: PlayerCharacter) => void;
  onRemove: () => void;
  roster?: { slotId: string; displayName: string }[];
  allPcs?: PlayerCharacter[];
  onEvaluatedUpload?: (updatedPc: PlayerCharacter, previousPc: PlayerCharacter) => void;
  onAppendSecretRoll?: (roll: RollEvent) => void;
};

// ---- main component -----------------------------------------------------

export default function PcSheet({
  pc, open, onToggleOpen, onChange, onRemove,
  roster = [],
  allPcs = [],
  onEvaluatedUpload,
  onAppendSecretRoll,
}: Props) {
  const playMode = useContext(CampaignPlayModeContext);
  const totalLevel = useMemo(() => pcTotalLevel(pc), [pc]);
  const evaluation = useMemo(
    () => pc.evaluation ?? evaluateCharacterSheet(pc).evaluation,
    [pc],
  );
  const singleUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingSingle, setUploadingSingle] = useState(false);

  // Interactive Click-to-Roll & Active Buffs state
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const [situationalBonus, setSituationalBonus] = useState<string>('');
  const [secretRoll, setSecretRoll] = useState(false);
  const [lastRoll, setLastRoll] = useState<RollEvent | null>(null);
  const [customBuffName, setCustomBuffName] = useState('');
  const [customBuffAc, setCustomBuffAc] = useState(0);
  const [customBuffBonus, setCustomBuffBonus] = useState('');
  const [concentrationPrompt, setConcentrationPrompt] = useState<{
    damage: number;
    dc: number;
    spellName: string;
    rolledResult?: RollEvent;
  } | null>(null);
  const [spellPrompt, setSpellPrompt] = useState<{
    spellName: string;
    level: number;
    requiresConcentration: boolean;
  } | null>(null);
  const [wizardMode, setWizardMode] = useState<'create' | 'levelUp' | null>(null);

  const effectiveStats = useMemo(() => computeEffectiveCharacterStats(pc), [pc]);
  const activeBuffs: ActiveBuff[] = pc.activeBuffs ?? [];

  // Patch helper: shallow-merges a partial and emits the new PC.
  const patch = (p: Partial<PlayerCharacter>) => onChange({ ...pc, ...p });

  const emitRoll = (event: RollEvent, extraPatch?: Partial<PlayerCharacter>) => {
    setLastRoll(event);
    if (event.secretRoll) {
      onAppendSecretRoll?.(event);
      if (extraPatch) patch(extraPatch);
    } else {
      const nextPublic = sanitizeRollEventsForOutbound(
        appendRollEventRingBuffer(pc.rollEvents ?? [], event, 50),
      );
      patch({ ...(extraPatch ?? {}), rollEvents: nextPublic });
    }
  };

  const togglePresetBuff = (presetKey: string) => {
    const exists = activeBuffs.some((b) => b.presetKey === presetKey || b.id === presetKey);
    if (exists) {
      patch({
        activeBuffs: activeBuffs.filter((b) => b.presetKey !== presetKey && b.id !== presetKey),
      });
    } else {
      const created = createBuffFromPreset(presetKey);
      if (created) {
        patch({ activeBuffs: [...activeBuffs, created] });
      }
    }
  };

  const addCustomBuff = () => {
    if (!customBuffName.trim()) return;
    const buff: ActiveBuff = {
      id: `custom-${Date.now()}`,
      name: customBuffName.trim(),
      acBonus: customBuffAc || undefined,
      attackBonusFormula: customBuffBonus.trim() || undefined,
      saveBonusFormula: customBuffBonus.trim() || undefined,
      checkBonusFormula: customBuffBonus.trim() || undefined,
      expiresOn: 'rest',
      active: true,
    };
    patch({ activeBuffs: [...activeBuffs, buff] });
    setCustomBuffName('');
    setCustomBuffAc(0);
    setCustomBuffBonus('');
  };

  const handleSinglePcUpload = async (file: File) => {
    setUploadingSingle(true);
    const prevSnapshot = JSON.parse(JSON.stringify(pc)) as PlayerCharacter;
    try {
      let idToken: string | undefined;
      try {
        const user = getFirebaseAuth().currentUser;
        if (user) idToken = await user.getIdToken();
      } catch {
        // Offline Tier 1 fallback
      }
      const res = await parseCharacterSheet(file, {
        filename: file.name,
        mimeType: file.type,
        existingPc: pc,
        targetPcId: pc.id,
        authToken: idToken,
      });
      if (onEvaluatedUpload) {
        onEvaluatedUpload(res.pc, prevSnapshot);
      } else {
        onChange(res.pc);
      }
    } finally {
      setUploadingSingle(false);
    }
  };

  const isPlayerOwned = pc.ownership?.ownerType === 'player';
  const ownerLabel = useMemo(() => {
    if (!isPlayerOwned) return null;
    const slotId = pc.ownership?.playerSlotId;
    if (slotId && roster) {
      const player = roster.find((r) => r.slotId === slotId);
      if (player) return `Player: ${player.displayName}`;
    }
    return 'Player PC';
  }, [isPlayerOwned, pc.ownership?.playerSlotId, roster]);

  const setAbility = (a: AbilityName, v: number) =>
    patch({ abilities: { ...pc.abilities, [a]: v } });

  const setLevel = (v: number) => {
    const lvl = Math.max(1, Math.min(20, v));
    patch({ level: lvl, proficiencyBonus: proficiencyBonusForLevel(lvl) });
  };

  const toggleSkill = (s: SkillName) => {
    const has = pc.proficiencies.skills.includes(s);
    patch({
      proficiencies: {
        ...pc.proficiencies,
        skills: has
          ? pc.proficiencies.skills.filter((x) => x !== s)
          : [...pc.proficiencies.skills, s],
      },
    });
  };

  const toggleSave = (a: AbilityName) => {
    const has = pc.proficiencies.savingThrows.includes(a);
    patch({
      proficiencies: {
        ...pc.proficiencies,
        savingThrows: has
          ? pc.proficiencies.savingThrows.filter((x) => x !== a)
          : [...pc.proficiencies.savingThrows, a],
      },
    });
  };

  const toggleCondition = (c: string) => {
    const has = pc.conditions.includes(c);
    patch({ conditions: has ? pc.conditions.filter((x) => x !== c) : [...pc.conditions, c] });
  };

  // ---- inventory ----
  const addItem = () =>
    patch({ inventory: [...pc.inventory, { id: makePcId(), name: '', qty: 1 }] });
  const updateItem = (id: string, p: Partial<InventoryItem>) =>
    patch({ inventory: pc.inventory.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  const removeItem = (id: string) =>
    patch({ inventory: pc.inventory.filter((i) => i.id !== id) });

  const carriedWeight = useMemo(
    () => pc.inventory.reduce((s, i) => s + (i.weight ?? 0) * (i.qty || 1), 0),
    [pc.inventory],
  );
  const carryCap = pc.abilities.STR * 15;
  const encumbered = carriedWeight > carryCap;

  // ---- attacks ----
  const addAttack = () =>
    patch({
      attacks: [
        ...pc.attacks,
        { id: makePcId(), name: '', attackBonus: 0, damageExpr: '', damageType: '', range: '' },
      ],
    });
  const updateAttack = (id: string, p: Partial<Attack>) =>
    patch({ attacks: pc.attacks.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const removeAttack = (id: string) =>
    patch({ attacks: pc.attacks.filter((a) => a.id !== id) });

  // ---- features ----
  const addFeature = () =>
    patch({
      features: [
        ...pc.features,
        { id: makePcId(), name: '', source: '', description: '' },
      ],
    });
  const updateFeature = (id: string, p: Partial<FeatureEntry>) =>
    patch({ features: pc.features.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const removeFeature = (id: string) =>
    patch({ features: pc.features.filter((f) => f.id !== id) });

  // ---- spell slots ----
  const setSlot = (lvl: SpellSlotLevel, key: 'max' | 'used', v: number) => {
    const slots = { ...(pc.spellSlots ?? {}) };
    const cur = slots[lvl] ?? { max: 0, used: 0 };
    slots[lvl] = { ...cur, [key]: Math.max(0, v) };
    patch({ spellSlots: slots });
  };

  // ---- list-of-strings editors (goals/bonds/ideals/flaws/spells) ----
  const listFieldEditor = (
    field: 'goals' | 'bonds' | 'ideals' | 'flaws',
  ) => (
    <ListEditor
      values={pc[field]}
      onChange={(next) => patch({ [field]: next } as Partial<PlayerCharacter>)}
      placeholder={`Add a ${field.replace(/s$/, '')}…`}
    />
  );

  const exportMd = () => {
    const md = pcToMarkdown(pc);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (pc.name || 'pc').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = `${safe || 'pc'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const classesLabel = pc.classes.length
    ? pc.classes.map((c) => `${c.name} ${c.level}`).join(' / ')
    : '';

  return (
    <div className="rounded border border-rule bg-parchment shadow-card">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button onClick={onToggleOpen} className="text-ink-mute hover:text-ink" aria-label="Toggle">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button onClick={onToggleOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display tracking-wide text-ink">{pc.name || 'Unnamed PC'}</span>
            {ownerLabel && (
              <span className={`rounded border px-1.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-wider ${
                playMode === 'duet'
                  ? 'border-teal-500/30 bg-teal-950/20 text-teal-400'
                  : 'border-amber-500/30 bg-amber-950/20 text-amber-400'
              }`}>
                {ownerLabel}
              </span>
            )}
            <span className="font-serif text-xs italic text-ink-mute">
              {[pc.race, classesLabel].filter(Boolean).join(' · ') || `Level ${pc.level}`}
            </span>
          </div>
        </button>
        <EvaluationReportBadge evaluation={evaluation} compact />
        <span className="flex items-center gap-1 font-serif text-[11px] text-ink-soft">
          <Heart size={11} className="text-crimson" /> {pc.hp.current}/{effectiveStats.effectiveMaxHp}
          <Shield size={11} className="ml-1.5 text-brass-deep" /> {effectiveStats.effectiveAc}
          {effectiveStats.acDelta !== 0 && (
            <span className="font-mono text-[9px] text-emerald-700">
              ({effectiveStats.acDelta > 0 ? `+${effectiveStats.acDelta}` : effectiveStats.acDelta})
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setWizardMode('levelUp')}
          data-testid={`pc-level-up-btn-${pc.id}`}
          className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-amber-700 hover:bg-amber-500/25"
          title="Guided 1-Tap Level-Up Wizard"
        >
          <ArrowUpCircle size={11} />
          <span>Level Up</span>
        </button>
        <button
          type="button"
          onClick={() => setWizardMode('create')}
          data-testid={`pc-wizard-builder-btn-${pc.id}`}
          className="inline-flex items-center gap-1 rounded border border-indigo-500/40 bg-indigo-500/10 px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-indigo-700 hover:bg-indigo-500/20"
          title="Guided Character Builder Wizard"
        >
          <Wand2 size={11} />
          <span>Builder</span>
        </button>
        <button
          type="button"
          onClick={() => singleUploadRef.current?.click()}
          disabled={uploadingSingle}
          className="gm-tooltip inline-flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft hover:border-crimson hover:text-crimson"
          title="Upload / Level-Up Sheet for this PC (Preserves Damage & Spent Slots)"
        >
          <FileUp size={11} />
          <span>{uploadingSingle ? 'Merging…' : 'Update Sheet'}</span>
        </button>
        <input
          ref={singleUploadRef}
          type="file"
          accept=".pdf,.json,.png,.jpg,.jpeg,.webp,application/pdf,application/json,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleSinglePcUpload(file);
          }}
          className="hidden"
        />
        <ExportSheetPdfButton pc={pc} mode="gm" compact />
        <button onClick={exportMd} className="gm-tooltip text-ink-mute hover:text-brass-deep" data-tooltip="Export Markdown" title="Export Markdown" aria-label="Export Markdown">
          <Download size={14} />
        </button>
        <button onClick={onRemove} className="gm-tooltip text-ink-mute hover:text-crimson" data-tooltip="Delete PC" title="Delete PC" aria-label="Delete PC">
          <Trash2 size={14} />
        </button>
      </div>

      {!open ? null : (
        <div className="space-y-3 border-t border-rule p-3">
          {/* Automatic Concentration Check Prompt Toast */}
          {concentrationPrompt && (
            <div
              data-testid="pcsheet-concentration-prompt"
              className="flex flex-wrap items-center justify-between gap-2 rounded border-2 border-amber-500 bg-amber-950/90 px-3 py-2 text-xs text-amber-100 shadow"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-400" />
                <span>
                  Took <strong>{concentrationPrompt.damage}</strong> damage while concentrating on{' '}
                  <strong>{concentrationPrompt.spellName}</strong>! Roll CON Save{' '}
                  <strong>DC {concentrationPrompt.dc}</strong>:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!concentrationPrompt.rolledResult ? (
                  <button
                    type="button"
                    onClick={() => {
                      const ev = rollConcentrationCheck(pc, concentrationPrompt.damage, {
                        rollMode,
                        situationalBonus: situationalBonus || undefined,
                        secretRoll,
                      });
                      emitRoll(ev);
                      setConcentrationPrompt({ ...concentrationPrompt, rolledResult: ev });
                    }}
                    className="rounded bg-amber-400 px-2.5 py-1 font-mono text-[11px] font-bold text-zinc-950"
                  >
                    🎲 Roll Concentration Save (DC {concentrationPrompt.dc})
                  </button>
                ) : (
                  <span className="font-mono text-xs font-bold">
                    Rolled {concentrationPrompt.rolledResult.total} vs DC {concentrationPrompt.dc} (
                    {concentrationPrompt.rolledResult.total >= concentrationPrompt.dc ? 'PASS' : 'FAIL'})
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setConcentrationPrompt(null)}
                  className="rounded border border-emerald-400/50 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-200"
                >
                  Keep Conc.
                </button>
                <button
                  type="button"
                  onClick={() => {
                    patch({ concentrationSpell: '' });
                    setConcentrationPrompt(null);
                  }}
                  className="rounded border border-red-400/50 bg-red-500/20 px-2 py-0.5 font-mono text-[10px] text-red-200"
                >
                  Drop Conc.
                </button>
              </div>
            </div>
          )}

          {/* Roll Modifier Pill Bar & Latest Roll Banner */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-brass-deep">
                  <Dices size={12} /> Click-to-Roll:
                </span>
                {(['normal', 'advantage', 'disadvantage'] as RollMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRollMode(m)}
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                      rollMode === m
                        ? m === 'advantage'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : m === 'disadvantage'
                            ? 'border-red-600 bg-red-600 text-white'
                            : 'border-wax bg-wax text-ivory'
                        : 'border-rule bg-parchment text-ink-soft'
                    }`}
                  >
                    {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Advantage' : 'Disadvantage'}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {['+1d4', '+2', '+5'].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSituationalBonus((cur) => (cur === b ? '' : b))}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                      situationalBonus === b
                        ? 'border-amber-600 bg-amber-500/20 font-bold text-amber-900'
                        : 'border-rule bg-parchment text-ink-soft'
                    }`}
                  >
                    {b}
                  </button>
                ))}
                <input
                  type="text"
                  value={situationalBonus}
                  onChange={(e) => setSituationalBonus(e.target.value)}
                  placeholder="+mod / +1d6"
                  className="w-20 rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[10px] text-ink"
                />
                <button
                  type="button"
                  onClick={() => setSecretRoll((s) => !s)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    secretRoll
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'border-rule bg-parchment text-ink-soft'
                  }`}
                >
                  <Lock size={10} />
                  {secretRoll ? '🔒 Secret Roll' : 'Public Roll'}
                </button>
              </div>
            </div>

            {lastRoll && (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs ${
                  lastRoll.crit === 'nat20'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-950'
                    : lastRoll.crit === 'nat1'
                      ? 'border-red-500 bg-red-500/15 text-red-950'
                      : 'border-rule bg-parchment text-ink'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold">{lastRoll.label}</span>
                  <span className="font-mono text-[11px] text-ink-soft">({lastRoll.breakdown})</span>
                  {lastRoll.crit === 'nat20' && (
                    <span className="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                      ★ NAT 20!
                    </span>
                  )}
                  {lastRoll.crit === 'nat1' && (
                    <span className="rounded bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                      💀 NAT 1!
                    </span>
                  )}
                </div>
                <span className="font-mono text-base font-bold text-wax">= {lastRoll.total}</span>
              </div>
            )}
          </div>

          {/* Active Buffs & Dynamic Stat Modifiers Bar */}
          <div className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-brass-deep">
                <Zap size={11} /> Active Buffs &amp; Spell Effects
              </span>
              {effectiveStats.summaryBadges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {effectiveStats.summaryBadges.map((badge, i) => (
                    <span
                      key={i}
                      className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-900"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.values(PRESET_BUFFS).map((preset) => {
                const isActive = activeBuffs.some(
                  (b) => b.presetKey === preset.presetKey || b.id === preset.id,
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => togglePresetBuff(preset.presetKey || preset.id)}
                    className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition ${
                      isActive
                        ? 'border-emerald-600 bg-emerald-600 font-bold text-white shadow-sm'
                        : 'border-rule bg-parchment text-ink-soft hover:text-ink'
                    }`}
                  >
                    {isActive ? '✓ ' : '+ '}
                    {preset.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <input
                type="text"
                value={customBuffName}
                onChange={(e) => setCustomBuffName(e.target.value)}
                placeholder="Custom Buff..."
                className="w-28 rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-[11px]"
              />
              <input
                type="number"
                value={customBuffAc || ''}
                onChange={(e) => setCustomBuffAc(parseInt(e.target.value, 10) || 0)}
                placeholder="+AC"
                className="w-12 rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[11px]"
              />
              <input
                type="text"
                value={customBuffBonus}
                onChange={(e) => setCustomBuffBonus(e.target.value)}
                placeholder="Roll +1d4"
                className="w-20 rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={addCustomBuff}
                className="rounded border border-brass-deep bg-brass/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-brass-deep"
              >
                + Buff
              </button>
            </div>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Name</Label>
              <TextInput name="name" value={pc.name} onChange={(v) => patch({ name: v })} placeholder="Character name" />
            </div>
            <div>
              <Label>Level</Label>
              <NumInput name="level" min={1} max={20} value={pc.level} onChange={setLevel} />
            </div>
            <div>
              <Label>Race</Label>
              <TextInput name="race" value={pc.race} onChange={(v) => patch({ race: v })} placeholder="Human" />
            </div>
            <div>
              <Label>Background</Label>
              <TextInput name="background" value={pc.background} onChange={(v) => patch({ background: v })} placeholder="Soldier" />
            </div>
            <div>
              <Label>Alignment</Label>
              <TextInput value={pc.alignment ?? ''} onChange={(v) => patch({ alignment: v })} placeholder="LG" />
            </div>
            {playMode !== 'solo' && (
              <div>
                <Label>Ownership</Label>
                <select
                  value={pc.ownership?.ownerType === 'player' ? pc.ownership.playerSlotId || 'player-generic' : 'dm'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'dm') {
                      patch({ ownership: { ownerType: 'dm' } });
                    } else {
                      patch({ ownership: { ownerType: 'player', playerSlotId: val === 'player-generic' ? undefined : val } });
                    }
                  }}
                  className="w-full cursor-pointer border-b border-rule bg-transparent p-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
                >
                  <option value="dm">DM-Owned NPC</option>
                  {roster.map((r: any) => (
                    <option key={r.slotId} value={r.slotId}>
                      Player: {r.displayName}
                    </option>
                  ))}
                  {roster.length === 0 && (
                    <option value="player-generic">Player PC</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Classes */}
          <div className="space-y-1.5 border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Classes</SectionTitle>
              <button
                onClick={() => patch({ classes: [...pc.classes, { name: '', level: 1 }] })}
                className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson"
              >
                <Plus size={11} /> Class
              </button>
            </div>
            {pc.classes.length === 0 && (
              <p className="font-serif text-xs italic text-ink-mute">No classes — add one to track multiclass levels.</p>
            )}
            {pc.classes.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => patch({ classes: pc.classes.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)) })}
                  placeholder="Class"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="text"
                  value={c.subclass ?? ''}
                  onChange={(e) => patch({ classes: pc.classes.map((x, xi) => (xi === i ? { ...x, subclass: e.target.value } : x)) })}
                  placeholder="Subclass"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={c.level}
                  onChange={(e) => patch({ classes: pc.classes.map((x, xi) => (xi === i ? { ...x, level: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)) })}
                  className={`${inputCls} w-14 text-center`}
                />
                <button onClick={() => patch({ classes: pc.classes.filter((_, xi) => xi !== i) })} className="text-ink-mute hover:text-crimson">
                  <X size={13} />
                </button>
              </div>
            ))}
            <p className="font-serif text-[10px] italic text-ink-mute">
              Total level {totalLevel} · Proficiency {formatMod(pc.proficiencyBonus)}
            </p>
          </div>

          {/* Abilities (1-Tap Rollable) */}
          <div className="border-t border-rule pt-2.5">
            <SectionTitle>Abilities (Tap Mod to Roll Check)</SectionTitle>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {ABILITY_NAMES.map((a) => (
                <div key={a} className="rounded border border-rule bg-parchment-soft p-1.5 text-center">
                  <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{a}</div>
                  <NumInput name={a} min={1} max={30} value={pc.abilities[a]} onChange={(v) => setAbility(a, v)} className="w-full bg-transparent text-center font-serif text-lg text-ink focus:outline-none" />
                  <button
                    type="button"
                    onClick={() =>
                      emitRoll(
                        rollAbilityCheck(pc, a, {
                          rollMode,
                          situationalBonus: situationalBonus || undefined,
                          secretRoll,
                        }),
                      )
                    }
                    className="mt-0.5 inline-flex items-center gap-1 rounded border border-crimson/30 bg-crimson/10 px-2 py-0.5 font-display text-xs text-crimson hover:bg-crimson hover:text-ivory"
                    title={`Roll ${a} Check`}
                  >
                    <Dices size={10} />
                    {formatMod(abilityMod(pc.abilities[a]))}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Combat stats */}
          <div className="grid grid-cols-2 gap-2 border-t border-rule pt-2.5 sm:grid-cols-4">
            <div>
              <Label>
                AC{' '}
                {effectiveStats.acDelta !== 0 && (
                  <span className="font-mono text-[10px] text-emerald-700">
                    (Eff: {effectiveStats.effectiveAc})
                  </span>
                )}
              </Label>
              <NumInput name="ac" value={pc.ac} onChange={(v) => patch({ ac: v })} />
            </div>
            <div>
              <Label>
                Speed{' '}
                {effectiveStats.effectiveSpeed !== pc.speed && (
                  <span className="font-mono text-[10px] text-amber-700">
                    (Eff: {effectiveStats.effectiveSpeed} ft)
                  </span>
                )}
              </Label>
              <NumInput value={pc.speed} onChange={(v) => patch({ speed: v })} />
            </div>
            <div>
              <Label>Initiative</Label>
              <NumInput value={pc.initiativeMod} onChange={(v) => patch({ initiativeMod: v })} />
              <button
                type="button"
                onClick={() =>
                  emitRoll(
                    rollInitiativeCheck(pc, {
                      rollMode,
                      situationalBonus: situationalBonus || undefined,
                      secretRoll,
                    }),
                  )
                }
                className="mt-0.5 flex w-full items-center justify-center gap-1 rounded border border-brass-deep/40 bg-brass/10 py-0.5 font-display text-[10px] text-brass-deep hover:bg-brass hover:text-parchment"
              >
                <Dices size={10} /> Roll Init ({formatMod(effectiveStats.effectiveInitiative)})
              </button>
            </div>
            <div>
              <Label>Prof. Bonus</Label>
              <NumInput value={pc.proficiencyBonus} onChange={(v) => patch({ proficiencyBonus: v })} />
            </div>
            <div>
              <Label>HP Current</Label>
              <NumInput
                name="hpCurrent"
                value={pc.hp.current}
                onChange={(v) => {
                  const dmg = pc.hp.current - v;
                  patch({ hp: { ...pc.hp, current: v } });
                  if (dmg > 0 && pc.concentrationSpell) {
                    setConcentrationPrompt({
                      damage: dmg,
                      dc: Math.max(10, Math.floor(dmg / 2)),
                      spellName: pc.concentrationSpell,
                    });
                  }
                }}
              />
            </div>
            <div>
              <Label>HP Max</Label>
              <NumInput name="hpMax" value={pc.hp.max} onChange={(v) => patch({ hp: { ...pc.hp, max: v } })} />
            </div>
            <div>
              <Label>Temp HP</Label>
              <NumInput value={pc.hp.temp} onChange={(v) => patch({ hp: { ...pc.hp, temp: v } })} />
            </div>
            <div>
              <Label>Hit Dice (d{pc.hitDice.dieSize})</Label>
              <div className="flex items-center gap-1">
                <NumInput value={pc.hitDice.used} onChange={(v) => patch({ hitDice: { ...pc.hitDice, used: Math.max(0, Math.min(pc.hitDice.max, v)) } })} />
                <span className="font-serif text-xs text-ink-mute">/ {pc.hitDice.max}</span>
                <button
                  type="button"
                  disabled={pc.hitDice.used >= pc.hitDice.max}
                  onClick={() => {
                    const res = rollCharacterHitDie(pc, { secretRoll });
                    emitRoll(res.rollEvent, {
                      hp: { ...pc.hp, current: res.nextCurrentHp },
                      hitDice: { ...pc.hitDice, used: Math.min(pc.hitDice.max, pc.hitDice.used + 1) },
                    });
                  }}
                  className="ml-1 rounded border border-emerald-600/50 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800 disabled:opacity-40"
                  title="Spend & Roll 1 Hit Die to Heal"
                >
                  🎲 Spend
                </button>
              </div>
            </div>
          </div>

          {/* Saving throws (Checkbox toggles prof, Roll button rolls save) */}
          <div className="border-t border-rule pt-2.5">
            <SectionTitle>Saving Throws</SectionTitle>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ABILITY_NAMES.map((a) => {
                const prof = pc.proficiencies.savingThrows.includes(a);
                const effSaveMod = effectiveStats.savingThrowModifiers[a] ?? savingThrowModifier(pc, a);
                return (
                  <div
                    key={a}
                    className={`flex items-center justify-between rounded border px-2 py-1 font-serif text-sm ${prof ? 'border-brass-deep/50 bg-brass/10' : 'border-rule'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSave(a)}
                      role="checkbox"
                      aria-checked={prof}
                      aria-label={`Proficient in ${a} save`}
                      className="flex items-center gap-1.5"
                    >
                      <span className={`inline-block size-2.5 rounded-full border ${prof ? 'border-crimson bg-crimson' : 'border-ink-mute'}`} />
                      <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">{a}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        emitRoll(
                          rollSavingThrow(pc, a, {
                            rollMode,
                            situationalBonus: situationalBonus || undefined,
                            secretRoll,
                          }),
                        )
                      }
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-display text-crimson hover:bg-crimson/15"
                      title={`Roll ${a} Saving Throw`}
                    >
                      <Dices size={11} />
                      {formatMod(effSaveMod)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Skills */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Skills</SectionTitle>
              <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                Passive Perception {passivePerception(pc)}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {SKILL_NAMES.map((s) => {
                const prof = pc.proficiencies.skills.includes(s);
                const effSkillMod = effectiveStats.skillModifiers[s] ?? skillModifier(pc, s);
                return (
                  <div
                    key={s}
                    className={`flex items-center justify-between rounded px-2 py-1 font-serif text-sm ${prof ? 'bg-brass/10' : 'hover:bg-parchment-deep'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSkill(s)}
                      role="checkbox"
                      aria-checked={prof}
                      aria-label={`Proficient in ${s}`}
                      className="flex items-center gap-1.5 text-left"
                    >
                      <span className={`inline-block size-2.5 rounded-sm border ${prof ? 'border-crimson bg-crimson' : 'border-ink-mute'}`} />
                      <span className="text-ink-soft">{s}</span>
                      <span className="font-display text-[9px] uppercase text-ink-faint">{SKILL_ABILITIES[s]}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        emitRoll(
                          rollSkillCheck(pc, s, {
                            rollMode,
                            situationalBonus: situationalBonus || undefined,
                            secretRoll,
                          }),
                        )
                      }
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-display text-crimson hover:bg-crimson/15"
                      title={`Roll ${s} Check`}
                    >
                      <Dices size={11} />
                      {formatMod(effSkillMod)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conditions + exhaustion + death saves */}
          <div className="border-t border-rule pt-2.5">
            <SectionTitle>Conditions</SectionTitle>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <button key={c} onClick={() => toggleCondition(c)} className={chipBtn(pc.conditions.includes(c))}>
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-4">
              <div>
                <Label>Exhaustion</Label>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => patch({ exhaustion: n as PlayerCharacter['exhaustion'] })}
                      className={`size-6 rounded border font-display text-xs ${pc.exhaustion === n ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-soft hover:bg-parchment-deep'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Death Saves</Label>
                  <button
                    type="button"
                    onClick={() => {
                      const res = rollCharacterDeathSave(pc, {
                        rollMode,
                        situationalBonus: situationalBonus || undefined,
                        secretRoll,
                      });
                      emitRoll(res.rollEvent, {
                        deathSaves: res.nextDeathSaves,
                        ...(res.revivedWithOneHp ? { hp: { ...pc.hp, current: 1 } } : {}),
                      });
                    }}
                    className="rounded border border-crimson/40 bg-crimson/10 px-2 py-0.5 font-mono text-[10px] font-bold text-crimson hover:bg-crimson hover:text-ivory"
                  >
                    🎲 Roll Death Save
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <Bubbles label="✓" color="emerald" count={pc.deathSaves.successes} onSet={(n) => patch({ deathSaves: { ...pc.deathSaves, successes: n } })} />
                  <Bubbles label="✗" color="crimson" count={pc.deathSaves.failures} onSet={(n) => patch({ deathSaves: { ...pc.deathSaves, failures: n } })} />
                </div>
              </div>
            </div>
          </div>

          {/* Attacks */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Attacks</SectionTitle>
              <button onClick={addAttack} className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
                <Plus size={11} /> Add Attack
              </button>
            </div>
            {pc.attacks.length === 0 && <p className="mt-1 font-serif text-xs italic text-ink-mute">No attacks. Adding one creates a roll macro.</p>}
            <div className="mt-1.5 space-y-1.5">
              {pc.attacks.map((a) => (
                <div key={a.id} className="rounded border border-rule bg-parchment-soft p-2">
                  <div className="flex items-center gap-1.5">
                    <input name="attackName" value={a.name} onChange={(e) => updateAttack(a.id, { name: e.target.value })} placeholder="Attack name" className={`${inputCls} flex-1`} />
                    <button onClick={() => removeAttack(a.id)} className="text-ink-mute hover:text-crimson"><X size={13} /></button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <label className="font-display text-[9px] uppercase tracking-wider text-ink-mute">Bonus
                      <input name="attackBonus" type="number" value={a.attackBonus} onChange={(e) => updateAttack(a.id, { attackBonus: parseInt(e.target.value, 10) || 0 })} className={`${inputCls} text-center`} />
                    </label>
                    <label className="font-display text-[9px] uppercase tracking-wider text-ink-mute">Damage
                      <input name="damageExpr" value={a.damageExpr} onChange={(e) => updateAttack(a.id, { damageExpr: e.target.value })} placeholder="1d8+3" className={inputCls} />
                    </label>
                    <label className="font-display text-[9px] uppercase tracking-wider text-ink-mute">Type
                      <input name="damageType" value={a.damageType} onChange={(e) => updateAttack(a.id, { damageType: e.target.value })} placeholder="slashing" className={inputCls} />
                    </label>
                    <label className="font-display text-[9px] uppercase tracking-wider text-ink-mute">Range
                      <input name="range" value={a.range} onChange={(e) => updateAttack(a.id, { range: e.target.value })} placeholder="5 ft." className={inputCls} />
                    </label>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 font-display text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() =>
                        emitRoll(
                          rollWeaponOrSpellAttack(
                            pc,
                            { name: a.name || 'Attack', attackBonus: a.attackBonus, damage: a.damageExpr },
                            {
                              rollMode,
                              situationalBonus: situationalBonus || undefined,
                              secretRoll,
                            },
                          ),
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-crimson/50 bg-crimson/10 px-2 py-0.5 text-crimson hover:bg-crimson hover:text-ivory"
                    >
                      <Dice5 size={11} /> Roll To Hit (1d20{formatMod(a.attackBonus)})
                    </button>
                    {a.damageExpr && (
                      <button
                        type="button"
                        onClick={() =>
                          emitRoll(
                            rollAttackDamage(
                              pc,
                              { name: a.name || 'Attack', damage: a.damageExpr, damageType: a.damageType },
                              { isCrit: lastRoll?.crit === 'nat20', secretRoll },
                            ),
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-amber-600/50 bg-amber-500/15 px-2 py-0.5 text-amber-900 hover:bg-amber-500 hover:text-white"
                      >
                        💥 Roll Damage ({a.damageExpr})
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Inventory</SectionTitle>
              <span className={`font-display text-[10px] uppercase tracking-wider ${encumbered ? 'text-crimson' : 'text-ink-mute'}`}>
                {carriedWeight} / {carryCap} lb {encumbered ? '· Encumbered' : ''}
              </span>
            </div>
            <div className="mt-1.5 space-y-1">
              {pc.inventory.map((it) => (
                <div key={it.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!it.equipped} onChange={(e) => updateItem(it.id, { equipped: e.target.checked })} title="Equipped" aria-label={`Equipped ${it.name}`} />
                  <input value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} placeholder="Item" className={`${inputCls} flex-1`} />
                  <input type="number" min={0} value={it.qty} onChange={(e) => updateItem(it.id, { qty: parseInt(e.target.value, 10) || 0 })} className={`${inputCls} w-12 text-center`} title="Quantity" />
                  <input type="number" min={0} value={it.weight ?? 0} onChange={(e) => updateItem(it.id, { weight: parseFloat(e.target.value) || 0 })} className={`${inputCls} w-14 text-center`} title="Weight (lb)" />
                  <button onClick={() => removeItem(it.id)} className="text-ink-mute hover:text-crimson"><X size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-1 flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
              <Plus size={11} /> Add Item
            </button>
          </div>

          {/* Spell slots + features */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Spellcasting</SectionTitle>
              <div className="flex items-center gap-2">
                <Label>Ability</Label>
                <select
                  value={pc.spellcastingAbility ?? ''}
                  onChange={(e) => patch({ spellcastingAbility: (e.target.value || undefined) as AbilityName | undefined })}
                  className="border-b border-rule bg-transparent font-serif text-xs text-ink focus:outline-none"
                >
                  <option value="">—</option>
                  {ABILITY_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-3">
              {SPELL_SLOT_LEVELS.map((lvl) => {
                const slot = pc.spellSlots?.[lvl] ?? { max: 0, used: 0 };
                return (
                  <div key={lvl} className="rounded border border-rule bg-parchment-soft p-1.5">
                    <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Lvl {lvl}</div>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} value={slot.used} onChange={(e) => setSlot(lvl, 'used', parseInt(e.target.value, 10) || 0)} className={`${inputCls} w-10 text-center`} title="Used" />
                      <span className="font-serif text-xs text-ink-mute">/</span>
                      <input type="number" min={0} value={slot.max} onChange={(e) => setSlot(lvl, 'max', parseInt(e.target.value, 10) || 0)} className={`${inputCls} w-10 text-center`} title="Max" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2">
              <Label>Spells Known (Tap Cast to Roll &amp; Deduct Slot / Concentration)</Label>
              {(pc.spellsKnown ?? []).length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {(pc.spellsKnown ?? []).map((sp, i) => {
                    const meta = parseSpellMetadata(sp);
                    return (
                      <button
                        key={`${sp}-${i}`}
                        type="button"
                        onClick={() => {
                          const castAbi = pc.spellcastingAbility ?? 'INT';
                          const spellAtkBonus = abilityMod(pc.abilities[castAbi]) + pc.proficiencyBonus;
                          const ev = rollWeaponOrSpellAttack(
                            pc,
                            { name: meta.cleanName || sp, attackBonus: spellAtkBonus },
                            {
                              rollMode,
                              situationalBonus: situationalBonus || undefined,
                              secretRoll,
                            },
                          );
                          emitRoll(ev);
                          if ((meta.level && meta.level > 0) || meta.requiresConcentration) {
                            setSpellPrompt({
                              spellName: meta.cleanName || sp,
                              level: meta.level || 1,
                              requiresConcentration: meta.requiresConcentration,
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 font-serif text-xs text-indigo-900 hover:bg-indigo-500/20"
                      >
                        <Sparkles size={10} /> {sp}
                      </button>
                    );
                  })}
                </div>
              )}
              {spellPrompt && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-indigo-500/50 bg-indigo-950/90 px-2.5 py-1.5 text-xs text-indigo-100">
                  <span>
                    Cast <strong>{spellPrompt.spellName}</strong>: Deduct Lvl {spellPrompt.level} Slot
                    {spellPrompt.requiresConcentration ? ' & Set Concentration' : ''}?
                    {spellPrompt.requiresConcentration && pc.concentrationSpell && pc.concentrationSpell !== spellPrompt.spellName
                      ? ` (Replaces ${pc.concentrationSpell})`
                      : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const lvl = Math.max(1, Math.min(9, spellPrompt.level)) as SpellSlotLevel;
                        const cur = pc.spellSlots?.[lvl] ?? { max: 1, used: 0 };
                        patch({
                          spellSlots: {
                            ...(pc.spellSlots ?? {}),
                            [lvl]: { ...cur, used: Math.min(cur.max, cur.used + 1) },
                          },
                          ...(spellPrompt.requiresConcentration
                            ? { concentrationSpell: spellPrompt.spellName }
                            : {}),
                        });
                        setSpellPrompt(null);
                      }}
                      className="rounded bg-indigo-500 px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                    >
                      Confirm Cast
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpellPrompt(null)}
                      className="font-mono text-[10px] text-indigo-300"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
              <ListEditor
                values={pc.spellsKnown ?? []}
                onChange={(next) => patch({ spellsKnown: next })}
                placeholder="Add a spell…"
              />
            </div>
          </div>

          {/* Features */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Features</SectionTitle>
              <button onClick={addFeature} className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
                <Plus size={11} /> Add Feature
              </button>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {pc.features.map((f) => (
                <div key={f.id} className="rounded border border-rule bg-parchment-soft p-2">
                  <div className="flex items-center gap-1.5">
                    <input value={f.name} onChange={(e) => updateFeature(f.id, { name: e.target.value })} placeholder="Feature name" className={`${inputCls} flex-[2]`} />
                    <input value={f.source} onChange={(e) => updateFeature(f.id, { source: e.target.value })} placeholder="Source" className={`${inputCls} flex-1`} />
                    <button onClick={() => removeFeature(f.id)} className="text-ink-mute hover:text-crimson"><X size={13} /></button>
                  </div>
                  <textarea value={f.description} onChange={(e) => updateFeature(f.id, { description: e.target.value })} placeholder="Description" rows={1} className={`${inputCls} mt-1 resize-none [field-sizing:content]`} />
                  <div className="mt-1 flex items-center gap-2">
                    {f.uses ? (
                      <>
                        <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute">Uses</span>
                        <input type="number" min={0} value={f.uses.used} onChange={(e) => updateFeature(f.id, { uses: { ...f.uses!, used: parseInt(e.target.value, 10) || 0 } })} className={`${inputCls} w-10 text-center`} />
                        <span className="text-xs text-ink-mute">/</span>
                        <input type="number" min={0} value={f.uses.max} onChange={(e) => updateFeature(f.id, { uses: { ...f.uses!, max: parseInt(e.target.value, 10) || 0 } })} className={`${inputCls} w-10 text-center`} />
                        <select value={f.uses.refresh} onChange={(e) => updateFeature(f.id, { uses: { ...f.uses!, refresh: e.target.value as 'short' | 'long' } })} className="border-b border-rule bg-transparent font-serif text-xs text-ink focus:outline-none">
                          <option value="short">Short rest</option>
                          <option value="long">Long rest</option>
                        </select>
                        <button
                          type="button"
                          disabled={f.uses.used >= f.uses.max}
                          onClick={() =>
                            updateFeature(f.id, {
                              uses: { ...f.uses!, used: Math.min(f.uses!.max, f.uses!.used + 1) },
                            })
                          }
                          className="rounded border border-wax/50 bg-wax/10 px-2 py-0.5 font-mono text-[10px] font-bold text-wax disabled:opacity-40"
                        >
                          ⚡ Use ({f.uses.max - f.uses.used} left)
                        </button>
                        <button onClick={() => updateFeature(f.id, { uses: undefined })} className="font-display text-[9px] uppercase text-ink-mute hover:text-crimson">No uses</button>
                      </>
                    ) : (
                      <button onClick={() => updateFeature(f.id, { uses: { max: 1, used: 0, refresh: 'long' } })} className="font-display text-[9px] uppercase tracking-wider text-brass-deep hover:text-crimson">+ Track uses</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rest controls */}
          <div className="flex flex-wrap gap-2 border-t border-rule pt-2.5">
            <button onClick={() => onChange(shortRest(pc))} className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment">
              <Sun size={12} /> Short Rest
            </button>
            <button onClick={() => onChange(longRest(pc))} className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment">
              <Moon size={12} /> Long Rest
            </button>
          </div>

          {/* Roleplay */}
          <div className="grid grid-cols-1 gap-3 border-t border-rule pt-2.5 sm:grid-cols-2">
            <div><Label>Goals</Label>{listFieldEditor('goals')}</div>
            <div><Label>Bonds</Label>{listFieldEditor('bonds')}</div>
            <div><Label>Ideals</Label>{listFieldEditor('ideals')}</div>
            <div><Label>Flaws</Label>{listFieldEditor('flaws')}</div>
          </div>

          {/* Notes */}
          <div className="border-t border-rule pt-2.5">
            <Label>Notes</Label>
            <textarea value={pc.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Freeform notes…" rows={2} className={`${inputCls} resize-none [field-sizing:content]`} />
          </div>

          {/* Player-Shared Quests & Notes */}
          <div className="border-t border-rule pt-2.5">
            <PlayerSharedQuestsNotesPanel pcs={[pc]} />
          </div>
        </div>
      )}

      {/* Character Builder / Level-Up Wizard Modal */}
      {wizardMode && (
        <CharacterWizardModal
          open={true}
          mode={wizardMode}
          existingPc={pc}
          onClose={() => setWizardMode(null)}
          onSave={(updatedPc) => {
            onChange({ ...updatedPc, id: pc.id });
            setWizardMode(null);
          }}
        />
      )}
    </div>
  );
}

