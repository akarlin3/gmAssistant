import { rollOn } from '@/lib/tables/roll';
import type { SeededRng } from './rng';
import {
  MUNDANE_INVENTORY,
  OWNER_DESCRIPTORS,
  OWNER_FIRSTNAMES,
  OWNER_SURNAMES,
  SHOP_NAME_PARTS,
  SIZE_AVAILABILITY,
  SIZE_PRICE_MARKUP,
  formatPrice,
  type ShopType,
} from './tables/shop-tables';
import type { MundaneShopResult, SettlementSizeClass, ShopInventoryEntry } from './types';

function shopName(shopType: ShopType, rng: SeededRng): string {
  const parts = SHOP_NAME_PARTS[shopType];
  return `${rollOn(parts.prefix, rng)} ${rollOn(parts.suffix, rng)}`;
}

function shopHours(size: SettlementSizeClass, rng: SeededRng): string {
  if (size === 'thorp' || size === 'hamlet') return 'open whenever the owner is home';
  if (size === 'village') return 'dawn to dusk; closed on market day afternoons';
  if (size === 'town') return 'second hour after dawn until evening bells';
  if (size === 'small city') return 'first bell to ninth bell, six days a week';
  return ['continuous, with two shifts', 'first bell to compline; closed on holy days', 'dawn to dusk, with apprentices after dusk'][rng.int(0, 2)];
}

export function generateMundaneShop(
  inputs: { shopType: ShopType; settlementSize: SettlementSizeClass },
  rng: SeededRng,
): MundaneShopResult {
  const sizeAv = SIZE_AVAILABILITY[inputs.settlementSize];
  const markup = SIZE_PRICE_MARKUP[inputs.settlementSize];

  const candidates = MUNDANE_INVENTORY.filter(
    (it) => it.shop === inputs.shopType && it.availability <= sizeAv,
  );
  // pick 5 to 10 distinct items, biased toward lower-availability (more
  // commonly available) goods
  const wanted = rng.int(5, Math.min(10, Math.max(5, candidates.length)));
  const picked = rng.shuffle(candidates).slice(0, wanted);
  const inventory: ShopInventoryEntry[] = picked.map((it) => ({
    name: it.name,
    category: it.category,
    rarity: 'mundane',
    price: formatPrice(Math.round(it.basePriceCp * markup)),
    note: it.note,
  }));

  const ownerFirst = rollOn(OWNER_FIRSTNAMES, rng);
  const ownerLast = rollOn(OWNER_SURNAMES, rng);
  const descriptor = rollOn(OWNER_DESCRIPTORS, rng);

  return {
    kind: 'mundane-shop',
    id: `mshop_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs,
    shopName: shopName(inputs.shopType, rng),
    owner: { name: `${ownerFirst} ${ownerLast}`, descriptor },
    inventory,
    hours: shopHours(inputs.settlementSize, rng),
    enhanced: false,
  };
}
