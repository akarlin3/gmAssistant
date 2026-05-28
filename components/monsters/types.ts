export type Mode = 'roll' | 'scale' | 'build' | 'homebrew';

export type Action = {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage_dice?: string;
};

export type Monster = {
  slug: string;
  name: string;
  size: string;
  type: string;
  subtype: string;
  alignment: string;
  armor_class: number | null;
  armor_desc: string;
  hit_points: number | null;
  hit_dice: string;
  speed: Record<string, number | boolean>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save: number | null;
  dexterity_save: number | null;
  constitution_save: number | null;
  intelligence_save: number | null;
  wisdom_save: number | null;
  charisma_save: number | null;
  skills: Record<string, number>;
  damage_vulnerabilities: string;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  challenge_rating: string;
  cr: number;
  actions: Action[];
  bonus_actions: Action[];
  reactions: Action[];
  legendary_desc: string;
  legendary_actions: Action[];
  special_abilities: Action[];
  desc: string;
  source: string;
  homebrew?: boolean;
};

export type HomebrewMonster = Monster;
