import { rollOn } from '@/lib/tables/roll';
import type { SeededRng } from './rng';
import {
  ATMOSPHERE_BY_VIBE,
  PATRON_OCCUPATIONS,
  PATRON_RACES,
  PATRON_TRAITS,
  RUMOR_TEMPLATES,
  RUMOR_VARS,
  TAVERN_MENU,
  TAVERN_NAME_PREFIXES,
  TAVERN_NAME_SUFFIXES,
  type TavernVibe,
} from './tables/tavern-tables';
import { OWNER_DESCRIPTORS, OWNER_FIRSTNAMES, OWNER_SURNAMES, SIZE_PRICE_MARKUP, formatPrice } from './tables/shop-tables';
import type { MenuItem, PatronRef, SettlementSizeClass, TavernResult } from './types';

function tavernName(themeKeyword: string | undefined, rng: SeededRng): string {
  if (themeKeyword && themeKeyword.trim()) {
    return `The ${themeKeyword.trim().replace(/^./, (c) => c.toUpperCase())} ${rollOn(TAVERN_NAME_SUFFIXES, rng)}`;
  }
  return `${rollOn(TAVERN_NAME_PREFIXES, rng)} ${rollOn(TAVERN_NAME_SUFFIXES, rng)}`;
}

function fillRumor(template: string, rng: SeededRng): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const pool = (RUMOR_VARS as Record<string, readonly string[]>)[k];
    if (!pool) return `{${k}}`;
    return rollOn(pool, rng);
  });
}

function buildMenu(size: SettlementSizeClass, vibe: TavernVibe, rng: SeededRng): MenuItem[] {
  const markup = SIZE_PRICE_MARKUP[size] * (vibe === 'upscale' ? 1.6 : vibe === 'seedy' ? 0.7 : vibe === 'rough' ? 0.85 : 1.0);
  // food: pick 3-5; drink: pick 3-4; lodging: 2-3
  const foods = TAVERN_MENU.filter((m) => m.kind === 'food');
  const drinks = TAVERN_MENU.filter((m) => m.kind === 'drink');
  const lodging = TAVERN_MENU.filter((m) => m.kind === 'lodging');
  const pickN = (arr: typeof TAVERN_MENU, n: number) => rng.shuffle(arr).slice(0, n);
  const out: MenuItem[] = [];
  for (const it of pickN(foods, rng.int(3, 5))) {
    out.push({ name: it.name, kind: it.kind, price: formatPrice(Math.max(1, Math.round(it.basePriceCp * markup))) });
  }
  for (const it of pickN(drinks, rng.int(3, 4))) {
    out.push({ name: it.name, kind: it.kind, price: formatPrice(Math.max(1, Math.round(it.basePriceCp * markup))) });
  }
  for (const it of pickN(lodging, rng.int(2, 3))) {
    out.push({ name: it.name, kind: it.kind, price: formatPrice(Math.max(1, Math.round(it.basePriceCp * markup))) });
  }
  return out;
}

function buildPatrons(rng: SeededRng): PatronRef[] {
  const count = rng.int(3, 6);
  const out: PatronRef[] = [];
  for (let i = 0; i < count; i++) {
    const race = rollOn(PATRON_RACES, rng);
    const occupation = rollOn(PATRON_OCCUPATIONS, rng);
    const trait = rollOn(PATRON_TRAITS, rng);
    const first = rollOn(OWNER_FIRSTNAMES, rng);
    const last = rollOn(OWNER_SURNAMES, rng);
    out.push({
      name: `${first} ${last}`,
      descriptor: `${race}, ${occupation}; ${trait}`,
    });
  }
  return out;
}

export function generateTavern(
  inputs: { settlementSize: SettlementSizeClass; vibe: TavernVibe; themeKeyword?: string },
  rng: SeededRng,
): TavernResult {
  const name = tavernName(inputs.themeKeyword, rng);
  const atmosphere = rollOn(ATMOSPHERE_BY_VIBE[inputs.vibe], rng);
  const menu = buildMenu(inputs.settlementSize, inputs.vibe, rng);
  const patrons = buildPatrons(rng);
  const rumorCount = rng.int(2, 4);
  const rumors: string[] = [];
  const usedTemplates = new Set<string>();
  while (rumors.length < rumorCount) {
    const t = rollOn(RUMOR_TEMPLATES, rng);
    if (usedTemplates.has(t)) continue;
    usedTemplates.add(t);
    rumors.push(fillRumor(t, rng));
  }
  const ownerFirst = rollOn(OWNER_FIRSTNAMES, rng);
  const ownerLast = rollOn(OWNER_SURNAMES, rng);
  const ownerDescriptor = rollOn(OWNER_DESCRIPTORS, rng);

  return {
    kind: 'tavern',
    id: `tavern_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs,
    name,
    details: {
      atmosphere,
      vibe: inputs.vibe,
      menu,
      patrons,
      rumors,
      owner: { name: `${ownerFirst} ${ownerLast}`, descriptor: ownerDescriptor },
    },
    enhanced: false,
  };
}
