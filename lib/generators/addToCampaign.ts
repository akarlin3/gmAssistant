// Bridge from generator results / log entries → campaign data lists.
//
// The "Save to log" affordance is the inbox for generator output; this module
// is the outbox — it converts a generator payload into selectable items, and
// each item into the shape of a campaign list entry (locations / npcs /
// monsters / items / treasure / facts / scenes / secrets).
//
// Each generator declares which destinations it allows and what the default
// destination is. The UI shows the picker, lets the user select a subset of
// items, and then calls `mapItem(dest, item)` for each one before appending.

import type { LogKind } from './log';
import type {
  DungeonResult,
  GeneratorResult,
  MagicShopResult,
  MundaneShopResult,
  PlotSegueResult,
  SettlementResult,
  TavernResult,
  TavernNameResult,
  TreasureHoardResult,
  TrinketResult,
} from './types';
import { SEGUE_ARC_LABELS, SEGUE_MODE_LABELS } from './tables/plot-segue-tables';

// ── Destinations ─────────────────────────────────────────────────────────────

export type CampaignDestKey =
  | 'locations'
  | 'npcs'
  | 'monsters'
  | 'items'
  | 'treasure'
  | 'facts'
  | 'scenes'
  | 'secrets';

export const DEST_LABEL: Record<CampaignDestKey, string> = {
  locations: 'Locations',
  npcs: 'NPCs',
  monsters: 'Monsters',
  items: 'Magic Items',
  treasure: 'Treasure',
  facts: 'Setting Facts',
  scenes: 'Potential Scenes',
  secrets: 'Secrets & Clues',
};

// ── Selectable items ─────────────────────────────────────────────────────────
// An "item" is one row the user can tick in the picker. Generators that return
// a single thing (settlement, dungeon, tavern, shops) expose exactly one item.
// Batched generators (names, trinkets, tavern-name, AI locations) expose one
// item per element.

export type SelectableItem = {
  id: string; // stable within one result (eg `${result.id}:0`)
  label: string; // shown next to the checkbox
  // Opaque payload used by `mapItem` below to shape the destination row.
  payload: unknown;
};

// ── Per-LogKind config ───────────────────────────────────────────────────────

type KindConfig = {
  allowed: readonly CampaignDestKey[];
  defaultDest: CampaignDestKey;
  itemsFor: (payload: unknown) => SelectableItem[];
};

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function joinClean(parts: (string | undefined | null)[], sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(sep);
}

// Names / Locations log payloads live in their tab files — we duck-type here
// so this lib doesn't depend on UI modules.
type NamesLogPayload = {
  firstCulture: string;
  lastCulture: string;
  gender: string;
  names: { first: string; last: string; firstCulture: string; lastCulture: string }[];
};

type LocationsLogPayload = {
  locationType: string;
  culture: string;
  locations: { name: string; type: string; culture: string; blurb: string }[];
};

const CONFIG: Record<LogKind, KindConfig | null> = {
  'treasure-hoard': {
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
  },
  trinket: {
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
  },
  'mundane-shop': {
    allowed: ['locations', 'facts'],
    defaultDest: 'locations',
    itemsFor: (payload) => {
      const r = payload as MundaneShopResult;
      return [{ id: r.id, label: `${r.shopName} — ${r.inputs.shopType}`, payload: r }];
    },
  },
  'magic-shop': {
    allowed: ['locations', 'facts'],
    defaultDest: 'locations',
    itemsFor: (payload) => {
      const r = payload as MagicShopResult;
      return [{ id: r.id, label: `${r.shopName} — ${r.inputs.archetype}`, payload: r }];
    },
  },
  tavern: {
    allowed: ['locations', 'facts'],
    defaultDest: 'locations',
    itemsFor: (payload) => {
      const r = payload as TavernResult;
      return [{ id: r.id, label: `${r.name} — Tavern`, payload: r }];
    },
  },
  'tavern-name': {
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
  },
  dungeon: {
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
  },
  settlement: {
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
  },
  'plot-segue': {
    allowed: ['scenes', 'secrets', 'facts'],
    defaultDest: 'scenes',
    itemsFor: (payload) => {
      const r = payload as PlotSegueResult;
      return (r.segues || []).map((s, i) => ({
        id: `${r.id}:${i}`,
        label: `${SEGUE_ARC_LABELS[s.arcFlavor]} · ${SEGUE_MODE_LABELS[s.mode]} — ${s.arcSeed}`,
        payload: { trigger: s.trigger, hook: s.hook, arcSeed: s.arcSeed, arcFlavor: s.arcFlavor, mode: s.mode },
      }));
    },
  },
  names: {
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
  },
  locations: {
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
  },
  'monster-roll': {
    allowed: ['monsters', 'facts'],
    defaultDest: 'monsters',
    itemsFor: (payload) => {
      const m = payload as { name?: string; challenge_rating?: string; type?: string };
      const label = joinClean([m.name, m.challenge_rating ? `CR ${m.challenge_rating}` : '', m.type]);
      return [{ id: safeStr(m.name) || 'monster', label, payload: m }];
    },
  },
  'monster-scale': {
    allowed: ['monsters', 'facts'],
    defaultDest: 'monsters',
    itemsFor: (payload) => {
      const m = payload as { name?: string; cr?: string; type?: string; scalingNote?: string };
      const label = joinClean([m.name, m.cr ? `CR ${m.cr}` : '', m.type]);
      return [{ id: safeStr(m.name) || 'scaled', label, payload: m }];
    },
  },
  dice: null,
};

export function configFor(kind: LogKind): KindConfig | null {
  return CONFIG[kind];
}

export function defaultDestFor(kind: LogKind): CampaignDestKey | null {
  return CONFIG[kind]?.defaultDest ?? null;
}

export function allowedDestsFor(kind: LogKind): readonly CampaignDestKey[] {
  return CONFIG[kind]?.allowed ?? [];
}

export function itemsFor(kind: LogKind, payload: unknown): SelectableItem[] {
  return CONFIG[kind]?.itemsFor(payload) ?? [];
}

// ── Mappers ──────────────────────────────────────────────────────────────────

export type LocationRow = {
  name: string;
  type: string;
  aspects: [string, string, string];
  factions: string;
};

export type NpcRow = {
  name: string;
  type: string;
  faction: string;
  archetype: string;
  goal: string;
  method: string;
};

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

function emptyAspects(): [string, string, string] {
  return ['', '', ''];
}

// Convert one selectable item into the row shape for the destination.
// Returns null for items that don't fit the destination (caller skips them).
export function mapItem(
  kind: LogKind,
  dest: CampaignDestKey,
  item: SelectableItem,
): LocationRow | NpcRow | string | null {
  const p = item.payload as Record<string, unknown>;

  if (dest === 'locations') {
    switch (kind) {
      case 'mundane-shop': {
        const r = p as unknown as MundaneShopResult;
        return {
          name: r.shopName,
          type: r.inputs.shopType,
          aspects: shopAspects(r),
          factions: '',
        };
      }
      case 'magic-shop': {
        const r = p as unknown as MagicShopResult;
        return {
          name: r.shopName,
          type: `Magic shop · ${r.inputs.archetype}`,
          aspects: shopAspects(r),
          factions: '',
        };
      }
      case 'tavern': {
        const r = p as unknown as TavernResult;
        return {
          name: r.name,
          type: `Tavern · ${r.inputs.vibe}`,
          aspects: tavernAspects(r),
          factions: '',
        };
      }
      case 'tavern-name':
        return {
          name: safeStr(p.name),
          type: 'Tavern',
          aspects: emptyAspects(),
          factions: '',
        };
      case 'dungeon': {
        const r = p as unknown as DungeonResult;
        return {
          name: r.name,
          type: `Dungeon · ${r.inputs.theme}`,
          aspects: dungeonAspects(r),
          factions: '',
        };
      }
      case 'settlement': {
        const r = p as unknown as SettlementResult;
        return {
          name: r.name,
          type: `Settlement · ${r.inputs.sizeClass}`,
          aspects: settlementAspects(r),
          factions: r.details?.region ? `Region: ${r.details.region}` : '',
        };
      }
      case 'locations': {
        const loc = p as { name: string; type: string; culture: string; blurb: string };
        return {
          name: loc.name,
          type: loc.type || '',
          aspects: [loc.blurb || '', loc.culture ? `Culture: ${loc.culture}` : '', ''],
          factions: '',
        };
      }
      default:
        return null;
    }
  }

  if (dest === 'npcs') {
    if (kind === 'names') {
      return {
        name: safeStr(p.name),
        type: '',
        faction: '',
        archetype: safeStr(p.culture),
        goal: '',
        method: '',
      };
    }
    return null;
  }

  if (dest === 'monsters') {
    const m = p as { name?: string; cr?: string; challenge_rating?: string; type?: string; scalingNote?: string };
    const cr = m.cr || m.challenge_rating || '';
    const head = joinClean([safeStr(m.name), cr ? `CR ${cr}` : '', safeStr(m.type)]);
    const tail = kind === 'monster-scale' && m.scalingNote ? ` — ${m.scalingNote}` : '';
    return head + tail;
  }

  if (dest === 'items') {
    if (kind === 'treasure-hoard') {
      if (p.kind === 'magic') {
        const rarity = safeStr(p.rarity);
        const note = safeStr(p.note);
        return joinClean([safeStr(p.name), rarity ? `(${rarity})` : '', note]);
      }
      return null; // coins/gems/art don't belong in Magic Items
    }
    if (kind === 'trinket') {
      return safeStr(p.description);
    }
    return null;
  }

  if (dest === 'treasure') {
    if (kind === 'treasure-hoard') {
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
    if (kind === 'trinket') {
      const hook = safeStr(p.hook);
      return hook ? `${safeStr(p.description)} — ${hook}` : safeStr(p.description);
    }
    return null;
  }

  // facts / scenes / secrets — generic free-form string sinks.
  if (dest === 'facts' || dest === 'scenes' || dest === 'secrets') {
    return item.label;
  }

  return null;
}

// ── Top-level appender ──────────────────────────────────────────────────────

export type CampaignDataPatch = { key: CampaignDestKey; value: unknown[] };

export function buildPatch(
  current: unknown,
  kind: LogKind,
  dest: CampaignDestKey,
  items: SelectableItem[],
): { patch: CampaignDataPatch; added: number } {
  const existing = Array.isArray(current) ? (current as unknown[]) : [];
  const additions: unknown[] = [];
  for (const item of items) {
    const row = mapItem(kind, dest, item);
    if (row === null || row === '') continue;
    additions.push(row);
  }
  return {
    patch: { key: dest, value: [...existing, ...additions] },
    added: additions.length,
  };
}

export function itemsForResult(result: GeneratorResult): SelectableItem[] {
  return itemsFor(result.kind as LogKind, result);
}
