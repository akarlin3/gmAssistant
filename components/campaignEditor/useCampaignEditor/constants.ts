import {
  Plus, X, User, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy,
  Clock, Download, Upload, ScrollText, ArrowLeft, ArrowRight, Cloud, CloudOff,
  Sparkles, Search, BookOpen, Dice5, Wand2, Skull, Footprints, Hash,
  ClipboardList, Wrench, SlidersHorizontal, Copy, Compass, Bot,
} from 'lucide-react';
import type { Mode } from '@/lib/modes';

export { Plus, X, User, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy, Clock, Download, Upload, ScrollText, ArrowLeft, ArrowRight, Cloud, CloudOff, Sparkles, Search, BookOpen, Dice5, Wand2, Skull, Footprints, Hash, ClipboardList, Wrench, SlidersHorizontal, Copy, Compass, Bot };

export const PREP_GROUPS = [
  { name: 'Premise', keys: ['pitch', 'genre', 'g-lines', 'g-mech'], labels: ['Quick Pitch', 'Genre Statement', 'Content Lines', 'Mechanics & System'] },
  { name: 'World', keys: ['g-world', 'facts', 'g-fnl'], labels: ['World Facts', 'Setting Facts', 'Req. Factions, NPCs & Locations'] },
  { name: 'Characters', keys: ['pc', 'goals'], labels: ['Player Characters', 'PC Goals'] },
  { name: 'Fronts', keys: ['factions', 'conflicts', 'secrets'], labels: ['Factions', 'Active Conflicts', 'Secrets & Clues'] },
  { name: 'Per-Session', keys: ['s1-review', 's2-start', 's3-scenes', 's4-secrets', 's5-loc', 's6-npc', 's7-mon', 's8-rew'], labels: ['1. Review PCs', '2. Strong Start', '3. Outline Scenes', '4. Define Secrets', '5. Develop Locations', '6. Outline NPCs', '7. Choose Monsters', '8. Select Rewards'] },
];

// Each prep section sits inside one Phase; the palette uses this to
// re-expand the right phase before scrolling to a section. Phase 4 has no
// direct sections (only faction clocks), so it's intentionally absent.
export const SECTION_TO_PHASE: Record<string, string> = {
  'g-world': 'p0', 'g-fnl': 'p0', 'g-mech': 'p0', 'g-lines': 'p0', 'pitch': 'p0',
  'genre': 'p1', 'facts': 'p1', 'factions': 'p1', 'conflicts': 'p1',
  'pc': 'p2', 'goals': 'p2',
  's1-review': 'p3', 's2-start': 'p3', 's3-scenes': 'p3', 's4-secrets': 'p3',
  's5-loc': 'p3', 's6-npc': 'p3', 's7-mon': 'p3', 's8-rew': 'p3',
  'audit-goals': 'p5', 'audit-factions': 'p5', 'audit-secrets': 'p5',
  'end-ready': 'p6', 'end-collect': 'p6', 'end-catalyst': 'p6',
};

// Each prep section also belongs to a Plan/Prep sub-view (Phases 0-2 live under Plan;
// Phases 3 is Prep/Flow; Phases 4-6 are Prep/Fronts). Used by the palette
// and Next-Up jump so we route to the right tab before scrolling.
export const PHASE_TO_VIEW: Record<string, { mode: Mode; subview: string }> = {
  p0: { mode: 'plan', subview: 'pitch' },
  p1: { mode: 'plan', subview: 'worldbuild' },
  p2: { mode: 'plan', subview: 'party' },
  p3: { mode: 'prep', subview: 'flow' },
  p4: { mode: 'prep', subview: 'clocks' },
  p5: { mode: 'prep', subview: 'arc' },
  p6: { mode: 'prep', subview: 'ending' },
};

export const VIEW_META: Array<{ mode: Mode; subview: string; label: string; icon: any; keywords?: string[] }> = [
  { mode: 'plan',    subview: 'pitch',     label: 'Premise',     icon: Compass,         keywords: ['hook', 'givens', 'truths'] },
  { mode: 'plan',    subview: 'worldbuild',     label: 'Worldbuild',       icon: BookOpen,        keywords: ['setting', 'factions', 'reference', 'downtime'] },
  { mode: 'plan',    subview: 'party',     label: 'Party',       icon: Users,           keywords: ['pc sheet', 'character sheet', 'hp', 'abilities', 'attacks', 'spell slots', 'goals', 'sidekick'] },
  { mode: 'prep',    subview: 'clocks',    label: 'Faction Clocks', icon: Clock,          keywords: ['clocks', 'factions', 'tracking'] },
  { mode: 'prep',    subview: 'arc',       label: 'Arc Planning',   icon: Layers,         keywords: ['audits', 'goals', 'secrets'] },
  { mode: 'prep',    subview: 'ending',    label: 'Ending',         icon: Trophy,         keywords: ['ending', 'wrap', 'threads'] },
  { mode: 'prep',    subview: 'flow',      label: 'Prep Flow',   icon: ScrollText,      keywords: ['lazy dm', '8 step', 'next session'] },
  { mode: 'prep',    subview: 'wizard',    label: 'Prep Wizard', icon: ClipboardList,   keywords: ['guided', 'walkthrough'] },
  { mode: 'organize', subview: 'players',   label: 'Players',     icon: Users,          keywords: ['invite', 'share', 'collaboration'] },
  { mode: 'organize', subview: 'log',       label: 'Sessions',    icon: Calendar,        keywords: ['session log', 'recap'] },
  { mode: 'run',     subview: 'session',   label: 'Run Session', icon: Swords,          keywords: ['active', 'table'] },
  { mode: 'run',     subview: 'assistant', label: 'Assistant',   icon: Bot,             keywords: ['ai', 'chat', 'prep', 'plan', 'agent'] },
  { mode: 'run',     subview: 'lookup',    label: 'Lookup',      icon: Search,          keywords: ['quick reference'] },
  { mode: 'run',     subview: 'logged',    label: 'Logged',      icon: ScrollText,      keywords: ['saved', 'library', 'generators', 'log'] },
  { mode: 'run',     subview: 'dice',      label: 'Dice',        icon: Dice5 },
  { mode: 'run',     subview: 'spells',    label: 'Spells',      icon: Sparkles },
  { mode: 'run',     subview: 'dmref',     label: 'DM Ref',      icon: BookOpen,        keywords: ['rules', 'madness', 'travel'] },
  { mode: 'run',     subview: 'chase',     label: 'Chase',       icon: Footprints,      keywords: ['chase tracker'] },
  { mode: 'library', subview: 'generators',label: 'Generators',  icon: Wand2,           keywords: ['tavern', 'treasure', 'shop', 'dungeon', 'settlement', 'trinket', 'names', 'locations'] },
  { mode: 'library', subview: 'monsters',  label: 'Monsters',    icon: Skull,           keywords: ['stat block', 'bestiary'] },
  { mode: 'library', subview: 'traps',     label: 'Traps',       icon: Hash },
  { mode: 'library', subview: 'vivify',    label: 'Vivify',      icon: Sparkles,        keywords: ['ai description', 'prose'] },
  { mode: 'library', subview: 'pointbuy',  label: 'Point-Buy',   icon: Wrench,          keywords: ['point buy', 'ability scores', 'calculator', 'stats'] },
  { mode: 'oracle',  subview: 'wells',     label: 'Oracle',      icon: Sparkles,        keywords: ['yes no', 'chaos', 'complication', 'ask', 'wells'] },
];

export const PREP_SECTION_META: Array<{ id: string; label: string }> = [
  { id: 'g-world', label: 'World Facts' },
  { id: 'g-fnl', label: 'Required Factions, NPCs & Locations' },
  { id: 'g-mech', label: 'Mechanics & System' },
  { id: 'g-lines', label: 'Content Lines (Hard Nos)' },
  { id: 'pitch', label: 'Quick Pitch' },
  { id: 'genre', label: 'Genre Statement' },
  { id: 'facts', label: 'Setting Facts' },
  { id: 'factions', label: 'Factions' },
  { id: 'conflicts', label: 'Active Conflicts' },
  { id: 'pc', label: 'Player Characters' },
  { id: 'goals', label: 'PC Goals (5 Rules of Proactive Fun)' },
  { id: 's1-review', label: '1 · Review the Characters' },
  { id: 's2-start', label: '2 · Create a Strong Start' },
  { id: 's3-scenes', label: '3 · Outline Potential Scenes' },
  { id: 's4-secrets', label: '4 · Define Secrets & Clues' },
  { id: 's5-loc', label: '5 · Develop Fantastic Locations' },
  { id: 's6-npc', label: '6 · Outline Important NPCs' },
  { id: 's7-mon', label: '7 · Choose Relevant Monsters' },
  { id: 's8-rew', label: '8 · Select Magic Item Rewards' },
  { id: 'audit-goals', label: 'PC Goal Audit' },
  { id: 'audit-factions', label: 'Faction Audit' },
  { id: 'audit-secrets', label: 'Secrets Audit' },
  { id: 'end-ready', label: 'Is the Campaign Ready to End?' },
  { id: 'end-collect', label: 'Collect Every Thread' },
  { id: 'end-catalyst', label: 'Add Catalysts' },
];
