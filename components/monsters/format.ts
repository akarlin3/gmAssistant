import { CR_TO_XP } from '@/lib/encounterMath';
import type { Action, Monster, HomebrewMonster } from './types';

export function makeHomebrewSlug(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `hb-${crypto.randomUUID()}`;
  }
  return `hb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function blankHomebrewMonster(): HomebrewMonster {
  return {
    slug: makeHomebrewSlug(),
    name: '',
    size: 'Medium',
    type: 'Humanoid',
    subtype: '',
    alignment: 'unaligned',
    armor_class: 10,
    armor_desc: '',
    hit_points: 10,
    hit_dice: '',
    speed: { walk: 30 },
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    strength_save: null,
    dexterity_save: null,
    constitution_save: null,
    intelligence_save: null,
    wisdom_save: null,
    charisma_save: null,
    skills: {},
    damage_vulnerabilities: '',
    damage_resistances: '',
    damage_immunities: '',
    condition_immunities: '',
    senses: '',
    languages: '',
    challenge_rating: '1',
    cr: 1,
    actions: [],
    bonus_actions: [],
    reactions: [],
    legendary_desc: '',
    legendary_actions: [],
    special_abilities: [],
    desc: '',
    source: 'Homebrew',
    homebrew: true,
  };
}

export function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

export function fmtSave(score: number, save: number | null): string {
  return save != null ? (save >= 0 ? `+${save}` : `${save}`) : mod(score);
}

export function fmtSpeed(speed: Record<string, number | boolean>): string {
  if (!speed) return '—';
  const parts: string[] = [];
  const walk = speed.walk;
  if (typeof walk === 'number' && walk > 0) parts.push(`${walk} ft.`);
  const order = ['burrow', 'climb', 'fly', 'swim'];
  for (const k of order) {
    const v = speed[k];
    if (typeof v === 'number' && v > 0) {
      parts.push(`${k} ${v} ft.${k === 'fly' && speed.hover ? ' (hover)' : ''}`);
    }
  }
  return parts.join(', ') || '—';
}

export function fmtSkills(skills: Record<string, number>): string {
  return Object.entries(skills)
    .map(([k, v]) => {
      const name = k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      return `${name} ${v >= 0 ? '+' : ''}${v}`;
    })
    .join(', ');
}

export function fmtSaves(m: Monster): string {
  const entries: string[] = [];
  const push = (label: string, score: number, save: number | null) => {
    if (save != null) entries.push(`${label} ${save >= 0 ? '+' : ''}${save}`);
  };
  push('Str', m.strength, m.strength_save);
  push('Dex', m.dexterity, m.dexterity_save);
  push('Con', m.constitution, m.constitution_save);
  push('Int', m.intelligence, m.intelligence_save);
  push('Wis', m.wisdom, m.wisdom_save);
  push('Cha', m.charisma, m.charisma_save);
  return entries.join(', ');
}

export function fmtCR(cr: string): string {
  const xp = CR_TO_XP[cr];
  return xp != null ? `${cr} (${xp.toLocaleString()} XP)` : cr;
}

export function fmtTypeLine(m: Monster): string {
  const size = m.size || '';
  const type = m.type || '';
  const sub = m.subtype ? ` (${m.subtype})` : '';
  const align = m.alignment || 'unaligned';
  return `${size} ${type.toLowerCase()}${sub}, ${align}`;
}

export function monsterPlainText(m: Monster): string {
  const lines: string[] = [
    m.name,
    fmtTypeLine(m),
    '',
    `AC ${m.armor_class ?? '—'}${m.armor_desc ? ` (${m.armor_desc})` : ''}`,
    `HP ${m.hit_points ?? '—'}${m.hit_dice ? ` (${m.hit_dice})` : ''}`,
    `Speed ${fmtSpeed(m.speed)}`,
    '',
    `STR ${m.strength} (${mod(m.strength)})  DEX ${m.dexterity} (${mod(m.dexterity)})  CON ${m.constitution} (${mod(m.constitution)})  INT ${m.intelligence} (${mod(m.intelligence)})  WIS ${m.wisdom} (${mod(m.wisdom)})  CHA ${m.charisma} (${mod(m.charisma)})`,
  ];
  if (fmtSaves(m)) lines.push(`Saving Throws ${fmtSaves(m)}`);
  if (fmtSkills(m.skills)) lines.push(`Skills ${fmtSkills(m.skills)}`);
  if (m.damage_resistances) lines.push(`Damage Resistances ${m.damage_resistances}`);
  if (m.damage_immunities) lines.push(`Damage Immunities ${m.damage_immunities}`);
  if (m.condition_immunities) lines.push(`Condition Immunities ${m.condition_immunities}`);
  if (m.senses) lines.push(`Senses ${m.senses}`);
  if (m.languages) lines.push(`Languages ${m.languages}`);
  lines.push(`Challenge ${fmtCR(m.challenge_rating)}`);
  const blocks: { title: string | null; entries: Action[] }[] = [
    { title: null, entries: m.special_abilities },
    { title: 'ACTIONS', entries: m.actions },
    { title: 'BONUS ACTIONS', entries: m.bonus_actions },
    { title: 'REACTIONS', entries: m.reactions },
    { title: 'LEGENDARY ACTIONS', entries: m.legendary_actions },
  ];
  for (const block of blocks) {
    if (!block.entries.length) continue;
    lines.push('');
    if (block.title) lines.push(block.title);
    for (const a of block.entries) lines.push(`${a.name}. ${a.desc}`);
  }
  return lines.join('\n');
}

export function pickRandom<T>(arr: T[], avoid?: T): T | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  let idx = Math.floor(Math.random() * arr.length);
  if (avoid && arr[idx] === avoid) idx = (idx + 1) % arr.length;
  return arr[idx];
}
