'use client';

import React, { useState, useMemo } from 'react';
import {
  UserCircle,
  Compass,
  Globe,
  Backpack,
  Swords,
  Plus,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  Flame,
  Coins,
  RotateCcw,
  Search,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  FileUp,
  Split,
  ShieldAlert,
  Calendar,
  Award,
  AtSign,
} from 'lucide-react';
import PcSheet from './PcSheet';
import { QuickDice } from './RunSessionView';
import { shortRest, longRest } from '@/lib/pc/rest';
import type {
  CoinPurse,
  InventoryItem,
  LoreAttitudeTag,
  PactMagicSlots,
  PcResourcePool,
  PlayerCharacter,
  PlayerJournalEntry,
  PlayerQuest,
  PlayerQuestStatus,
  RechargeTiming,
  TurnActionEconomy,
} from '@/lib/pc/types';

export type PlayerCompanionTabId = 'sheet' | 'quests' | 'world' | 'gear' | 'play';

export const PLAYER_COMPANION_TABS: Array<{
  id: PlayerCompanionTabId;
  label: string;
  shortLabel: string;
}> = [
  { id: 'sheet', label: 'Sheet', shortLabel: 'Sheet' },
  { id: 'quests', label: 'Quests & Clues', shortLabel: 'Quests' },
  { id: 'world', label: 'World & Journal', shortLabel: 'World' },
  { id: 'gear', label: 'Gear & Loot', shortLabel: 'Gear' },
  { id: 'play', label: 'Play (Table HUD)', shortLabel: 'Play HUD' },
];

const SRD_SPELLS_REFERENCE = [
  { name: 'Fire Bolt', level: 0, school: 'Evocation', time: '1 Action', range: '120 ft', concentration: false, summary: 'Ranged spell attack; 1d10 fire damage (scales with level).' },
  { name: 'Mage Hand', level: 0, school: 'Conjuration', time: '1 Action', range: '30 ft', concentration: false, summary: 'Spectral floating hand manipulates objects up to 10 lbs.' },
  { name: 'Guidance', level: 0, school: 'Divination', time: '1 Action', range: 'Touch', concentration: true, summary: 'Target adds +1d4 to one ability check of its choice.' },
  { name: 'Eldritch Blast', level: 0, school: 'Evocation', time: '1 Action', range: '120 ft', concentration: false, summary: 'Beam of crackling energy; 1d10 force damage per beam.' },
  { name: 'Shield', level: 1, school: 'Abjuration', time: '1 Reaction', range: 'Self', concentration: false, summary: '+5 bonus to AC until start of your next turn, including against triggering attack.' },
  { name: 'Healing Word', level: 1, school: 'Evocation', time: '1 Bonus Action', range: '60 ft', concentration: false, summary: 'Creature of your choice regains 1d4 + spellcasting modifier HP.' },
  { name: 'Bless', level: 1, school: 'Enchantment', time: '1 Action', range: '30 ft', concentration: true, summary: 'Up to 3 creatures add +1d4 to attack rolls and saving throws.' },
  { name: 'Faerie Fire', level: 1, school: 'Evocation', time: '1 Action', range: '60 ft', concentration: true, summary: 'DEX save or outlined in light; attacks against targets have advantage.' },
  { name: 'Detect Magic', level: 1, school: 'Divination', time: '1 Action (Ritual)', range: 'Self (30 ft)', concentration: true, summary: 'Sense presence and school of magic within 30 feet.' },
  { name: 'Misty Step', level: 2, school: 'Conjuration', time: '1 Bonus Action', range: 'Self', concentration: false, summary: 'Teleport up to 30 feet to an unoccupied space you can see.' },
  { name: 'Pass without Trace', level: 2, school: 'Abjuration', time: '1 Action', range: 'Self', concentration: true, summary: 'Chosen creatures within 30 ft gain +10 bonus to Dexterity (Stealth) checks.' },
  { name: 'Hold Person', level: 2, school: 'Enchantment', time: '1 Action', range: '60 ft', concentration: true, summary: 'WIS save or humanoid is Paralyzed for the duration.' },
  { name: 'Counterspell', level: 3, school: 'Abjuration', time: '1 Reaction', range: '60 ft', concentration: false, summary: 'Interrupt a creature in the process of casting a spell of 3rd level or lower.' },
  { name: 'Fireball', level: 3, school: 'Evocation', time: '1 Action', range: '150 ft', concentration: false, summary: '20-ft radius sphere; DEX save for 8d6 fire damage (half on success).' },
  { name: 'Haste', level: 3, school: 'Transmutation', time: '1 Action', range: '30 ft', concentration: true, summary: 'Doubles speed, +2 AC, advantage on DEX saves, and an extra action each turn.' },
  { name: 'Revivify', level: 3, school: 'Necromancy', time: '1 Action', range: 'Touch', concentration: false, summary: 'Return a creature that died within the last minute to life with 1 HP (300 gp diamonds).' },
  { name: 'Dimension Door', level: 4, school: 'Conjuration', time: '1 Action', range: '500 ft', concentration: false, summary: 'Teleport yourself and one willing creature up to 500 feet.' },
  { name: 'Polymorph', level: 4, school: 'Transmutation', time: '1 Action', range: '60 ft', concentration: true, summary: 'Transform a creature into a new beast form of equal or lower CR/level.' },
  { name: 'Greater Restoration', level: 5, school: 'Abjuration', time: '1 Action', range: 'Touch', concentration: false, summary: 'End one debilitating effect (exhaustion, charmed, petrified, curse, ability reduction).' },
];

const ATTITUDE_STYLES: Record<LoreAttitudeTag, string> = {
  friendly: 'border-forest/40 bg-forest/10 text-forest',
  neutral: 'border-rule bg-parchment text-ink-soft',
  suspicious: 'border-gold/50 bg-gold/15 text-gold-deep',
  hostile: 'border-wax/40 bg-wax/10 text-wax',
};

const DEFAULT_TURN_ECONOMY: TurnActionEconomy = {
  actionUsed: false,
  bonusActionUsed: false,
  movementUsed: false,
  reactionUsed: false,
  freeInteractionUsed: false,
};

export default function PlayerCompanionWorkspace({
  activeTab,
  onSelectTab,
  pcs,
  openPcMap,
  isPro,
  uploadingChar,
  uploadError,
  onTogglePcOpen,
  onAddPc,
  onUpdatePc,
  onRemovePc,
  onUploadClick,
  get,
  setVal,
}: {
  activeTab: PlayerCompanionTabId;
  onSelectTab: (tab: PlayerCompanionTabId) => void;
  pcs: PlayerCharacter[];
  openPcMap: Record<string, boolean>;
  isPro: boolean;
  uploadingChar?: boolean;
  uploadError?: string;
  onTogglePcOpen: (id: string) => void;
  onAddPc: () => void;
  onUpdatePc: (pc: PlayerCharacter) => void;
  onRemovePc: (id: string) => void;
  onUploadClick?: () => void;
  get: (key: string, fallback: any) => any;
  setVal: (key: string, val: any) => void;
}) {
  const [selectedPcIdx, setSelectedPcIdx] = useState(0);
  const activePc: PlayerCharacter | undefined = pcs[selectedPcIdx] ?? pcs[0];

  // Companion quests & clues stored in campaign data (`__playerCompanionQuests`)
  const companionQuests = (get('__playerCompanionQuests', []) as PlayerQuest[]) || [];
  const setCompanionQuests = (next: PlayerQuest[]) => setVal('__playerCompanionQuests', next);

  // Companion journal entries stored in campaign data (`__playerCompanionJournal`)
  const companionJournal = (get('__playerCompanionJournal', []) as PlayerJournalEntry[]) || [];
  const setCompanionJournal = (next: PlayerJournalEntry[]) => setVal('__playerCompanionJournal', next);

  // Known NPCs, Visited Locations, Factions
  const npcs = (get('npcs', []) as Array<Record<string, any>>) || [];
  const locations = (get('locations', []) as Array<Record<string, any>>) || [];
  const factions = (get('factions', []) as Array<Record<string, any>>) || [];

  // --- Sheet Tab Local Form State ---
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolMax, setNewPoolMax] = useState(3);
  const [newPoolRecharge, setNewPoolRecharge] = useState<RechargeTiming>('short');

  // --- Quests & Clues Form State ---
  const [questCategoryFilter, setQuestCategoryFilter] = useState<'all' | 'quest' | 'goal' | 'rumor' | 'mystery'>('all');
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestCategory, setNewQuestCategory] = useState<'quest' | 'goal' | 'rumor' | 'mystery'>('quest');
  const [newQuestNotes, setNewQuestNotes] = useState('');

  // --- World & Journal Form State ---
  const [newNpcName, setNewNpcName] = useState('');
  const [newNpcRole, setNewNpcRole] = useState('');
  const [newNpcAttitude, setNewNpcAttitude] = useState<LoreAttitudeTag>('neutral');
  const [newNpcNotes, setNewNpcNotes] = useState('');

  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState('');
  const [newLocNotes, setNewLocNotes] = useState('');

  const [newFacName, setNewFacName] = useState('');
  const [newFacNotes, setNewFacNotes] = useState('');

  const [journalSessionNum, setJournalSessionNum] = useState<number>(() => (companionJournal[0]?.sessionNumber ?? 0) + 1);
  const [journalDate, setJournalDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [journalTitle, setJournalTitle] = useState('');
  const [journalContent, setJournalContent] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // --- Gear & Loot Splitter State ---
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemWeight, setNewItemWeight] = useState(0);
  const [newItemNotes, setNewItemNotes] = useState('');
  const [lootSplitGold, setLootSplitGold] = useState(100);
  const [lootSplitPartySize, setLootSplitPartySize] = useState(4);

  // --- Play (Table HUD) State ---
  const [spellQuery, setSpellQuery] = useState('');
  const [damageTakenInput, setDamageTakenInput] = useState(10);

  const allMentionableEntities = useMemo(() => {
    const out: Array<{ id: string; name: string; type: string }> = [];
    npcs.forEach((n, i) => {
      if (n?.name) out.push({ id: n.id || `npc-${i}`, name: n.name, type: 'NPC' });
    });
    locations.forEach((l, i) => {
      if (l?.name) out.push({ id: l.id || `loc-${i}`, name: l.name, type: 'Location' });
    });
    factions.forEach((f, i) => {
      if (f?.name) out.push({ id: f.id || `fac-${i}`, name: f.name, type: 'Faction' });
    });
    return out;
  }, [npcs, locations, factions]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allMentionableEntities.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, allMentionableEntities]);

  const filteredSpells = useMemo(() => {
    const q = spellQuery.trim().toLowerCase();
    if (!q) return SRD_SPELLS_REFERENCE;
    return SRD_SPELLS_REFERENCE.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.school.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q),
    );
  }, [spellQuery]);

  // Helper to patch the active PC
  const patchActivePc = (patch: Partial<PlayerCharacter>) => {
    if (!activePc) return;
    onUpdatePc({ ...activePc, ...patch, updatedAt: Date.now() });
  };

  const turnEconomy: TurnActionEconomy = activePc?.turnEconomy ?? DEFAULT_TURN_ECONOMY;

  const toggleTurnEconomyItem = (key: keyof TurnActionEconomy) => {
    patchActivePc({
      turnEconomy: {
        ...turnEconomy,
        [key]: !turnEconomy[key],
      },
    });
  };

  const resetNextTurn = () => {
    patchActivePc({
      turnEconomy: { ...DEFAULT_TURN_ECONOMY },
    });
  };

  return (
    <div className="space-y-4">
      {/* Standalone Player Companion Mode Banner & Tab Navigation */}
      <div className="rounded-lg border border-indigo-500/30 bg-parchment-soft p-3 shadow-sm">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded border border-indigo-500/40 bg-indigo-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Player Companion Mode
            </span>
            <span className="font-serif text-xs text-ink-soft">
              Adventurer&apos;s Notebook &amp; Table HUD — built for playing in any campaign.
            </span>
          </div>
          {pcs.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase text-ink-faint">Character:</span>
              {pcs.map((pc, idx) => (
                <button
                  key={pc.id}
                  type="button"
                  onClick={() => setSelectedPcIdx(idx)}
                  className={`rounded border px-2 py-0.5 font-display text-xs ${
                    selectedPcIdx === idx
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-600 font-semibold'
                      : 'border-rule bg-parchment text-ink-soft'
                  }`}
                >
                  {pc.name || `PC ${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav
          role="tablist"
          aria-label="Player Companion Workspace Tabs"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sheet'}
            onClick={() => onSelectTab('sheet')}
            className={`flex items-center justify-center gap-1.5 rounded px-3 py-2 font-display text-xs uppercase tracking-wider transition-all ${
              activeTab === 'sheet'
                ? 'bg-wax text-ivory shadow-sm'
                : 'border border-rule bg-parchment text-ink-soft hover:text-ink'
            }`}
          >
            <UserCircle size={14} />
            <span>Sheet</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quests'}
            onClick={() => onSelectTab('quests')}
            className={`flex items-center justify-center gap-1.5 rounded px-3 py-2 font-display text-xs uppercase tracking-wider transition-all ${
              activeTab === 'quests'
                ? 'bg-wax text-ivory shadow-sm'
                : 'border border-rule bg-parchment text-ink-soft hover:text-ink'
            }`}
          >
            <Compass size={14} />
            <span>Quests &amp; Clues</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'world'}
            onClick={() => onSelectTab('world')}
            className={`flex items-center justify-center gap-1.5 rounded px-3 py-2 font-display text-xs uppercase tracking-wider transition-all ${
              activeTab === 'world'
                ? 'bg-wax text-ivory shadow-sm'
                : 'border border-rule bg-parchment text-ink-soft hover:text-ink'
            }`}
          >
            <Globe size={14} />
            <span>World &amp; Journal</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'gear'}
            onClick={() => onSelectTab('gear')}
            className={`flex items-center justify-center gap-1.5 rounded px-3 py-2 font-display text-xs uppercase tracking-wider transition-all ${
              activeTab === 'gear'
                ? 'bg-wax text-ivory shadow-sm'
                : 'border border-rule bg-parchment text-ink-soft hover:text-ink'
            }`}
          >
            <Backpack size={14} />
            <span>Gear &amp; Loot</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'play'}
            onClick={() => onSelectTab('play')}
            className={`col-span-2 flex items-center justify-center gap-1.5 rounded px-3 py-2 font-display text-xs uppercase tracking-wider transition-all sm:col-span-1 ${
              activeTab === 'play'
                ? 'bg-wax text-ivory shadow-sm'
                : 'border border-rule bg-parchment text-ink-soft hover:text-ink'
            }`}
          >
            <Swords size={14} />
            <span>Play (Table HUD)</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: SHEET */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-parchment p-3.5 shadow-card">
            <div>
              <h2 className="font-display text-lg tracking-wide text-ink">
                Character Sheet &amp; Resource Dashboard
              </h2>
              <p className="font-serif text-xs text-ink-soft">
                Import a character sheet PDF/JSON or edit vitals, spell slots, class resources, and rest recovery manually.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onUploadClick && (
                <button
                  type="button"
                  onClick={onUploadClick}
                  disabled={uploadingChar}
                  className="inline-flex items-center gap-1.5 rounded border border-brass-deep bg-brass/15 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment disabled:opacity-50"
                >
                  <FileUp size={13} />
                  {uploadingChar ? 'Parsing Sheet…' : 'Import Character Sheet'}
                </button>
              )}
              <button
                type="button"
                onClick={onAddPc}
                className="inline-flex items-center gap-1.5 rounded border border-wax bg-wax px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ivory hover:bg-wax/90"
              >
                <Plus size={13} /> Add Character
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="rounded border border-crimson/40 bg-crimson/10 px-3 py-2 font-serif text-xs text-crimson">
              {uploadError}
            </div>
          )}

          {!activePc ? (
            <div className="rounded-lg border border-rule bg-parchment p-8 text-center shadow-card">
              <p className="font-serif text-sm italic text-ink-soft">
                No character sheet created yet. Click &ldquo;Add Character&rdquo; or &ldquo;Import Character Sheet&rdquo; above to begin!
              </p>
            </div>
          ) : (
            <>
              {/* Quick Rest, Inspiration, Pact Magic & Class Resource Pools Dashboard */}
              <div className="grid gap-3 rounded-lg border border-rule bg-parchment p-4 shadow-card md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-xs font-semibold uppercase tracking-wider text-brass-deep">
                      Rest &amp; Heroic Inspiration
                    </span>
                    <button
                      type="button"
                      onClick={() => patchActivePc({ inspiration: !activePc.inspiration })}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                        activePc.inspiration
                          ? 'border-gold bg-gold/20 text-gold-deep'
                          : 'border-rule bg-parchment-soft text-ink-faint'
                      }`}
                    >
                      <Sparkles size={11} />
                      {activePc.inspiration ? 'Inspired' : 'No Inspiration'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdatePc(shortRest(activePc))}
                      className="inline-flex items-center gap-1.5 rounded border border-gold/50 bg-gold/15 px-3 py-1.5 font-mono text-xs font-semibold text-gold-deep hover:bg-gold/25"
                    >
                      <Sun size={13} /> Short Rest
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePc(longRest(activePc))}
                      className="inline-flex items-center gap-1.5 rounded border border-wax/50 bg-wax/15 px-3 py-1.5 font-mono text-xs font-semibold text-wax hover:bg-wax/25"
                    >
                      <Moon size={13} /> Long Rest
                    </button>
                  </div>

                  {/* Pact Magic */}
                  <div className="space-y-1.5 border-t border-rule pt-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                        <Flame size={11} className="text-gold-deep" /> Warlock Pact Magic
                      </span>
                      {activePc.pactSlots ? (
                        <button
                          type="button"
                          onClick={() => patchActivePc({ pactSlots: null })}
                          className="font-mono text-[10px] text-crimson hover:underline"
                        >
                          Remove Pact Slots
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => patchActivePc({ pactSlots: { level: 1, max: 2, used: 0 } })}
                          className="font-mono text-[10px] text-brass-deep hover:underline"
                        >
                          + Enable Pact Slots
                        </button>
                      )}
                    </div>
                    {activePc.pactSlots && (
                      <div className="flex items-center justify-between rounded border border-gold/40 bg-gold/10 px-2.5 py-1.5">
                        <span className="font-mono text-xs text-gold-deep">
                          Level {activePc.pactSlots.level} ({activePc.pactSlots.max - activePc.pactSlots.used}/{activePc.pactSlots.max} available)
                        </span>
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: activePc.pactSlots.max }, (_, idx) => {
                            const used = idx < (activePc.pactSlots?.used ?? 0);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  const ps = activePc.pactSlots!;
                                  const nextUsed = ps.used === idx + 1 ? idx : idx + 1;
                                  patchActivePc({
                                    pactSlots: { ...ps, used: Math.max(0, Math.min(ps.max, nextUsed)) },
                                  });
                                }}
                                className={`size-4 rounded-full border ${
                                  used ? 'border-gold-deep bg-gold-deep/30' : 'border-gold-deep bg-gold'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trackable Class Resource Pools */}
                <div className="space-y-2">
                  <div className="font-display text-xs font-semibold uppercase tracking-wider text-brass-deep">
                    Class &amp; Spell Resource Pools
                  </div>
                  <div className="space-y-1.5">
                    {(activePc.resourcePools ?? []).map((pool) => (
                      <div
                        key={pool.id}
                        className="flex items-center justify-between rounded border border-rule bg-parchment-soft px-2.5 py-1.5"
                      >
                        <div>
                          <div className="font-serif text-xs font-semibold text-ink">{pool.name}</div>
                          <span className="font-mono text-[9px] uppercase text-ink-faint">
                            Recharges on {pool.rechargeOn}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next = (activePc.resourcePools ?? []).map((p) =>
                                p.id === pool.id ? { ...p, current: Math.max(0, p.current - 1) } : p,
                              );
                              patchActivePc({ resourcePools: next });
                            }}
                            className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-xs"
                          >
                            -
                          </button>
                          <span className="font-mono text-xs font-bold">
                            {pool.current}/{pool.max}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (activePc.resourcePools ?? []).map((p) =>
                                p.id === pool.id ? { ...p, current: Math.min(p.max, p.current + 1) } : p,
                              );
                              patchActivePc({ resourcePools: next });
                            }}
                            className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-xs"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (activePc.resourcePools ?? []).filter((p) => p.id !== pool.id);
                              patchActivePc({ resourcePools: next });
                            }}
                            className="text-ink-faint hover:text-crimson"
                          >
                            <Trash2 size={12} />
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
                      placeholder="Resource (e.g. Ki, Sorcery Points, Rage)..."
                      className="min-w-[140px] flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
                    />
                    <input
                      type="number"
                      min={1}
                      value={newPoolMax}
                      onChange={(e) => setNewPoolMax(parseInt(e.target.value, 10) || 1)}
                      className="w-12 rounded border border-rule bg-parchment-soft px-1.5 py-1 text-center font-mono text-xs"
                    />
                    <select
                      value={newPoolRecharge}
                      onChange={(e) => setNewPoolRecharge(e.target.value as RechargeTiming)}
                      className="rounded border border-rule bg-parchment-soft px-1.5 py-1 font-mono text-[10px]"
                    >
                      <option value="short">Short Rest</option>
                      <option value="long">Long Rest</option>
                      <option value="dawn">Dawn</option>
                      <option value="manual">Manual</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newPoolName.trim()) return;
                        const pool: PcResourcePool = {
                          id: `pool_${Date.now()}`,
                          name: newPoolName.trim(),
                          current: Math.max(1, newPoolMax),
                          max: Math.max(1, newPoolMax),
                          rechargeOn: newPoolRecharge,
                        };
                        patchActivePc({
                          resourcePools: [...(activePc.resourcePools ?? []), pool],
                        });
                        setNewPoolName('');
                      }}
                      className="rounded border border-wax bg-wax px-2.5 py-1 font-mono text-[10px] font-semibold text-ivory"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Full Interactive Character Sheet */}
              <PcSheet
                pc={activePc}
                open={openPcMap[activePc.id] ?? true}
                onToggleOpen={() => onTogglePcOpen(activePc.id)}
                onChange={onUpdatePc}
                onRemove={() => onRemovePc(activePc.id)}
              />
            </>
          )}
        </div>
      )}

      {/* TAB 2: QUESTS & CLUES */}
      {activeTab === 'quests' && (
        <div className="space-y-4 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <div>
              <h2 className="font-display text-lg tracking-wide text-ink">
                Quests, Personal Goals, Rumors &amp; Mysteries Board
              </h2>
              <p className="font-serif text-xs text-ink-soft">
                Track active party quests, personal character arcs, tavern rumors, and unsolved mysteries.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'quest', 'goal', 'rumor', 'mystery'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setQuestCategoryFilter(cat)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
                    questCategoryFilter === cat
                      ? 'border-wax bg-wax text-ivory font-semibold'
                      : 'border-rule bg-parchment-soft text-ink-soft hover:text-ink'
                  }`}
                >
                  {cat === 'all' ? 'All Entries' : `${cat}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Add Quest / Clue Form */}
          <div className="grid gap-2 rounded border border-rule bg-parchment-soft p-3 sm:grid-cols-12">
            <select
              value={newQuestCategory}
              onChange={(e) => setNewQuestCategory(e.target.value as any)}
              className="rounded border border-rule bg-parchment px-2 py-1.5 font-mono text-xs text-ink sm:col-span-2"
            >
              <option value="quest">Active Quest</option>
              <option value="goal">Personal Goal</option>
              <option value="rumor">Rumor</option>
              <option value="mystery">Mystery / Clue</option>
            </select>
            <input
              type="text"
              value={newQuestTitle}
              onChange={(e) => setNewQuestTitle(e.target.value)}
              placeholder="Title (e.g. Investigate the Whispering Cairn)..."
              className="rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink sm:col-span-4"
            />
            <input
              type="text"
              value={newQuestNotes}
              onChange={(e) => setNewQuestNotes(e.target.value)}
              placeholder="Clues, NPCs involved, or promised reward..."
              className="rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink sm:col-span-4"
            />
            <button
              type="button"
              onClick={() => {
                if (!newQuestTitle.trim()) return;
                const item: PlayerQuest = {
                  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  title: newQuestTitle.trim(),
                  status: 'active',
                  notes: newQuestNotes.trim(),
                  linkedEntityIds: [],
                  sharedWithGm: false,
                  category: newQuestCategory,
                  updatedAt: Date.now(),
                };
                setCompanionQuests([item, ...companionQuests]);
                setNewQuestTitle('');
                setNewQuestNotes('');
              }}
              className="inline-flex items-center justify-center gap-1 rounded border border-wax bg-wax px-3 py-1.5 font-mono text-xs font-semibold text-ivory hover:bg-wax/90 sm:col-span-2"
            >
              <Plus size={13} /> Add Entry
            </button>
          </div>

          {/* Quests & Clues Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {companionQuests
              .filter((q) => questCategoryFilter === 'all' || (q.category ?? 'quest') === questCategoryFilter)
              .map((q) => (
                <div
                  key={q.id}
                  className="space-y-2 rounded border border-rule bg-parchment-soft p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-brass-deep">
                        {q.category ?? 'quest'}
                      </span>
                      <h4
                        className={`mt-1 font-display text-sm font-semibold ${
                          q.status === 'completed' ? 'line-through text-ink-faint' : 'text-ink'
                        }`}
                      >
                        {q.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1">
                      {(['active', 'completed', 'failed'] as PlayerQuestStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            setCompanionQuests(
                              companionQuests.map((item) => (item.id === q.id ? { ...item, status: st } : item)),
                            )
                          }
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                            q.status === st
                              ? st === 'completed'
                                ? 'border-forest/50 bg-forest/15 text-forest font-bold'
                                : st === 'failed'
                                  ? 'border-wax/50 bg-wax/15 text-wax font-bold'
                                  : 'border-gold/50 bg-gold/15 text-gold-deep font-bold'
                              : 'border-rule bg-parchment text-ink-faint'
                          }`}
                        >
                          {st === 'active' && <Clock size={10} className="inline mr-0.5" />}
                          {st === 'completed' && <CheckCircle2 size={10} className="inline mr-0.5" />}
                          {st === 'failed' && <XCircle size={10} className="inline mr-0.5" />}
                          {st}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCompanionQuests(companionQuests.filter((item) => item.id !== q.id))}
                        className="text-ink-faint hover:text-crimson"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={q.notes}
                    onChange={(e) =>
                      setCompanionQuests(
                        companionQuests.map((item) =>
                          item.id === q.id ? { ...item, notes: e.target.value } : item,
                        ),
                      )
                    }
                    rows={2}
                    placeholder="Add clues, leads, or notes..."
                    className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-xs text-ink"
                  />
                </div>
              ))}
          </div>
          {companionQuests.length === 0 && (
            <p className="py-6 text-center font-serif text-xs italic text-ink-faint">
              No quests, personal goals, or rumors logged yet. Add your first lead above!
            </p>
          )}
        </div>
      )}

      {/* TAB 3: WORLD & JOURNAL */}
      {activeTab === 'world' && (
        <div className="space-y-6">
          {/* Known NPCs, Visited Locations, and Factions */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Player-Known NPCs */}
            <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <h3 className="font-display text-base tracking-wide text-ink">
                Known NPCs ({npcs.length})
              </h3>
              <div className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
                <input
                  type="text"
                  value={newNpcName}
                  onChange={(e) => setNewNpcName(e.target.value)}
                  placeholder="NPC Name..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newNpcRole}
                    onChange={(e) => setNewNpcRole(e.target.value)}
                    placeholder="Role / Faction..."
                    className="flex-1 rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                  />
                  <select
                    value={newNpcAttitude}
                    onChange={(e) => setNewNpcAttitude(e.target.value as LoreAttitudeTag)}
                    className="rounded border border-rule bg-parchment px-1.5 py-1 font-mono text-[10px]"
                  >
                    <option value="friendly">Friendly</option>
                    <option value="neutral">Neutral</option>
                    <option value="suspicious">Suspicious</option>
                    <option value="hostile">Hostile</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={newNpcNotes}
                  onChange={(e) => setNewNpcNotes(e.target.value)}
                  placeholder="Player notes & impressions..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newNpcName.trim()) return;
                    setVal('npcs', [
                      ...npcs,
                      {
                        id: `npc_${Date.now()}`,
                        name: newNpcName.trim(),
                        archetype: newNpcRole.trim(),
                        attitudeTag: newNpcAttitude,
                        notes: newNpcNotes.trim(),
                      },
                    ]);
                    setNewNpcName('');
                    setNewNpcRole('');
                    setNewNpcNotes('');
                  }}
                  className="w-full rounded border border-wax bg-wax py-1 font-mono text-xs font-semibold text-ivory"
                >
                  + Add Known NPC
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {npcs.map((n, idx) => {
                  const att = (n.attitudeTag as LoreAttitudeTag) || 'neutral';
                  return (
                    <div key={n.id || idx} className="space-y-1 rounded border border-rule bg-parchment-soft p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display font-semibold text-ink">{n.name || `NPC ${idx + 1}`}</span>
                        <select
                          value={att}
                          onChange={(e) => {
                            const next = [...npcs];
                            next[idx] = { ...n, attitudeTag: e.target.value };
                            setVal('npcs', next);
                          }}
                          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase ${ATTITUDE_STYLES[att]}`}
                        >
                          <option value="friendly">Friendly</option>
                          <option value="neutral">Neutral</option>
                          <option value="suspicious">Suspicious</option>
                          <option value="hostile">Hostile</option>
                        </select>
                      </div>
                      {(n.archetype || n.faction) && (
                        <div className="font-serif text-[11px] italic text-ink-mute">
                          {[n.archetype, n.faction].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {n.notes && <p className="font-serif text-ink-soft">{n.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Visited Locations */}
            <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <h3 className="font-display text-base tracking-wide text-ink">
                Visited Locations ({locations.length})
              </h3>
              <div className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
                <input
                  type="text"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Location Name..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <input
                  type="text"
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                  placeholder="Region / Type (e.g. Port Town, Dungeon)..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <input
                  type="text"
                  value={newLocNotes}
                  onChange={(e) => setNewLocNotes(e.target.value)}
                  placeholder="Points of interest, shops, dangers..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newLocName.trim()) return;
                    setVal('locations', [
                      ...locations,
                      {
                        id: `loc_${Date.now()}`,
                        name: newLocName.trim(),
                        type: newLocType.trim(),
                        notes: newLocNotes.trim(),
                      },
                    ]);
                    setNewLocName('');
                    setNewLocType('');
                    setNewLocNotes('');
                  }}
                  className="w-full rounded border border-wax bg-wax py-1 font-mono text-xs font-semibold text-ivory"
                >
                  + Add Visited Location
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {locations.map((loc, idx) => (
                  <div key={loc.id || idx} className="space-y-1 rounded border border-rule bg-parchment-soft p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-display font-semibold text-ink">{loc.name || `Location ${idx + 1}`}</span>
                      {loc.type && (
                        <span className="font-mono text-[9px] uppercase text-brass-deep">{loc.type}</span>
                      )}
                    </div>
                    {loc.notes && <p className="font-serif text-ink-soft">{loc.notes}</p>}
                  </div>
                ))}
              </div>
            </section>

            {/* Known Factions */}
            <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <h3 className="font-display text-base tracking-wide text-ink">
                Factions &amp; Standing ({factions.length})
              </h3>
              <div className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
                <input
                  type="text"
                  value={newFacName}
                  onChange={(e) => setNewFacName(e.target.value)}
                  placeholder="Faction Name..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <input
                  type="text"
                  value={newFacNotes}
                  onChange={(e) => setNewFacNotes(e.target.value)}
                  placeholder="Goals, allies, or reputation notes..."
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newFacName.trim()) return;
                    setVal('factions', [
                      ...factions,
                      {
                        id: `fac_${Date.now()}`,
                        name: newFacName.trim(),
                        renown: 0,
                        identity: newFacNotes.trim(),
                      },
                    ]);
                    setNewFacName('');
                    setNewFacNotes('');
                  }}
                  className="w-full rounded border border-wax bg-wax py-1 font-mono text-xs font-semibold text-ivory"
                >
                  + Add Faction
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {factions.map((fac, idx) => (
                  <div key={fac.id || idx} className="space-y-1 rounded border border-rule bg-parchment-soft p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-display font-semibold text-ink">{fac.name || `Faction ${idx + 1}`}</span>
                      <span className="font-mono text-[10px] text-brass-deep">
                        Renown: {typeof fac.renown === 'number' ? fac.renown : 0}
                      </span>
                    </div>
                    {(fac.identity || fac.notes) && (
                      <p className="font-serif text-ink-soft">{fac.identity || fac.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Session Recaps & Journal with @-Mention Entity Linking */}
          <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-wax" />
                <div>
                  <h3 className="font-display text-lg tracking-wide text-ink">
                    Session Recaps &amp; Journal (@-Mention Linking)
                  </h3>
                  <p className="font-serif text-xs text-ink-faint">
                    Type <code className="font-mono text-wax">@Name</code> to link any known NPC, Location, or Faction in your recap.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3">
              <div className="grid gap-2 sm:grid-cols-12">
                <div className="flex items-center gap-1.5 sm:col-span-2">
                  <span className="font-mono text-[10px] uppercase text-ink-soft">Session #</span>
                  <input
                    type="number"
                    min={1}
                    value={journalSessionNum}
                    onChange={(e) => setJournalSessionNum(parseInt(e.target.value, 10) || 1)}
                    className="w-14 rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
                <input
                  type="date"
                  value={journalDate}
                  onChange={(e) => setJournalDate(e.target.value)}
                  className="rounded border border-rule bg-parchment px-2.5 py-1 font-mono text-xs text-ink sm:col-span-3"
                />
                <input
                  type="text"
                  value={journalTitle}
                  onChange={(e) => setJournalTitle(e.target.value)}
                  placeholder="Session Title..."
                  className="rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink sm:col-span-5"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!journalTitle.trim() && !journalContent.trim()) return;
                    const linkedIds = allMentionableEntities
                      .filter((ent) => journalContent.toLowerCase().includes(`@${ent.name.toLowerCase()}`))
                      .map((ent) => ent.id);
                    const entry: PlayerJournalEntry = {
                      id: `j_${Date.now()}`,
                      sessionNumber: journalSessionNum,
                      date: journalDate,
                      title: journalTitle.trim() || `Session ${journalSessionNum}`,
                      content: journalContent.trim(),
                      sharedWithGm: false,
                      linkedEntityIds: linkedIds,
                      updatedAt: Date.now(),
                    };
                    setCompanionJournal([entry, ...companionJournal]);
                    setJournalSessionNum((n) => n + 1);
                    setJournalTitle('');
                    setJournalContent('');
                    setMentionQuery(null);
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded border border-wax bg-wax px-3 py-1 font-mono text-xs font-semibold text-ivory sm:col-span-2"
                >
                  <Plus size={13} /> Save Recap
                </button>
              </div>

              <div className="relative">
                <textarea
                  value={journalContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setJournalContent(val);
                    const match = val.match(/@([\p{L}\p{N}_ ]{0,25})$/u);
                    setMentionQuery(match ? match[1] : null);
                  }}
                  rows={3}
                  placeholder="Write what happened this session... Type @ to mention an NPC, Location, or Faction!"
                  className="w-full rounded border border-rule bg-parchment px-2.5 py-1.5 font-serif text-xs text-ink"
                />
                {mentionQuery !== null && mentionSuggestions.length > 0 && (
                  <div className="absolute left-2 top-full z-20 mt-1 w-64 rounded border border-rule bg-parchment p-1 shadow-lg">
                    {mentionSuggestions.map((ent) => (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => {
                          const replaced = journalContent.replace(
                            /@([\p{L}\p{N}_ ]{0,25})$/u,
                            `@${ent.name} `,
                          );
                          setJournalContent(replaced);
                          setMentionQuery(null);
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left font-serif text-xs text-ink hover:bg-parchment-deep"
                      >
                        <span>@{ent.name}</span>
                        <span className="font-mono text-[9px] uppercase text-ink-faint">{ent.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              {companionJournal.map((j) => (
                <div key={j.id} className="space-y-1.5 rounded border border-rule bg-parchment-soft p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold uppercase text-wax">
                        Session {j.sessionNumber} · {j.date}
                      </span>
                      <h4 className="font-display text-sm font-semibold text-ink">{j.title}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompanionJournal(companionJournal.filter((item) => item.id !== j.id))}
                      className="text-ink-faint hover:text-crimson"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap font-serif text-xs leading-relaxed text-ink">
                    {j.content}
                  </p>
                  {j.linkedEntityIds && j.linkedEntityIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {j.linkedEntityIds.map((id) => {
                        const ent = allMentionableEntities.find((e) => e.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-0.5 rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 font-mono text-[9px] text-gold-deep"
                          >
                            <AtSign size={9} />
                            {ent?.name ?? id}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: GEAR & LOOT */}
      {activeTab === 'gear' && (
        <div className="space-y-4">
          {!activePc ? (
            <div className="rounded-lg border border-rule bg-parchment p-8 text-center">
              <p className="font-serif text-sm italic text-ink-soft">
                Create a character in the Sheet tab first to track personal gear, attunement, and coins.
              </p>
            </div>
          ) : (
            <>
              <section className="space-y-4 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
                  <div>
                    <h2 className="font-display text-lg tracking-wide text-ink">
                      Equipped Items, Attunement (Max 3) &amp; Coin Purse
                    </h2>
                    <p className="font-serif text-xs text-ink-faint">
                      Carried Weight:{' '}
                      <span className="font-mono font-bold text-ink">
                        {(activePc.inventory ?? []).reduce((s, i) => s + (i.weight ?? 0) * (i.qty ?? 1), 0)} lb.
                      </span>
                    </p>
                  </div>

                  {/* 3-Slot Attunement Pips */}
                  <div className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-3 py-1.5">
                    <Sparkles size={13} className="text-gold-deep" />
                    <span className="font-mono text-[10px] font-semibold uppercase text-ink-soft">
                      Attunement ({activePc.attunedCount ?? 0}/3):
                    </span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((n) => {
                        const active = (activePc.attunedCount ?? 0) >= n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              patchActivePc({
                                attunedCount: (activePc.attunedCount ?? 0) === n ? n - 1 : n,
                              })
                            }
                            className={`size-4 rounded-full border ${
                              active ? 'border-gold-deep bg-gold' : 'border-rule bg-parchment'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Coin Purse */}
                <div className="grid grid-cols-5 gap-2">
                  {(['cp', 'sp', 'ep', 'gp', 'pp'] as Array<keyof CoinPurse>).map((coin) => {
                    const purse = activePc.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                    return (
                      <div key={coin} className="rounded border border-rule bg-parchment-soft p-2 text-center">
                        <div className="font-mono text-[10px] font-bold uppercase text-brass-deep">{coin}</div>
                        <input
                          type="number"
                          min={0}
                          value={purse[coin] ?? 0}
                          onChange={(e) =>
                            patchActivePc({
                              currency: { ...purse, [coin]: Math.max(0, parseInt(e.target.value, 10) || 0) },
                            })
                          }
                          className="mt-1 w-full border-b border-rule bg-transparent text-center font-mono text-sm font-bold text-ink"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Add Equipment Row */}
                <div className="grid gap-2 rounded border border-rule bg-parchment-soft p-2.5 sm:grid-cols-12">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item name..."
                    className="rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink sm:col-span-5"
                  />
                  <input
                    type="number"
                    min={1}
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(parseInt(e.target.value, 10) || 1)}
                    placeholder="Qty"
                    className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-2"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={newItemWeight}
                    onChange={(e) => setNewItemWeight(parseFloat(e.target.value) || 0)}
                    placeholder="Weight"
                    className="rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink sm:col-span-2"
                  />
                  <input
                    type="text"
                    value={newItemNotes}
                    onChange={(e) => setNewItemNotes(e.target.value)}
                    placeholder="Notes..."
                    className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink sm:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newItemName.trim()) return;
                      const item: InventoryItem = {
                        id: `item_${Date.now()}`,
                        name: newItemName.trim(),
                        qty: Math.max(1, newItemQty),
                        weight: Math.max(0, newItemWeight),
                        equipped: false,
                        attuned: false,
                        notes: newItemNotes.trim(),
                      };
                      patchActivePc({ inventory: [...(activePc.inventory ?? []), item] });
                      setNewItemName('');
                      setNewItemQty(1);
                      setNewItemWeight(0);
                      setNewItemNotes('');
                    }}
                    className="rounded border border-wax bg-wax px-2 py-1 font-mono text-xs font-semibold text-ivory sm:col-span-1"
                  >
                    + Add
                  </button>
                </div>

                {/* Inventory Items */}
                <div className="space-y-1.5">
                  {(activePc.inventory ?? []).map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-parchment-soft px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-semibold text-ink">{item.name}</span>
                        <span className="font-mono text-[10px] text-ink-faint">×{item.qty}</span>
                        {item.weight ? (
                          <span className="font-mono text-[10px] text-ink-faint">({item.weight} lb)</span>
                        ) : null}
                        {item.notes ? <span className="font-serif italic text-ink-soft">— {item.notes}</span> : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next = (activePc.inventory ?? []).map((it, i) =>
                              i === idx ? { ...it, equipped: !it.equipped } : it,
                            );
                            patchActivePc({ inventory: next });
                          }}
                          className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase ${
                            item.equipped
                              ? 'border-forest/50 bg-forest/15 text-forest font-bold'
                              : 'border-rule bg-parchment text-ink-faint'
                          }`}
                        >
                          {item.equipped ? 'Equipped' : 'Equip'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const inv = activePc.inventory ?? [];
                            const curAttuned = inv.filter((i) => i.attuned).length;
                            if (!item.attuned && curAttuned >= 3) return;
                            const next = inv.map((it, i) =>
                              i === idx ? { ...it, attuned: !it.attuned } : it,
                            );
                            patchActivePc({
                              inventory: next,
                              attunedCount: Math.min(3, next.filter((i) => i.attuned).length),
                            });
                          }}
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
                          onClick={() =>
                            patchActivePc({
                              inventory: (activePc.inventory ?? []).filter((_, i) => i !== idx),
                            })
                          }
                          className="text-ink-faint hover:text-crimson"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Party Loot Splitter & Scratchpad */}
              <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card sm:p-5">
                <div className="flex items-center gap-2 border-b border-rule pb-2">
                  <Split size={16} className="text-gold-deep" />
                  <h3 className="font-display text-base tracking-wide text-ink">
                    Party Loot Splitter &amp; Unclaimed Treasure
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded border border-rule bg-parchment-soft p-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Coins size={13} className="text-gold-deep" />
                    <span className="font-mono text-[10px] uppercase text-ink-soft">Total Gold Haul (GP):</span>
                    <input
                      type="number"
                      min={0}
                      value={lootSplitGold}
                      onChange={(e) => setLootSplitGold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-20 rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase text-ink-soft">Party Size:</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={lootSplitPartySize}
                      onChange={(e) => setLootSplitPartySize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-14 rounded border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>
                  <div className="font-mono text-xs text-ink">
                    Share per player:{' '}
                    <strong className="text-gold-deep">
                      {Math.floor(lootSplitGold / Math.max(1, lootSplitPartySize))} GP
                    </strong>{' '}
                    ({lootSplitGold % Math.max(1, lootSplitPartySize)} GP remainder)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const share = Math.floor(lootSplitGold / Math.max(1, lootSplitPartySize));
                      if (share <= 0) return;
                      const purse = activePc.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                      patchActivePc({
                        currency: { ...purse, gp: (purse.gp ?? 0) + share },
                      });
                    }}
                    className="rounded border border-gold-deep bg-gold/20 px-3 py-1 font-mono text-[10px] font-semibold uppercase text-gold-deep hover:bg-gold/30"
                  >
                    + Add My Share to Coin Purse
                  </button>
                </div>

                <div>
                  <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
                    Party Loot / Unclaimed Scratchpad
                  </label>
                  <textarea
                    value={activePc.partyLoot ?? ''}
                    onChange={(e) => patchActivePc({ partyLoot: e.target.value })}
                    rows={3}
                    placeholder="Bag of Holding inventory, unclaimed magic items, art objects to sell..."
                    className="mt-1 w-full rounded border border-rule bg-parchment-soft p-2.5 font-serif text-xs text-ink"
                  />
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* TAB 5: PLAY (TABLE HUD) */}
      {activeTab === 'play' && (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left Column: My Turn Action Economy Checklist + Concentration + Renown/Downtime */}
          <div className="space-y-4 lg:col-span-7">
            {/* My Turn Action Economy Checklist */}
            <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2.5">
                <div className="flex items-center gap-2">
                  <Swords size={17} className="text-wax" />
                  <div>
                    <h3 className="font-display text-base tracking-wide text-ink">
                      My Turn Action Economy
                    </h3>
                    <p className="font-serif text-xs text-ink-faint">
                      Check off your actions as you take them in combat, then tap &ldquo;Next Turn&rdquo; to reset.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetNextTurn}
                  className="inline-flex items-center gap-1.5 rounded border border-wax bg-wax px-3 py-1.5 font-mono text-xs font-semibold text-ivory shadow-sm hover:bg-wax/90"
                >
                  <RotateCcw size={13} /> Next Turn
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                {(
                  [
                    { key: 'actionUsed', label: 'Action', desc: 'Attack, Cast, Dash, Dodge, Help' },
                    { key: 'bonusActionUsed', label: 'Bonus Action', desc: 'Off-hand, Healing Word, Cunning' },
                    { key: 'movementUsed', label: 'Movement', desc: `${activePc?.speed ?? 30} ft speed` },
                    { key: 'reactionUsed', label: 'Reaction', desc: 'Opportunity Atk, Shield, Counter' },
                    { key: 'freeInteractionUsed', label: 'Free Object', desc: 'Draw weapon, open door' },
                  ] as const
                ).map((item) => {
                  const used = turnEconomy[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleTurnEconomyItem(item.key)}
                      className={`flex flex-col items-start justify-between rounded border p-2.5 text-left transition-all ${
                        used
                          ? 'border-rule bg-parchment-deep/60 text-ink-faint line-through'
                          : 'border-gold/60 bg-parchment-soft text-ink shadow-sm hover:border-wax'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-display text-xs font-bold">{item.label}</span>
                        <span
                          className={`size-3.5 rounded-sm border ${
                            used ? 'border-wax bg-wax' : 'border-rule bg-parchment'
                          }`}
                        />
                      </div>
                      <span className="mt-1 font-serif text-[10px] leading-tight text-ink-faint no-underline">
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Concentration Tracker & DC Helper */}
            <section className="space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className="text-gold-deep" />
                  <h3 className="font-display text-base tracking-wide text-ink">
                    Concentration Tracker
                  </h3>
                </div>
                {activePc?.concentrationSpell ? (
                  <button
                    type="button"
                    onClick={() => patchActivePc({ concentrationSpell: '' })}
                    className="rounded-full border border-wax/50 bg-wax/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-wax"
                  >
                    ⚡ Concentrating on: {activePc.concentrationSpell} (Click to Drop)
                  </button>
                ) : (
                  <span className="font-mono text-[10px] uppercase text-ink-faint">Not Concentrating</span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-mono text-[10px] uppercase text-ink-soft">
                    Active Concentration Spell
                  </label>
                  <input
                    type="text"
                    value={activePc?.concentrationSpell ?? ''}
                    onChange={(e) => patchActivePc({ concentrationSpell: e.target.value })}
                    placeholder="e.g. Bless, Hex, Haste, Spirit Guardians..."
                    className="mt-1 w-full rounded border border-rule bg-parchment-soft px-2.5 py-1.5 font-serif text-xs text-ink"
                  />
                </div>
                <div className="rounded border border-rule bg-parchment-soft p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase text-ink-soft">Damage Taken:</span>
                    <input
                      type="number"
                      min={1}
                      value={damageTakenInput}
                      onChange={(e) => setDamageTakenInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-16 rounded border border-rule bg-parchment px-2 py-0.5 text-right font-mono text-xs"
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-xs">
                    <span>CON Save DC:</span>
                    <strong className="text-wax">
                      DC {Math.max(10, Math.floor(damageTakenInput / 2))}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            {/* Renown & Downtime Trackers */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-rule bg-parchment p-4 shadow-card">
                <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-brass-deep">
                  <Calendar size={14} /> Downtime Days
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      patchActivePc({ downtimeDays: Math.max(0, (activePc?.downtimeDays ?? 0) - 1) })
                    }
                    className="rounded border border-rule bg-parchment-soft px-3 py-1 font-mono text-sm font-bold"
                  >
                    -1
                  </button>
                  <span className="font-display text-2xl font-bold text-ink">
                    {activePc?.downtimeDays ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => patchActivePc({ downtimeDays: (activePc?.downtimeDays ?? 0) + 1 })}
                    className="rounded border border-rule bg-parchment-soft px-3 py-1 font-mono text-sm font-bold"
                  >
                    +1
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-rule bg-parchment p-4 shadow-card">
                <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-brass-deep">
                  <Award size={14} /> Campaign Renown
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof activePc?.renown === 'number' ? activePc.renown : 0;
                      patchActivePc({ renown: cur - 1 });
                    }}
                    className="rounded border border-rule bg-parchment-soft px-3 py-1 font-mono text-sm font-bold"
                  >
                    -1
                  </button>
                  <span className="font-display text-2xl font-bold text-ink">
                    {typeof activePc?.renown === 'number' ? activePc.renown : 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof activePc?.renown === 'number' ? activePc.renown : 0;
                      patchActivePc({ renown: cur + 1 });
                    }}
                    className="rounded border border-rule bg-parchment-soft px-3 py-1 font-mono text-sm font-bold"
                  >
                    +1
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Dice Roller & Spell Lookup */}
          <div className="space-y-4 lg:col-span-5">
            <section className="space-y-2 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-brass-deep">
                Table Dice Roller
              </h3>
              <QuickDice />
            </section>

            <section className="space-y-2.5 rounded-lg border border-rule bg-parchment p-4 shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-brass-deep">
                  Quick Spell Lookup
                </h3>
                <span className="font-mono text-[10px] text-ink-faint">5e SRD Reference</span>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" />
                <input
                  type="text"
                  value={spellQuery}
                  onChange={(e) => setSpellQuery(e.target.value)}
                  placeholder="Search spells by name, school, or effect..."
                  className="w-full rounded border border-rule bg-parchment-soft py-1.5 pl-8 pr-2.5 font-serif text-xs text-ink"
                />
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredSpells.map((sp) => (
                  <div
                    key={sp.name}
                    className="space-y-1 rounded border border-rule bg-parchment-soft p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-ink">{sp.name}</span>
                      <div className="flex items-center gap-1">
                        {sp.concentration && (
                          <button
                            type="button"
                            onClick={() => patchActivePc({ concentrationSpell: sp.name })}
                            className="rounded border border-gold/50 bg-gold/15 px-1.5 py-0.5 font-mono text-[9px] text-gold-deep"
                            title="Click to concentrate on this spell"
                          >
                            ⚡ Conc.
                          </button>
                        )}
                        <span className="font-mono text-[10px] text-brass-deep">
                          {sp.level === 0 ? 'Cantrip' : `Lvl ${sp.level}`} · {sp.school}
                        </span>
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-ink-faint">
                      {sp.time} · Range: {sp.range}
                    </div>
                    <p className="font-serif text-ink-soft">{sp.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
