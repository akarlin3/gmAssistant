import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { makeRng } from '../rng';
import { generateTreasureHoard } from '../treasure-hoard';
import { generateTrinkets } from '../trinket';
import { generateMundaneShop } from '../mundane-shop';
import { generateMagicShop } from '../magic-shop';
import { generateTavern } from '../tavern';
import { expandFromExit, generateDungeon } from '../dungeon';
import { generateSettlement } from '../settlement';
import { TRINKETS } from '../tables/trinket-tables';
import { MUNDANE_INVENTORY } from '../tables/shop-tables';
import { MAGIC_ITEMS } from '../tables/treasure-hoard-tables';

describe('generateTreasureHoard', () => {
  it('determinism: same seed -> same result', () => {
    const a = generateTreasureHoard({ crTier: '5-10', hoardType: 'Treasure Hoard' }, makeRng(123));
    const b = generateTreasureHoard({ crTier: '5-10', hoardType: 'Treasure Hoard' }, makeRng(123));
    assert.deepEqual(a, b);
  });

  it('individual treasure produces no magic items, no gems', () => {
    for (let s = 1; s <= 50; s++) {
      const r = generateTreasureHoard({ crTier: '5-10', hoardType: 'Individual Treasure' }, makeRng(s));
      assert.equal(r.magicItems.length, 0);
      assert.equal(r.gems.length, 0);
      assert.equal(r.artObjects.length, 0);
    }
  });

  it('high tier hoard coin sum exceeds low tier on average', () => {
    const sumCoins = (c: { cp: number; sp: number; ep: number; gp: number; pp: number }) =>
      c.cp + c.sp + c.ep + c.gp + c.pp;
    const low = Array.from({ length: 200 }, (_, i) => generateTreasureHoard({ crTier: '0-4', hoardType: 'Treasure Hoard' }, makeRng(i)));
    const high = Array.from({ length: 200 }, (_, i) => generateTreasureHoard({ crTier: '17+', hoardType: 'Treasure Hoard' }, makeRng(i)));
    const lowAvg = low.reduce((s, r) => s + sumCoins(r.coins), 0) / low.length;
    const highAvg = high.reduce((s, r) => s + sumCoins(r.coins), 0) / high.length;
    assert.ok(highAvg > lowAvg * 10, `expected high >> low, got low=${lowAvg} high=${highAvg}`);
  });

  it('all referenced magic items exist in the MAGIC_ITEMS pool', () => {
    const allNames = new Set(Object.values(MAGIC_ITEMS).flat().map((m) => m.name));
    for (let s = 0; s < 500; s++) {
      const r = generateTreasureHoard({ crTier: '11-16', hoardType: 'Treasure Hoard' }, makeRng(s));
      for (const mi of r.magicItems) {
        assert.ok(allNames.has(mi.name), `unknown magic item: ${mi.name}`);
      }
    }
  });
});

describe('generateTrinkets', () => {
  it('returns the requested count, capped at 10', () => {
    const r = generateTrinkets({ count: 12 }, makeRng(1));
    assert.equal(r.trinkets.length, 10);
  });

  it('returns distinct trinkets', () => {
    const r = generateTrinkets({ count: 10 }, makeRng(2));
    const set = new Set(r.trinkets.map((t) => t.description));
    assert.equal(set.size, r.trinkets.length);
  });

  it('all trinkets exist in the TRINKETS pool', () => {
    const pool = new Set(TRINKETS);
    for (let s = 0; s < 50; s++) {
      const r = generateTrinkets({ count: 5 }, makeRng(s));
      for (const t of r.trinkets) {
        assert.ok(pool.has(t.description), `unknown trinket: ${t.description}`);
      }
    }
  });
});

describe('generateMundaneShop', () => {
  it('inventory respects settlement availability tiers', () => {
    const allowed = new Set(MUNDANE_INVENTORY.filter((it) => it.shop === 'smith' && it.availability <= 0).map((i) => i.name));
    for (let s = 0; s < 30; s++) {
      const r = generateMundaneShop({ shopType: 'smith', settlementSize: 'thorp' }, makeRng(s));
      for (const it of r.inventory) {
        assert.ok(allowed.has(it.name), `${it.name} should not be available in a thorp`);
      }
    }
  });

  it('produces between 5 and 10 items when stock allows', () => {
    for (let s = 0; s < 30; s++) {
      const r = generateMundaneShop({ shopType: 'general store', settlementSize: 'town' }, makeRng(s));
      assert.ok(r.inventory.length >= 5 && r.inventory.length <= 10, `length ${r.inventory.length}`);
    }
  });
});

describe('generateMagicShop', () => {
  it('respects settlement scarcity cap', () => {
    // In a thorp, max rarity is "common"
    const allowed = new Set(MAGIC_ITEMS.common.map((i) => i.name));
    for (let s = 0; s < 30; s++) {
      const r = generateMagicShop({ archetype: 'curio shop', maxRarity: 'legendary', settlementSize: 'thorp' }, makeRng(s));
      for (const it of r.inventory) {
        assert.ok(allowed.has(it.name), `${it.name} should not appear in a thorp magic shop`);
      }
    }
  });

  it('inventory of unique items', () => {
    const r = generateMagicShop({ archetype: 'curio shop', maxRarity: 'rare', settlementSize: 'large city' }, makeRng(7));
    assert.equal(new Set(r.inventory.map((i) => i.name)).size, r.inventory.length);
  });
});

describe('generateTavern', () => {
  it('produces patrons, menu items, rumors, and an owner', () => {
    const r = generateTavern({ settlementSize: 'town', vibe: 'cozy' }, makeRng(11));
    assert.ok(r.details.patrons.length >= 3);
    assert.ok(r.details.menu.length >= 8);
    assert.ok(r.details.rumors.length >= 2);
    assert.ok(r.details.owner.name);
  });

  it('respects themeKeyword override in name', () => {
    const r = generateTavern({ settlementSize: 'town', vibe: 'themed', themeKeyword: 'Mended' }, makeRng(11));
    assert.ok(/^The Mended /.test(r.name), `got: ${r.name}`);
  });
});

describe('generateDungeon', () => {
  it('room count matches size', () => {
    const sizes = [['small', 5], ['medium', 10], ['large', 20], ['sprawling', 40]] as const;
    for (const [size, count] of sizes) {
      const r = generateDungeon({ size, theme: 'ruin', challengeTier: '5-10' }, makeRng(13));
      assert.equal(r.details.rooms.length, count);
    }
  });

  it('each room has an index, name, contents, and dressing', () => {
    const r = generateDungeon({ size: 'medium', theme: 'tomb', challengeTier: '11-16' }, makeRng(17));
    r.details.rooms.forEach((rm, i) => {
      assert.equal(rm.index, i + 1);
      assert.ok(rm.name);
      assert.ok(rm.contents);
      assert.ok(rm.dressing);
    });
  });

  it('every theme + tier combination produces a valid dungeon', () => {
    const themes = [
      'ruin', 'lair', 'tomb', 'stronghold', 'temple', 'cave', 'sewer',
      'manor', 'mine', 'ship', 'woods', 'swamp', 'mountain', 'frozen', 'city',
    ] as const;
    const tiers = ['0-4', '5-10', '11-16', '17+'] as const;
    for (const theme of themes) {
      for (const tier of tiers) {
        const r = generateDungeon({ size: 'small', theme, challengeTier: tier }, makeRng(31));
        assert.equal(r.details.rooms.length, 5, `${theme}/${tier} room count`);
        assert.ok(r.name, `${theme}/${tier} missing name`);
        assert.ok(r.details.hazards.length >= 2, `${theme}/${tier} hazards`);
        assert.ok(r.details.inhabitants.length >= 1, `${theme}/${tier} inhabitants`);
        for (const rm of r.details.rooms) {
          assert.ok(rm.name && rm.contents && rm.dressing, `${theme}/${tier} room ${rm.index} fields`);
        }
      }
    }
  });
  it('placed rooms have unique, non-overlapping spatial footprints', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = generateDungeon({ size: 'medium', theme: 'cave', challengeTier: '5-10' }, makeRng(seed));
      const placed = r.details.rooms.filter((rm) =>
        rm.x != null && rm.y != null && rm.w != null && rm.h != null,
      );
      assert.ok(placed.length >= 1, `seed ${seed}: no rooms placed`);
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          const overlapX = a.x! < b.x! + b.w! && a.x! + a.w! > b.x!;
          const overlapY = a.y! < b.y! + b.h! && a.y! + a.h! > b.y!;
          assert.ok(
            !(overlapX && overlapY),
            `seed ${seed}: rooms ${a.index} and ${b.index} overlap`,
          );
        }
      }
    }
  });

  it('produces at least one unexplored exit on a fresh dungeon', () => {
    for (let seed = 0; seed < 10; seed++) {
      const r = generateDungeon({ size: 'medium', theme: 'ruin', challengeTier: '5-10' }, makeRng(seed));
      const unexplored = r.details.rooms.flatMap((rm) =>
        (rm.exits ?? []).filter((e) => e.toRoomIndex === null),
      );
      assert.ok(unexplored.length >= 1, `seed ${seed}: no unexplored exits`);
    }
  });
});

describe('expandFromExit', () => {
  it('placed outcome appends one room and links the exit', () => {
    const r = generateDungeon({ size: 'small', theme: 'temple', challengeTier: '0-4' }, makeRng(99));
    const beforeCount = r.details.rooms.length;
    const sourceWithExit = r.details.rooms.find((rm) =>
      (rm.exits ?? []).some((e) => e.toRoomIndex === null),
    );
    assert.ok(sourceWithExit, 'expected at least one unexplored exit');
    const exit = sourceWithExit!.exits!.find((e) => e.toRoomIndex === null)!;
    const result = expandFromExit(r, sourceWithExit!.index, exit.id);
    if (result.outcome === 'placed') {
      assert.equal(result.dungeon.details.rooms.length, beforeCount + 1);
      const updatedSource = result.dungeon.details.rooms.find((rm) => rm.index === sourceWithExit!.index);
      const updatedExit = updatedSource!.exits!.find((e) => e.id === exit.id)!;
      assert.ok(updatedExit.toRoomIndex !== null && updatedExit.toRoomIndex !== -1);
    } else if (result.outcome === 'collapsed') {
      // Acceptable: a tight layout marked the exit as a dead end.
      assert.equal(result.dungeon.details.rooms.length, beforeCount);
    } else {
      assert.fail(`unexpected outcome: ${result.outcome}`);
    }
  });

  it('noop when the exit is already explored', () => {
    const r = generateDungeon({ size: 'small', theme: 'sewer', challengeTier: '0-4' }, makeRng(3));
    const sourceWithLink = r.details.rooms.find((rm) =>
      (rm.exits ?? []).some((e) => e.toRoomIndex !== null && e.toRoomIndex !== -1),
    );
    assert.ok(sourceWithLink, 'expected at least one connected exit');
    const exit = sourceWithLink!.exits!.find((e) => e.toRoomIndex !== null && e.toRoomIndex !== -1)!;
    const result = expandFromExit(r, sourceWithLink!.index, exit.id);
    assert.equal(result.outcome, 'noop');
    assert.equal(result.dungeon, r);
  });
});

describe('generateSettlement', () => {
  it('population falls within size band', () => {
    const r = generateSettlement({ sizeClass: 'town' }, makeRng(21));
    assert.ok(r.details.population >= 201 && r.details.population <= 2000, `pop ${r.details.population}`);
  });

  it('produces at least 1 notable and 2 hooks', () => {
    for (let s = 0; s < 20; s++) {
      const r = generateSettlement({ sizeClass: 'town' }, makeRng(s));
      assert.ok(r.details.notables.length >= 1);
      assert.ok(r.details.hooks.length >= 2);
    }
  });
});
