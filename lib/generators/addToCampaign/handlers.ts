// Per-LogKind handler table. Each handler owns both the picker explosion
// (`itemsFor`) and the destination shaping (`map`) for one LogKind, replacing
// the former dest×kind switch matrix while preserving identical behavior.

import type { LogKind } from '../log';
import { makeEvent } from '../../sessionEvents';
import type {
  DungeonResult,
  MagicShopResult,
  MundaneShopResult,
  PlotSegueResult,
  SettlementResult,
  TavernResult,
  TavernNameResult,
  TreasureHoardResult,
  TrinketResult,
} from '../types';
import {
  emptyAspects,
  formatSegueText,
  joinClean,
  safeStr,
  type CampaignDestKey,
  type KindHandler,
  type LocationRow,
  type LocationsLogPayload,
  type MappedRow,
  type NamesLogPayload,
  type SelectableItem,
} from './types';

// ── Aspect builders (locations destination) ──────────────────────────────────

function shopAspects(r: MundaneShopResult | MagicShopResult): [string, string, string] {
  const owner = r.owner ? `Run by ${r.owner.name} (${r.owner.descriptor})` : '';
  const top = (r.inventory || []).slice(0, 3).map((e) => e.name).join(', ');
  const inv = top ? `Stocks: ${top}` : '';
  const rumor = 'rumor' in r && r.rumor ? `Rumor: ${r.rumor}` : '';
  return [owner, inv, rumor];
}

function tavernAspects(r: TavernResult): [string, string, string] {
  const d = r.details;
  const atmo = d?.atmosphere ? `Atmosphere: ${d.atmosphere}` : '';
  const owner = d?.owner ? `Run by ${d.owner.name} (${d.owner.descriptor})` : '';
  const rumor = d?.rumors?.[0] ? `Rumor: ${d.rumors[0]}` : '';
  return [atmo, owner, rumor];
}

function dungeonAspects(r: DungeonResult): [string, string, string] {
  const d = r.details;
  const rooms = d?.rooms?.length ? `${d.rooms.length} rooms` : '';
  const hazard = d?.hazards?.[0] || '';
  const inhab = d?.inhabitants?.[0] || '';
  return [rooms, hazard, inhab];
}

function settlementAspects(r: SettlementResult): [string, string, string] {
  const d = r.details;
  const pop = d?.population ? `Pop ${d.population.toLocaleString()}` : '';
  const gov = d?.government ? `Gov: ${d.government}` : '';
  const econ = d?.economy ? `Economy: ${d.economy}` : '';
  return [pop, gov, econ];
}

// ── Generic free-form sinks ──────────────────────────────────────────────────
// facts / scenes / secrets default to the picker label; plot-segue overrides.
// Most kinds share this fallback, so it's factored out here.

function genericTextSink(dest: CampaignDestKey, item: SelectableItem): MappedRow {
  if (dest === 'facts' || dest === 'scenes' || dest === 'secrets') return item.label;
  return null;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

const treasureHoard: KindHandler = {
  allowed: ['treasure', 'items', 'facts'],
  defaultDest: 'treasure',
  itemsFor: (payload) => {
    const r = payload as TreasureHoardResult;
    const out: SelectableItem[] = [];
    const c = r.coins || ({} as TreasureHoardResult['coins']);
    const coinParts = [
      c.pp ? `${c.pp} pp` : '',
      c.gp ? `${c.gp} gp` : '',
      c.ep ? `${c.ep} ep` : '',
      c.sp ? `${c.sp} sp` : '',
      c.cp ? `${c.cp} cp` : '',
    ].filter(Boolean);
    if (coinParts.length > 0) {
      out.push({
        id: `${r.id}:coins`,
        label: `Coins · ${coinParts.join(', ')}`,
        payload: { kind: 'coins', text: coinParts.join(', ') },
      });
    }
    (r.gems || []).forEach((g, i) =>
      out.push({
        id: `${r.id}:gem:${i}`,
        label: `Gem · ${g.name} (${g.value} gp)`,
        payload: { kind: 'gem', name: g.name, value: g.value },
      }),
    );
    (r.artObjects || []).forEach((a, i) =>
      out.push({
        id: `${r.id}:art:${i}`,
        label: `Art · ${a.name} (${a.value} gp)`,
        payload: { kind: 'art', name: a.name, value: a.value },
      }),
    );
    (r.magicItems || []).forEach((m, i) =>
      out.push({
        id: `${r.id}:magic:${i}`,
        label: `Magic · ${m.name} (${m.rarity})`,
        payload: { kind: 'magic', name: m.name, rarity: m.rarity, note: m.note },
      }),
    );
    return out;
  },
  map: (dest, item) => {
    const p = item.payload as Record<string, unknown>;
    if (dest === 'items') {
      if (p.kind === 'magic') {
        const rarity = safeStr(p.rarity);
        const note = safeStr(p.note);
        return joinClean([safeStr(p.name), rarity ? `(${rarity})` : '', note]);
      }
      return null; // coins/gems/art don't belong in Magic Items
    }
    if (dest === 'treasure') {
      switch (p.kind) {
        case 'coins':
          return `Coins · ${safeStr(p.text)}`;
        case 'gem':
          return `Gem · ${safeStr(p.name)} (${(p.value as number) || 0} gp)`;
        case 'art':
          return `Art · ${safeStr(p.name)} (${(p.value as number) || 0} gp)`;
        case 'magic':
          return joinClean([
            `Magic · ${safeStr(p.name)}`,
            p.rarity ? `(${safeStr(p.rarity)})` : '',
            safeStr(p.note),
          ]);
      }
      return null;
    }
    return genericTextSink(dest, item);
  },
};

const trinket: KindHandler = {
  allowed: ['treasure', 'items', 'facts'],
  defaultDest: 'treasure',
  itemsFor: (payload) => {
    const r = payload as TrinketResult;
    return (r.trinkets || []).map((t, i) => ({
      id: `${r.id}:${i}`,
      label: t.description,
      payload: { description: t.description, hook: t.hook },
    }));
  },
  map: (dest, item) => {
    const p = item.payload as Record<string, unknown>;
    if (dest === 'items') return safeStr(p.description);
    if (dest === 'treasure') {
      const hook = safeStr(p.hook);
      return hook ? `${safeStr(p.description)} — ${hook}` : safeStr(p.description);
    }
    return genericTextSink(dest, item);
  },
};

const mundaneShop: KindHandler = {
  allowed: ['locations', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const r = payload as MundaneShopResult;
    return [{ id: r.id, label: `${r.shopName} — ${r.inputs.shopType}`, payload: r }];
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const r = item.payload as MundaneShopResult;
      return {
        name: r.shopName,
        type: r.inputs.shopType,
        aspects: shopAspects(r),
        factions: '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

const magicShop: KindHandler = {
  allowed: ['locations', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const r = payload as MagicShopResult;
    return [{ id: r.id, label: `${r.shopName} — ${r.inputs.archetype}`, payload: r }];
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const r = item.payload as MagicShopResult;
      return {
        name: r.shopName,
        type: `Magic shop · ${r.inputs.archetype}`,
        aspects: shopAspects(r),
        factions: '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

const tavern: KindHandler = {
  allowed: ['locations', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const r = payload as TavernResult;
    return [{ id: r.id, label: `${r.name} — Tavern`, payload: r }];
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const r = item.payload as TavernResult;
      return {
        name: r.name,
        type: `Tavern · ${r.inputs.vibe}`,
        aspects: tavernAspects(r),
        factions: '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

const tavernName: KindHandler = {
  allowed: ['locations', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const r = payload as TavernNameResult;
    return (r.names || []).map((n, i) => ({
      id: `${r.id}:${i}`,
      label: n,
      payload: { name: n },
    }));
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const p = item.payload as Record<string, unknown>;
      return {
        name: safeStr(p.name),
        type: 'Tavern',
        aspects: emptyAspects(),
        factions: '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

const dungeon: KindHandler = {
  allowed: ['locations', 'scenes', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const r = payload as DungeonResult;
    return [{
      id: r.id,
      label: `${r.name} — ${r.inputs.theme} (${r.inputs.size})`,
      payload: r,
    }];
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const r = item.payload as DungeonResult;
      return {
        name: r.name,
        type: `Dungeon · ${r.inputs.theme}`,
        aspects: dungeonAspects(r),
        factions: '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

const settlement: KindHandler = {
  allowed: ['locations', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const r = payload as SettlementResult;
    return [{
      id: r.id,
      label: `${r.name} — ${r.inputs.sizeClass}`,
      payload: r,
    }];
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const r = item.payload as SettlementResult;
      return {
        name: r.name,
        type: `Settlement · ${r.inputs.sizeClass}`,
        aspects: settlementAspects(r),
        factions: r.details?.region ? `Region: ${r.details.region}` : '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

const plotSegue: KindHandler = {
  allowed: ['scenes', 'secrets', 'facts', 'session-log'],
  defaultDest: 'scenes',
  itemsFor: (payload) => {
    const r = payload as PlotSegueResult;
    return (r.segues || []).map((s, i) => ({
      id: `${r.id}:${i}`,
      label: s.title,
      payload: { title: s.title, readAloud: s.readAloud, gmNote: s.gmNote },
    }));
  },
  map: (dest, item) => {
    const p = item.payload as Record<string, unknown>;
    if (dest === 'facts' || dest === 'scenes' || dest === 'secrets') return formatSegueText(p);
    if (dest === 'session-log') return makeEvent('other', `Segue: ${formatSegueText(p)}`);
    return null;
  },
};

const names: KindHandler = {
  allowed: ['npcs', 'facts'],
  defaultDest: 'npcs',
  itemsFor: (payload) => {
    const p = payload as NamesLogPayload;
    return (p.names || []).map((n, i) => {
      const full = joinClean([n.first, n.last], ' ');
      const tag = n.firstCulture === n.lastCulture
        ? n.firstCulture
        : joinClean([n.firstCulture, n.lastCulture]);
      return {
        id: `${i}:${full}`,
        label: tag ? `${full} (${tag})` : full,
        payload: { name: full, gender: p.gender, culture: tag },
      };
    });
  },
  map: (dest, item) => {
    if (dest === 'npcs') {
      const p = item.payload as Record<string, unknown>;
      return {
        name: safeStr(p.name),
        type: '',
        faction: '',
        archetype: safeStr(p.culture),
        goal: '',
        method: '',
      };
    }
    return genericTextSink(dest, item);
  },
};

const locations: KindHandler = {
  allowed: ['locations', 'facts'],
  defaultDest: 'locations',
  itemsFor: (payload) => {
    const p = payload as LocationsLogPayload;
    return (p.locations || []).map((loc, i) => ({
      id: `${i}:${loc.name}`,
      label: joinClean([loc.name, loc.type, loc.culture]),
      payload: loc,
    }));
  },
  map: (dest, item) => {
    if (dest === 'locations') {
      const loc = item.payload as { name: string; type: string; culture: string; blurb: string };
      return {
        name: loc.name,
        type: loc.type || '',
        aspects: [loc.blurb || '', loc.culture ? `Culture: ${loc.culture}` : '', ''],
        factions: '',
      } satisfies LocationRow;
    }
    return genericTextSink(dest, item);
  },
};

// The `monsters` destination is handled uniformly for every LogKind by the
// entry point (`mapItem` in ../addToCampaign.ts), so the monster handlers only
// need the generic free-form sink for their remaining allowed dests (facts).
const monsterRoll: KindHandler = {
  allowed: ['monsters', 'facts'],
  defaultDest: 'monsters',
  itemsFor: (payload) => {
    const m = payload as { name?: string; challenge_rating?: string; type?: string };
    const label = joinClean([m.name, m.challenge_rating ? `CR ${m.challenge_rating}` : '', m.type]);
    return [{ id: safeStr(m.name) || 'monster', label, payload: m }];
  },
  map: genericTextSink,
};

const monsterScale: KindHandler = {
  allowed: ['monsters', 'facts'],
  defaultDest: 'monsters',
  itemsFor: (payload) => {
    const m = payload as { name?: string; cr?: string; type?: string; scalingNote?: string };
    const label = joinClean([m.name, m.cr ? `CR ${m.cr}` : '', m.type]);
    return [{ id: safeStr(m.name) || 'scaled', label, payload: m }];
  },
  map: genericTextSink,
};

export const HANDLERS: Record<LogKind, KindHandler | null> = {
  'treasure-hoard': treasureHoard,
  trinket,
  'mundane-shop': mundaneShop,
  'magic-shop': magicShop,
  tavern,
  'tavern-name': tavernName,
  dungeon,
  settlement,
  'plot-segue': plotSegue,
  names,
  locations,
  'monster-roll': monsterRoll,
  'monster-scale': monsterScale,
  dice: null,
};
