'use client';

import { useState, useMemo } from 'react';
import { Plus, X, Coins, Package, Weight, RefreshCw } from 'lucide-react';
import type { Character } from '@/lib/character-schema';
import {
  encumbrance,
  totalCarriedLb,
  containerStatus,
  consolidatePurse,
  purseToGp,
  purseWeightLb,
  emptyPurse,
  CONTAINER_PRESETS,
  SIZE_MULTIPLIERS,
  type Container,
  type Item,
  type CoinPurse,
} from '@/lib/logistics';

export type LogisticsState = {
  /** Per-character logistics state, keyed by character id. */
  byCharacter: Record<string, {
    strength: number;
    size: keyof typeof SIZE_MULTIPLIERS;
    purse: CoinPurse;
    containers: Container[];
    items: Item[];
  }>;
  /** Optional shared "party stash" — items not in any individual's pack. */
  party: { purse: CoinPurse; containers: Container[]; items: Item[] };
};

export function emptyLogistics(): LogisticsState {
  return {
    byCharacter: {},
    party: { purse: emptyPurse(), containers: [], items: [] },
  };
}

type Props = {
  characters: Character[];
  state: LogisticsState;
  onChange: (next: LogisticsState) => void;
};

export default function LogisticsTab({ characters, state, onChange }: Props) {
  const [activeId, setActiveId] = useState<string>(characters[0]?.id ?? 'party');

  const ensureCharacter = (id: string) => {
    if (state.byCharacter[id]) return state;
    const c = characters.find(x => x.id === id);
    const strFromSheet = Number(c?.abilities?.str || '');
    const strFromPb = c?.pointBuy
      ? (c.pointBuy.base.str ?? 10) + (c.pointBuy.racial.str ?? 0)
      : 0;
    const str = Number.isFinite(strFromSheet) && strFromSheet > 0
      ? strFromSheet
      : strFromPb || 10;
    return {
      ...state,
      byCharacter: {
        ...state.byCharacter,
        [id]: {
          strength: str,
          size: 'Medium',
          purse: emptyPurse(),
          containers: [],
          items: [],
        },
      },
    };
  };

  return (
    <div className="space-y-4 text-sm">
      <header className="space-y-1">
        <h2 className="font-display text-lg uppercase tracking-wide text-ink">Logistics</h2>
        <p className="font-serif text-xs italic text-ink-mute">
          Strict 5e encumbrance, container capacities, and currency totals.
          Switch between party stash and individual loadouts.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveId('party')}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
            activeId === 'party'
              ? 'border-crimson bg-crimson text-parchment'
              : 'border-rule bg-parchment-soft text-ink-soft hover:border-brass'
          }`}
        >
          Party Stash
        </button>
        {characters.filter(c => !c.isSidekick).map(c => (
          <button
            key={c.id}
            onClick={() => { onChange(ensureCharacter(c.id)); setActiveId(c.id); }}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
              activeId === c.id
                ? 'border-crimson bg-crimson text-parchment'
                : 'border-rule bg-parchment-soft text-ink-soft hover:border-brass'
            }`}
          >
            {c.name || 'Unnamed'}
          </button>
        ))}
      </nav>

      {activeId === 'party' ? (
        <PartyPanel state={state} onChange={onChange} />
      ) : (
        <CharacterPanel
          characterId={activeId}
          state={ensureCharacter(activeId).byCharacter[activeId]
            ?? { strength: 10, size: 'Medium', purse: emptyPurse(), containers: [], items: [] }}
          onChange={(next) => onChange({
            ...state,
            byCharacter: { ...state.byCharacter, [activeId]: next },
          })}
        />
      )}
    </div>
  );
}

function PursePanel({
  purse, onChange,
}: { purse: CoinPurse; onChange: (p: CoinPurse) => void }) {
  const totalGp = purseToGp(purse);
  const weight = purseWeightLb(purse);
  return (
    <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-ink">
        <Coins size={14} /> Coin Purse
      </h3>
      <div className="grid grid-cols-5 gap-2">
        {(['cp','sp','ep','gp','pp'] as const).map(coin => (
          <label key={coin} className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{coin}</span>
            <input
              type="number"
              min={0}
              value={purse[coin]}
              onChange={(e) => onChange({ ...purse, [coin]: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-rule pt-2">
        <div className="font-serif text-xs text-ink-mute">
          <span className="font-display text-ink">{totalGp.toFixed(2)} gp</span> total, weighs{' '}
          <span className="font-display text-ink">{weight.toFixed(2)} lb</span>
        </div>
        <button
          onClick={() => onChange(consolidatePurse(purse))}
          className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
        >
          <RefreshCw size={10} /> Consolidate
        </button>
      </div>
    </section>
  );
}

function ContainersPanel({
  containers, items, onChangeContainers, onChangeItems,
}: {
  containers: Container[];
  items: Item[];
  onChangeContainers: (c: Container[]) => void;
  onChangeItems: (i: Item[]) => void;
}) {
  return (
    <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-ink">
          <Package size={14} /> Containers
        </h3>
        <div className="flex items-center gap-1.5">
          <select
            onChange={(e) => {
              const preset = CONTAINER_PRESETS.find(p => p.id === e.target.value);
              if (!preset) return;
              onChangeContainers([
                ...containers,
                { ...preset, id: `${preset.id}-${Date.now()}` },
              ]);
              e.currentTarget.value = '';
            }}
            defaultValue=""
            className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
          >
            <option value="" disabled>Add container…</option>
            {CONTAINER_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      {containers.length === 0 && (
        <p className="font-serif text-xs italic text-ink-mute">No containers — items will be loose.</p>
      )}
      <div className="space-y-2">
        {containers.map(c => {
          const s = containerStatus(c, items);
          const bind = s.weightUsage >= s.volumeUsage ? 'weight' : 'volume';
          const pct = Math.min(100, Math.max(s.weightUsage, s.volumeUsage) * 100);
          return (
            <div key={c.id} className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={c.label}
                  onChange={(e) => onChangeContainers(containers.map(x => x.id === c.id ? { ...x, label: e.target.value } : x))}
                  className="flex-1 bg-transparent font-display text-sm text-ink focus:outline-none"
                />
                <button
                  onClick={() => {
                    onChangeContainers(containers.filter(x => x.id !== c.id));
                    onChangeItems(items.map(it => it.containerId === c.id ? { ...it, containerId: undefined } : it));
                  }}
                  className="text-ink-mute hover:text-crimson"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-parchment-deep">
                <div
                  className={`h-full ${s.overWeight || s.overVolume ? 'bg-crimson' : 'bg-brass'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="font-serif text-xs text-ink-mute">
                {s.itemsWeightLb.toFixed(1)} / {c.maxWeightLb} lb · {s.itemsVolumeL.toFixed(1)} / {c.maxVolumeL} L
                {(s.overWeight || s.overVolume) && (
                  <span className="ml-1.5 font-display uppercase tracking-wider text-crimson">
                    over by {bind}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ItemsPanel({
  items, containers, onChange,
}: {
  items: Item[];
  containers: Container[];
  onChange: (i: Item[]) => void;
}) {
  const [draft, setDraft] = useState<Partial<Item>>({ name: '', weightLb: 0, volumeL: 0, quantity: 1 });
  const addItem = () => {
    if (!draft.name?.trim()) return;
    onChange([...items, {
      id: `item-${Date.now()}`,
      name: draft.name.trim(),
      weightLb: Number(draft.weightLb) || 0,
      volumeL: Number(draft.volumeL) || 0,
      quantity: Math.max(1, Number(draft.quantity) || 1),
      containerId: draft.containerId,
    }]);
    setDraft({ name: '', weightLb: 0, volumeL: 0, quantity: 1, containerId: draft.containerId });
  };
  return (
    <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <h3 className="font-display text-sm uppercase tracking-wide text-ink">Items</h3>
      <div className="grid grid-cols-[1fr_70px_70px_60px_120px_auto] items-end gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Name</span>
          <input
            value={draft.name ?? ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
            className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Weight lb</span>
          <input
            type="number" step={0.1} min={0}
            value={draft.weightLb ?? 0}
            onChange={(e) => setDraft({ ...draft, weightLb: Number(e.target.value) || 0 })}
            className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Vol L</span>
          <input
            type="number" step={0.1} min={0}
            value={draft.volumeL ?? 0}
            onChange={(e) => setDraft({ ...draft, volumeL: Number(e.target.value) || 0 })}
            className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Qty</span>
          <input
            type="number" min={1}
            value={draft.quantity ?? 1}
            onChange={(e) => setDraft({ ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })}
            className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">In</span>
          <select
            value={draft.containerId ?? ''}
            onChange={(e) => setDraft({ ...draft, containerId: e.target.value || undefined })}
            className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          >
            <option value="">— loose —</option>
            {containers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <button
          onClick={addItem}
          className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="space-y-1">
        {items.map(it => (
          <div key={it.id} className="flex items-center gap-1.5 rounded border border-rule bg-parchment-soft p-1.5">
            <input
              value={it.name}
              onChange={(e) => onChange(items.map(x => x.id === it.id ? { ...x, name: e.target.value } : x))}
              className="flex-1 bg-transparent font-serif text-sm text-ink focus:outline-none"
            />
            <input
              type="number" min={1}
              value={it.quantity}
              onChange={(e) => onChange(items.map(x => x.id === it.id ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
              className="w-12 rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
            />
            <span className="font-serif text-xs text-ink-mute">×</span>
            <input
              type="number" step={0.1} min={0}
              value={it.weightLb}
              onChange={(e) => onChange(items.map(x => x.id === it.id ? { ...x, weightLb: Number(e.target.value) || 0 } : x))}
              className="w-14 rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
            />
            <span className="font-serif text-xs text-ink-mute">lb</span>
            <select
              value={it.containerId ?? ''}
              onChange={(e) => onChange(items.map(x => x.id === it.id ? { ...x, containerId: e.target.value || undefined } : x))}
              className="rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
            >
              <option value="">— loose —</option>
              {containers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button
              onClick={() => onChange(items.filter(x => x.id !== it.id))}
              className="text-ink-mute hover:text-crimson"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="font-serif text-xs italic text-ink-mute">No items yet.</p>
        )}
      </div>
    </section>
  );
}

function CharacterPanel({
  characterId,
  state,
  onChange,
}: {
  characterId: string;
  state: LogisticsState['byCharacter'][string];
  onChange: (next: LogisticsState['byCharacter'][string]) => void;
}) {
  const carried = useMemo(
    () => totalCarriedLb(state.items, state.containers) + purseWeightLb(state.purse),
    [state.items, state.containers, state.purse],
  );
  const enc = encumbrance({
    strength: state.strength,
    carriedLb: carried,
    sizeMultiplier: SIZE_MULTIPLIERS[state.size] ?? 1,
  });
  const tierColor =
    enc.tier === 'unencumbered' ? 'text-moss border-moss/40 bg-moss/5'
    : enc.tier === 'encumbered' ? 'text-brass-deep border-brass/40 bg-brass-soft/20'
    : 'text-crimson border-crimson/40 bg-crimson/10';

  return (
    <div className="space-y-4">
      <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
        <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-ink">
          <Weight size={14} /> Encumbrance
        </h3>
        <div className="grid grid-cols-[100px_120px_1fr] items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">STR</span>
            <input
              type="number" min={1} max={30}
              value={state.strength}
              onChange={(e) => onChange({ ...state, strength: Math.max(1, Math.min(30, Number(e.target.value) || 10)) })}
              className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Size</span>
            <select
              value={state.size}
              onChange={(e) => onChange({ ...state, size: e.target.value as keyof typeof SIZE_MULTIPLIERS })}
              className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            >
              {Object.keys(SIZE_MULTIPLIERS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="font-serif text-xs text-ink-mute">
            Capacity <span className="font-display text-ink">{enc.capacityLb} lb</span> ·{' '}
            Lift <span className="font-display text-ink">{enc.liftLb} lb</span> ·{' '}
            Drag <span className="font-display text-ink">{enc.dragLb} lb</span>
          </div>
        </div>
        <div className={`rounded border p-2.5 ${tierColor}`}>
          <div className="flex items-center justify-between">
            <span className="font-display text-sm uppercase tracking-wider">
              {enc.tier.replace('-', ' ')}
            </span>
            <span className="font-display text-sm">
              {carried.toFixed(1)} / {enc.capacityLb} lb
            </span>
          </div>
          {enc.speedPenaltyFt > 0 && (
            <div className="mt-1 font-serif text-xs">
              Speed −{enc.speedPenaltyFt} ft
              {enc.disadvantage && '. Disadvantage on Str/Dex/Con checks, saves, attacks.'}
            </div>
          )}
        </div>
      </section>

      <PursePanel
        purse={state.purse}
        onChange={(p) => onChange({ ...state, purse: p })}
      />
      <ContainersPanel
        containers={state.containers}
        items={state.items}
        onChangeContainers={(c) => onChange({ ...state, containers: c })}
        onChangeItems={(i) => onChange({ ...state, items: i })}
      />
      <ItemsPanel
        items={state.items}
        containers={state.containers}
        onChange={(i) => onChange({ ...state, items: i })}
      />
    </div>
  );
}

function PartyPanel({
  state, onChange,
}: { state: LogisticsState; onChange: (s: LogisticsState) => void }) {
  return (
    <div className="space-y-4">
      <PursePanel
        purse={state.party.purse}
        onChange={(p) => onChange({ ...state, party: { ...state.party, purse: p } })}
      />
      <ContainersPanel
        containers={state.party.containers}
        items={state.party.items}
        onChangeContainers={(c) => onChange({ ...state, party: { ...state.party, containers: c } })}
        onChangeItems={(i) => onChange({ ...state, party: { ...state.party, items: i } })}
      />
      <ItemsPanel
        items={state.party.items}
        containers={state.party.containers}
        onChange={(i) => onChange({ ...state, party: { ...state.party, items: i } })}
      />
    </div>
  );
}
