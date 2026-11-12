'use client';

import React, { useMemo, useState } from 'react';
import {
  Search,
  Skull,
  Wand2,
  Package,
  ShieldAlert,
  Plus,
  Dices,
  Sparkles,
  Lock,
  Eye,
  GripVertical,
  Check,
  Coins,
  UserPlus,
} from 'lucide-react';
import {
  SRD_CC_BY_4_ATTRIBUTION,
  createPartyLootFromItem,
  grantMagicItemToPc,
  grantSpellToPc,
  instantiateMonsterCombatants,
  searchSrdCompendium,
  type MagicItemRarity,
  type SrdCompendiumCategory,
  type SrdCompendiumItem,
  type SrdMagicItem,
  type SrdMonster,
  type SrdMonsterAction,
  type SrdSpellEntry,
} from '@/lib/srdCompendium';
import { executeSheetRoll, appendRollEventRingBuffer } from '@/lib/diceRoller';
import { abilityMod, type Combatant, type InitiativeState } from '@/lib/initiative';
import { makeDefaultLayer, makeMap, readMaps, type CampaignMap } from '@/lib/maps/types';
import type { PartyLootItem, PlayerCharacter, RollEvent } from '@/lib/pc/types';

export const SRD_MONSTER_DRAG_MIME = 'application/x-gma-srd-monster';

export interface CompendiumDrawerProps {
  role?: 'gm' | 'player';
  campaignData?: Record<string, any>;
  pcs?: PlayerCharacter[];
  activePcId?: string | null;
  onUpdateCampaignKey?: (key: string, value: any) => void;
  onUpdatePc?: (updatedPc: PlayerCharacter) => void;
  onAddPartyLootItem?: (lootItem: PartyLootItem) => void;
  onSpawnMonsterCustom?: (monster: SrdMonster, opts: { count: number; rollHp: boolean; hidden: boolean }) => void;
  compact?: boolean;
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function CompendiumDrawer({
  role = 'gm',
  campaignData,
  pcs: pcsProp,
  activePcId,
  onUpdateCampaignKey,
  onUpdatePc,
  onAddPartyLootItem,
  onSpawnMonsterCustom,
  compact = false,
}: CompendiumDrawerProps) {
  const isGm = role === 'gm';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SrdCompendiumCategory | 'all'>(
    isGm ? 'all' : 'spell',
  );
  const [spellLevel, setSpellLevel] = useState<number | 'all'>('all');
  const [concOnly, setConcOnly] = useState(false);
  const [maxCr, setMaxCr] = useState<number | 'all'>('all');
  const [rarity, setRarity] = useState<MagicItemRarity | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Monster spawn options
  const [spawnCount, setSpawnCount] = useState<number>(1);
  const [rollMonsterHp, setRollMonsterHp] = useState<boolean>(true);
  const [spawnHidden, setSpawnHidden] = useState<boolean>(true);
  const [secretActionRoll, setSecretActionRoll] = useState<boolean>(isGm);

  // Target PC selection for 1-click Spell & Item Grant
  const availablePcs: PlayerCharacter[] = useMemo(() => {
    if (Array.isArray(pcsProp) && pcsProp.length > 0) return pcsProp;
    if (Array.isArray(campaignData?.pcs)) return campaignData.pcs as PlayerCharacter[];
    return [];
  }, [pcsProp, campaignData?.pcs]);

  const [selectedTargetPcId, setSelectedTargetPcId] = useState<string>('');
  const effectiveTargetPc = useMemo(() => {
    if (activePcId) {
      const match = availablePcs.find((p) => p.id === activePcId);
      if (match) return match;
    }
    if (selectedTargetPcId) {
      const match = availablePcs.find((p) => p.id === selectedTargetPcId);
      if (match) return match;
    }
    return availablePcs[0] ?? null;
  }, [availablePcs, activePcId, selectedTargetPcId]);

  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [lastInlineRoll, setLastInlineRoll] = useState<RollEvent | null>(null);

  const flashFeedback = (msg: string) => {
    setFeedbackToast(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedbackToast(null), 2800);
    }
  };

  const results = useMemo(() => {
    return searchSrdCompendium(query, {
      category,
      spellLevel: category === 'spell' ? spellLevel : 'all',
      concentrationOnly: category === 'spell' ? concOnly : false,
      maxCr: category === 'monster' && typeof maxCr === 'number' ? maxCr : undefined,
      rarity: category === 'item' ? rarity : 'all',
      limit: 50,
    });
  }, [query, category, spellLevel, concOnly, maxCr, rarity]);

  // Filter out monsters in pure player mode unless user specifically searches conditions/spells/items
  const visibleResults = useMemo(() => {
    if (isGm) return results;
    return results.filter((r) => r.category !== 'monster');
  }, [results, isGm]);

  const pushCampaignRollIfPublic = (roll: RollEvent) => {
    setLastInlineRoll(roll);
    if (roll.secretRoll) return; // Strictly local-only!
    if (onUpdateCampaignKey && campaignData) {
      const existing = Array.isArray(campaignData.rollEvents) ? campaignData.rollEvents : [];
      onUpdateCampaignKey('rollEvents', appendRollEventRingBuffer(existing, roll));
    }
  };

  const handleMonsterActionRoll = (monster: SrdMonster, action: SrdMonsterAction, mode: 'attack' | 'damage') => {
    if (mode === 'attack' && typeof action.attackBonus === 'number') {
      const roll = executeSheetRoll({
        actorName: isGm && spawnHidden ? 'GM Creature' : monster.name,
        label: `${action.name} (To Hit)`,
        baseMod: action.attackBonus,
        isD20: true,
        secretRoll: secretActionRoll,
      });
      pushCampaignRollIfPublic(roll);
      return;
    }
    if (mode === 'damage' && action.damageFormula) {
      const combinedFormula = action.secondaryDamageFormula
        ? `${action.damageFormula}+${action.secondaryDamageFormula}`
        : action.damageFormula;
      const roll = executeSheetRoll({
        actorName: isGm && spawnHidden ? 'GM Creature' : monster.name,
        label: `${action.name} (${action.damageType || 'damage'})`,
        baseFormula: combinedFormula,
        isD20: false,
        secretRoll: secretActionRoll,
      });
      pushCampaignRollIfPublic(roll);
    }
  };

  const handleSpawnMonster = (monster: SrdMonster) => {
    if (onSpawnMonsterCustom) {
      onSpawnMonsterCustom(monster, {
        count: spawnCount,
        rollHp: rollMonsterHp,
        hidden: spawnHidden,
      });
      flashFeedback(`Spawned ${spawnCount}x ${monster.name} (${spawnHidden ? '🔒 Private' : '👁️ Party'})`);
      return;
    }

    if (!onUpdateCampaignKey) return;

    const rawInit: InitiativeState =
      campaignData?.__initiative && typeof campaignData.__initiative === 'object'
        ? (campaignData.__initiative as InitiativeState)
        : { combatants: [], round: 1, activeIndex: 0, log: [] };

    const currentMaps: CampaignMap[] = readMaps(campaignData);
    let targetMap: CampaignMap;
    let updatedMaps: CampaignMap[];

    if (currentMaps.length === 0) {
      const defaultLayer = makeDefaultLayer(0);
      defaultLayer.visibleToPlayers = true;
      targetMap = makeMap({ name: 'Tactical Encounter Map', type: 'encounter' });
      targetMap.layers = [defaultLayer];
      targetMap.fogEnabled = true;
      updatedMaps = [targetMap];
    } else {
      targetMap = { ...currentMaps[0] };
      updatedMaps = [targetMap, ...currentMaps.slice(1)];
    }

    const { combatants: newCombatants, tokens: newTokens } = instantiateMonsterCombatants(monster, {
      count: spawnCount,
      rollHp: rollMonsterHp,
      hidden: spawnHidden,
      existingCombatants: rawInit.combatants ?? [],
      existingTokens: targetMap.tokens ?? [],
    });

    const nextInit: InitiativeState = {
      ...rawInit,
      round: rawInit.round || 1,
      activeIndex: rawInit.activeIndex || 0,
      combatants: [...(rawInit.combatants ?? []), ...newCombatants],
      log: [
        ...(rawInit.log ?? []),
        {
          round: rawInit.round || 1,
          text: `Spawned ${newCombatants.map((c) => c.name).join(', ')}`,
          ts: Date.now(),
        },
      ],
    };

    targetMap.tokens = [...(targetMap.tokens ?? []), ...newTokens];
    onUpdateCampaignKey('__initiative', nextInit);
    onUpdateCampaignKey('maps', updatedMaps);

    flashFeedback(
      `Added ${newCombatants.map((c) => c.name).join(', ')} to Encounter & Map (${spawnHidden ? '🔒 Private' : '👁️ Party'})`,
    );
  };

  const commitPcMutation = (updated: PlayerCharacter) => {
    if (onUpdatePc) {
      onUpdatePc(updated);
      return;
    }
    if (onUpdateCampaignKey && Array.isArray(campaignData?.pcs)) {
      const nextPcs = (campaignData.pcs as PlayerCharacter[]).map((p) =>
        p.id === updated.id ? updated : p,
      );
      onUpdateCampaignKey('pcs', nextPcs);
    }
  };

  const handleGrantSpell = (spell: SrdSpellEntry) => {
    if (!effectiveTargetPc) {
      flashFeedback('Create or select a Character Sheet first');
      return;
    }
    const nextPc = grantSpellToPc(effectiveTargetPc, spell);
    commitPcMutation(nextPc);
    flashFeedback(`Added "${spell.name}" to ${effectiveTargetPc.name}'s sheet`);
  };

  const handleGrantItem = (item: SrdMagicItem) => {
    if (!effectiveTargetPc) {
      flashFeedback('Create or select a Character Sheet first');
      return;
    }
    const nextPc = grantMagicItemToPc(effectiveTargetPc, item);
    commitPcMutation(nextPc);
    flashFeedback(`Equipped "${item.name}" on ${effectiveTargetPc.name}`);
  };

  const handleDropIntoPartyLoot = (item: SrdMagicItem) => {
    const loot = createPartyLootFromItem(item, 1);
    if (onAddPartyLootItem) {
      onAddPartyLootItem(loot);
      flashFeedback(`Dropped "${item.name}" into Party Loot`);
      return;
    }
    if (onUpdateCampaignKey) {
      const existing = Array.isArray(campaignData?.partyLootItems)
        ? (campaignData.partyLootItems as PartyLootItem[])
        : [];
      onUpdateCampaignKey('partyLootItems', [loot, ...existing]);
      flashFeedback(`Dropped "${item.name}" into Party Loot`);
    }
  };

  const categoryTabs: Array<{ id: SrdCompendiumCategory | 'all'; label: string; icon: React.ReactNode }> = [
    { id: 'all', label: 'All', icon: <Sparkles size={11} /> },
    ...(isGm ? [{ id: 'monster' as const, label: 'Monsters', icon: <Skull size={11} /> }] : []),
    { id: 'spell', label: 'Spells', icon: <Wand2 size={11} /> },
    { id: 'item', label: 'Items', icon: <Package size={11} /> },
    { id: 'condition', label: 'Conditions', icon: <ShieldAlert size={11} /> },
  ];

  return (
    <div className="flex flex-col gap-2.5 text-[var(--text-primary)]" data-testid="compendium-drawer">
      {/* Search Box */}
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            isGm
              ? 'Search SRD monsters, spells, magic items, conditions…'
              : 'Search SRD spells, magic items, conditions…'
          }
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] py-1.5 pl-8 pr-3 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
        />
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1">
        {categoryTabs.map((t) => {
          const active = category === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setCategory(t.id)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contextual Sub-Filters */}
      {category === 'spell' && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 px-2 py-1.5 text-[11px]">
          <select
            aria-label="Filter spell level"
            value={String(spellLevel)}
            onChange={(e) =>
              setSpellLevel(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
            }
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px]"
          >
            <option value="all">All Levels</option>
            <option value="0">Cantrip (0)</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
              <option key={lvl} value={lvl}>
                Level {lvl}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1 text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={concOnly}
              onChange={(e) => setConcOnly(e.target.checked)}
              className="rounded"
            />
            <span>Concentration</span>
          </label>
        </div>
      )}

      {isGm && category === 'monster' && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 px-2 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">Max CR:</span>
            <select
              aria-label="Filter max CR"
              value={String(maxCr)}
              onChange={(e) =>
                setMaxCr(e.target.value === 'all' ? 'all' : parseFloat(e.target.value))
              }
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px]"
            >
              <option value="all">Any CR</option>
              <option value="0.5">CR ≤ 1/2</option>
              <option value="2">CR ≤ 2</option>
              <option value="5">CR ≤ 5</option>
              <option value="10">CR ≤ 10</option>
              <option value="21">CR ≤ 21</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1" title="Number of monsters to spawn">
              <span className="text-[var(--text-muted)]">Qty</span>
              <input
                type="number"
                min={1}
                max={12}
                value={spawnCount}
                onChange={(e) => setSpawnCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                className="w-11 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 text-center font-mono text-[11px]"
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1" title="Auto-roll HP from hit dice formula">
              <input
                type="checkbox"
                checked={rollMonsterHp}
                onChange={(e) => setRollMonsterHp(e.target.checked)}
              />
              <span>Roll HP</span>
            </label>
            <button
              type="button"
              onClick={() => setSpawnHidden((h) => !h)}
              title="GM spawned monsters default to Private so statblocks/HP never leak to /player"
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                spawnHidden
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {spawnHidden ? <Lock size={10} /> : <Eye size={10} />}
              <span>{spawnHidden ? 'Private' : 'Party'}</span>
            </button>
          </div>
        </div>
      )}

      {category === 'item' && (
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 px-2 py-1.5 text-[11px]">
          <span className="text-[var(--text-muted)]">Rarity:</span>
          <select
            aria-label="Filter magic item rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value as MagicItemRarity | 'all')}
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px]"
          >
            <option value="all">All Rarities</option>
            <option value="Common">Common</option>
            <option value="Uncommon">Uncommon</option>
            <option value="Rare">Rare</option>
            <option value="Very Rare">Very Rare</option>
            <option value="Legendary">Legendary</option>
          </select>
        </div>
      )}

      {/* Target PC Selector when multiple PCs exist */}
      {availablePcs.length > 1 && !activePcId && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 px-2.5 py-1 text-[11px]">
          <span className="text-[var(--text-muted)]">Grant Target PC:</span>
          <select
            value={effectiveTargetPc?.id || ''}
            onChange={(e) => setSelectedTargetPcId(e.target.value)}
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 font-semibold"
          >
            {availablePcs.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Toast & Inline Roll Banner */}
      {feedbackToast && (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 font-sans text-xs font-medium text-emerald-300">
          <Check size={13} className="shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {lastInlineRoll && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-100">
          <div className="min-w-0">
            <span className="font-semibold text-sky-300">{lastInlineRoll.label}: </span>
            <span className="font-mono text-[11px] text-slate-300">{lastInlineRoll.breakdown}</span>
          </div>
          <button
            type="button"
            onClick={() => setSecretActionRoll((s) => !s)}
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              secretActionRoll ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
            title="Toggle secret GM statblock rolls"
          >
            {secretActionRoll ? '🤫 Secret' : '👁️ Public'}
          </button>
        </div>
      )}

      {/* Compendium Results List */}
      <div className={`space-y-1.5 ${compact ? 'max-h-[420px] overflow-y-auto pr-1' : ''}`}>
        {visibleResults.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center font-sans text-xs text-[var(--text-muted)]">
            No SRD entries match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          visibleResults.map((entry: SrdCompendiumItem) => {
            const isExpanded = expandedId === entry.id;
            const isMonster = entry.category === 'monster';

            return (
              <div
                key={entry.id}
                draggable={isGm && isMonster}
                onDragStart={(e) => {
                  if (!isGm || entry.category !== 'monster') return;
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData(
                    SRD_MONSTER_DRAG_MIME,
                    JSON.stringify({
                      monsterId: entry.monster.id,
                      slug: entry.monster.slug,
                      count: spawnCount,
                      rollHp: rollMonsterHp,
                      hidden: spawnHidden,
                    }),
                  );
                }}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/75 transition-colors hover:border-[var(--accent-primary)]/50"
              >
                {/* Summary Header */}
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    {isGm && isMonster && (
                      <GripVertical
                        size={13}
                        className="mt-0.5 shrink-0 cursor-grab text-[var(--text-muted)]"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-display text-xs font-bold text-[var(--text-primary)]">
                          {entry.name}
                        </span>
                        <span className="rounded bg-white/5 px-1.5 py-0.2 font-mono text-[9px] uppercase text-[var(--text-muted)]">
                          {entry.category}
                        </span>
                        {entry.category === 'spell' && entry.spell.concentration && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.2 font-sans text-[9px] font-bold text-amber-300">
                            Conc
                          </span>
                        )}
                      </div>
                      <div className="truncate font-sans text-[11px] text-[var(--text-muted)]">
                        {entry.subtitle}
                      </div>
                    </div>
                  </button>

                  {/* 1-Click Quick Action Pill */}
                  {isGm && entry.category === 'monster' && (
                    <button
                      type="button"
                      onClick={() => handleSpawnMonster(entry.monster)}
                      title="Add to Encounter Tracker & Tactical Map (or drag onto map)"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent-primary)] px-2 py-1 font-sans text-[10px] font-bold text-white shadow-sm hover:opacity-90"
                    >
                      <Plus size={11} />
                      <span>Encounter / Map</span>
                    </button>
                  )}

                  {entry.category === 'spell' && effectiveTargetPc && (
                    <button
                      type="button"
                      onClick={() => handleGrantSpell(entry.spell)}
                      title={`Add ${entry.spell.name} to ${effectiveTargetPc.name}'s Character Sheet`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-1 font-sans text-[10px] font-semibold text-sky-300 hover:bg-sky-500/25"
                    >
                      <UserPlus size={11} />
                      <span>+ Sheet</span>
                    </button>
                  )}

                  {entry.category === 'item' && (
                    <div className="flex shrink-0 items-center gap-1">
                      {effectiveTargetPc && (
                        <button
                          type="button"
                          onClick={() => handleGrantItem(entry.item)}
                          title={`Add ${entry.item.name} to ${effectiveTargetPc.name}'s Character Sheet`}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-1 font-sans text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          <UserPlus size={10} />
                          <span>Sheet</span>
                        </button>
                      )}
                      {(onAddPartyLootItem || onUpdateCampaignKey) && (
                        <button
                          type="button"
                          onClick={() => handleDropIntoPartyLoot(entry.item)}
                          title="Drop into shared Party Loot"
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-1 font-sans text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25"
                        >
                          <Coins size={10} />
                          <span>Loot</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded Statblock / Details */}
                {isExpanded && (
                  <div className="space-y-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 px-3 py-2.5 text-xs">
                    {entry.category === 'monster' && (
                      <>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 font-sans text-[11px] text-[var(--text-muted)]">
                          <span>
                            <strong className="text-[var(--text-primary)]">AC</strong> {entry.monster.ac}
                            {entry.monster.acDesc ? ` (${entry.monster.acDesc})` : ''}
                          </span>
                          <span>
                            <strong className="text-[var(--text-primary)]">HP</strong> {entry.monster.hp} ({entry.monster.hitDice})
                          </span>
                          <span>
                            <strong className="text-[var(--text-primary)]">Speed</strong> {entry.monster.speed}
                          </span>
                        </div>

                        {/* Ability Score Strip */}
                        <div className="grid grid-cols-6 gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-1.5 text-center font-mono text-[10px]">
                          {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map((ab) => {
                            const score = entry.monster.abilities[ab];
                            const mod = abilityMod(score);
                            return (
                              <div key={ab}>
                                <div className="font-bold text-[var(--text-muted)]">{ab}</div>
                                <div className="text-[var(--text-primary)]">
                                  {score} ({formatSigned(mod)})
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {entry.monster.damageResistances && entry.monster.damageResistances.length > 0 && (
                          <div className="text-[11px]">
                            <strong>Resistances:</strong> {entry.monster.damageResistances.join(', ')}
                          </div>
                        )}
                        {entry.monster.damageImmunities && entry.monster.damageImmunities.length > 0 && (
                          <div className="text-[11px]">
                            <strong>Immunities:</strong> {entry.monster.damageImmunities.join(', ')}
                          </div>
                        )}
                        <div className="text-[11px] text-[var(--text-muted)]">
                          <strong>Senses:</strong> {entry.monster.senses} · <strong>CR</strong> {entry.monster.cr} ({entry.monster.xp} XP)
                        </div>

                        {/* Traits */}
                        {entry.monster.traits.map((t) => (
                          <div key={t.name} className="text-[11px] leading-relaxed">
                            <strong className="italic text-[var(--text-primary)]">{t.name}.</strong>{' '}
                            <span className="text-[var(--text-muted)]">{t.desc}</span>
                          </div>
                        ))}

                        {/* Clickable Actions */}
                        {entry.monster.actions.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <div className="border-b border-[var(--border-subtle)] pb-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-amber-400">
                              Actions (Click to Roll)
                            </div>
                            {entry.monster.actions.map((act) => (
                              <div
                                key={act.name}
                                className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="font-semibold text-[var(--text-primary)]">
                                    {act.name}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1">
                                    {typeof act.attackBonus === 'number' && (
                                      <button
                                        type="button"
                                        onClick={() => handleMonsterActionRoll(entry.monster, act, 'attack')}
                                        className="inline-flex items-center gap-1 rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-300 hover:bg-sky-500/30"
                                      >
                                        <Dices size={10} />
                                        {formatSigned(act.attackBonus)} Hit
                                      </button>
                                    )}
                                    {act.damageFormula && (
                                      <button
                                        type="button"
                                        onClick={() => handleMonsterActionRoll(entry.monster, act, 'damage')}
                                        className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-300 hover:bg-rose-500/30"
                                      >
                                        <Dices size={10} />
                                        {act.damageFormula} {act.damageType || ''}
                                      </button>
                                    )}
                                    {act.saveAbility && act.saveDc && (
                                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                                        DC {act.saveDc} {act.saveAbility}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
                                  {act.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleSpawnMonster(entry.monster)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 font-sans text-xs font-bold text-white hover:opacity-90"
                          >
                            <Plus size={13} />
                            <span>
                              Add {spawnCount > 1 ? `${spawnCount}x ` : ''}
                              {entry.monster.name} to Encounter / Map
                            </span>
                          </button>
                        </div>
                      </>
                    )}

                    {entry.category === 'spell' && (
                      <>
                        <div className="grid grid-cols-2 gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2 text-[11px]">
                          <div>
                            <span className="text-[var(--text-muted)]">Time:</span>{' '}
                            <strong>{entry.spell.castingTime}</strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Range:</span>{' '}
                            <strong>{entry.spell.range}</strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Components:</span>{' '}
                            <strong>{entry.spell.components.join(', ')}</strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Duration:</span>{' '}
                            <strong>{entry.spell.duration}</strong>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {(entry.spell.damageFormula || entry.spell.healingFormula) && (
                            <button
                              type="button"
                              onClick={() => {
                                const formula =
                                  entry.spell.damageFormula || entry.spell.healingFormula || '1d8';
                                const roll = executeSheetRoll({
                                  actorName: effectiveTargetPc?.name || (isGm ? 'GM' : 'Caster'),
                                  label: `${entry.spell.name} (${entry.spell.damageType || 'healing'})`,
                                  baseFormula: formula,
                                  isD20: false,
                                  secretRoll: false,
                                });
                                pushCampaignRollIfPublic(roll);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 font-mono text-[11px] font-bold text-rose-300 hover:bg-rose-500/30"
                            >
                              <Dices size={11} />
                              Roll {entry.spell.damageFormula || entry.spell.healingFormula}{' '}
                              {entry.spell.damageType || 'HP'}
                            </button>
                          )}
                          {entry.spell.saveAbility && (
                            <span className="rounded-md bg-amber-500/20 px-2 py-1 font-mono text-[10px] font-bold text-amber-300">
                              {entry.spell.saveAbility} Save{entry.spell.halfOnSave ? ' (Half on Save)' : ''}
                            </span>
                          )}
                          {entry.spell.aoe && (
                            <span className="rounded-md bg-violet-500/20 px-2 py-1 font-mono text-[10px] font-bold text-violet-300">
                              AoE: {entry.spell.aoe.sizeFt}ft {entry.spell.aoe.shape}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {entry.spell.description.map((p, idx) => (
                            <p key={idx}>{p}</p>
                          ))}
                          {entry.spell.scalingSummary && (
                            <p className="rounded bg-white/5 p-1.5 text-[var(--text-primary)]">
                              <strong>At Higher Levels:</strong> {entry.spell.scalingSummary}
                            </p>
                          )}
                        </div>

                        {effectiveTargetPc && (
                          <button
                            type="button"
                            onClick={() => handleGrantSpell(entry.spell)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 font-sans text-xs font-bold text-white hover:bg-sky-500"
                          >
                            <UserPlus size={13} />
                            <span>Add to Character Sheet ({effectiveTargetPc.name})</span>
                          </button>
                        )}
                      </>
                    )}

                    {entry.category === 'item' && (
                      <>
                        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {entry.item.description}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {effectiveTargetPc && (
                            <button
                              type="button"
                              onClick={() => handleGrantItem(entry.item)}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-sans text-xs font-bold text-white hover:bg-emerald-500"
                            >
                              <UserPlus size={13} />
                              <span>Add to Character Sheet</span>
                            </button>
                          )}
                          {(onAddPartyLootItem || onUpdateCampaignKey) && (
                            <button
                              type="button"
                              onClick={() => handleDropIntoPartyLoot(entry.item)}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-2.5 py-1.5 font-sans text-xs font-bold text-amber-200 hover:bg-amber-500/30"
                            >
                              <Coins size={13} />
                              <span>Drop into Party Loot</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {entry.category === 'condition' && (
                      <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                        {entry.condition.bullets.map((b, i) => (
                          <li key={i}>{b.replace(/^-\s*/, '')}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CC-BY-4.0 Attribution Notice */}
      <p className="border-t border-[var(--border-subtle)] pt-2 font-sans text-[10px] leading-snug text-[var(--text-muted)]">
        {SRD_CC_BY_4_ATTRIBUTION}
      </p>
    </div>
  );
}

export default CompendiumDrawer;
