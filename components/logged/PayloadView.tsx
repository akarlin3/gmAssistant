import React from 'react';
import type { LogEntry } from '@/lib/generators/log';
import {
  asPayload,
  type GeneratedName,
  type InventoryItem,
  type MagicItem,
  type MenuItem,
  type NamedDescriptor,
  type PlotSegue,
  type Trinket,
  type Valuable,
  type DungeonRoom,
  type MonsterAction,
} from './types';

/** Renders the expanded body for a single logged entry, by kind. */
export function PayloadView({ entry }: { entry: LogEntry }) {
  const p = asPayload(entry.payload);

  switch (entry.kind) {
    case 'tavern': {
      const details = p.details || {};
      const menu = details.menu || [];
      const patrons = details.patrons || [];
      const rumors = details.rumors || [];
      const owner = details.owner || {};

      return (
        <div className="space-y-4 font-serif text-sm text-ink">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-wide text-ink">{p.name || 'Cozy Tavern'}</h3>
            <div className="mt-0.5 text-xs uppercase italic tracking-wider text-ink-mute">
              {p.inputs?.vibe || 'Cozy'} · {p.inputs?.settlementSize || 'Town'}
            </div>
          </div>
          <p className="rounded border-l-2 border-brass/45 bg-parchment-soft/50 p-2.5 italic text-ink-soft">{details.atmosphere}</p>

          <div className="grid grid-cols-1 gap-4 border-t border-rule/40 pt-3 md:grid-cols-2">
            <div>
              <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Proprietor</h4>
              <p className="text-sm font-semibold">{owner.name} <span className="font-serif text-xs font-normal italic text-ink-soft">— {owner.descriptor}</span></p>
            </div>
            {rumors.length > 0 && (
              <div>
                <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Local Rumors</h4>
                <ul className="list-disc space-y-1 pl-4 text-xs text-ink-soft">
                  {rumors.map((rm: string, idx: number) => <li key={idx}>{rm}</li>)}
                </ul>
              </div>
            )}
          </div>

          {menu.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Menu</h4>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {menu.map((m: MenuItem, idx: number) => (
                  <div key={idx} className="flex items-baseline justify-between border-b border-rule/30 pb-0.5 pr-2">
                    <span>{m.name} <span className="text-[9px] uppercase text-ink-mute">({m.kind})</span></span>
                    <span className="font-display tracking-wider text-brass-deep">{m.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {patrons.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Notable Patrons</h4>
              <div className="space-y-1 text-xs text-ink-soft">
                {patrons.map((pt: NamedDescriptor, idx: number) => (
                  <div key={idx}>
                    <span className="font-display font-semibold tracking-wide text-ink">{pt.name}</span> — {pt.descriptor}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    case 'tavern-name': {
      const names = (p.names || []) as string[];
      return (
        <div className="space-y-2">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Generated Tavern Names</h4>
          <ul className="list-disc space-y-1 pl-5 font-serif text-sm text-ink-soft">
            {names.map((name: string, idx: number) => <li key={idx} className="transition-colors hover:text-brass-deep">{name}</li>)}
          </ul>
        </div>
      );
    }

    case 'trinket': {
      const trinkets = p.trinkets || [];
      return (
        <div className="space-y-3">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Generated Trinkets</h4>
          <div className="space-y-2">
            {trinkets.map((tr: Trinket, idx: number) => (
              <div key={idx} className="rounded border border-rule/30 bg-parchment-soft/45 p-2 font-serif text-sm text-ink-soft">
                <p className="font-semibold text-ink">Trinket #{idx + 1}</p>
                <p className="mt-0.5 italic">"{tr.description}"</p>
                {tr.hook && <p className="mt-1 text-xs text-brass-deep"><strong>Plot Hook:</strong> {tr.hook}</p>}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'plot-segue': {
      const segues = p.segues || [];
      return (
        <div className="space-y-3">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Plot Hook Segues</h4>
          <div className="space-y-3">
            {segues.map((seg: PlotSegue, idx: number) => (
              <div key={idx} className="space-y-1 border-l-2 border-crimson/50 py-1 pl-3.5 font-serif text-sm">
                <h5 className="font-display text-xs font-semibold uppercase tracking-wide text-ink">{seg.title}</h5>
                <p className="italic text-ink-soft">"{seg.readAloud}"</p>
                {seg.gmNote && (
                  <p className="font-sans text-xs text-brass-deep">
                    <strong>DM Note:</strong> {seg.gmNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'names': {
      const names = (p.names || []) as GeneratedName[];
      return (
        <div className="space-y-2">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Batch Generated Names</h4>
          <div className="grid grid-cols-1 gap-2 font-serif text-sm sm:grid-cols-2">
            {names.map((n: GeneratedName, idx: number) => {
              const full = [n.first, n.last].filter(Boolean).join(' ');
              const sameCulture = n.firstCulture && n.firstCulture === n.lastCulture;
              const tag = sameCulture
                ? n.firstCulture
                : [n.firstCulture, n.lastCulture].filter(Boolean).join(' · ');
              return (
                <div key={idx} className="flex items-center justify-between rounded bg-parchment-soft/45 px-2.5 py-1">
                  <span className="font-semibold text-ink">{full}</span>
                  {tag && <span className="text-[10px] italic text-ink-mute">{tag}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'locations': {
      const loc = p.location || p;
      const aspects = (loc.aspects || []) as string[];
      return (
        <div className="space-y-2 font-serif text-sm text-ink">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">AI Generated Location</h4>
          <div className="space-y-1">
            <h5 className="font-display text-sm font-semibold tracking-wide">{loc.name}</h5>
            {loc.type && <p className="font-display text-xs uppercase text-brass-deep">{loc.type}</p>}
            {loc.description && <p className="rounded border border-rule/45 bg-parchment-soft p-2.5 italic text-ink-soft">{loc.description}</p>}
            {Array.isArray(loc.aspects) && aspects.filter(Boolean).length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
                {aspects.filter(Boolean).map((asp: string, idx: number) => <li key={idx}>{asp}</li>)}
              </ul>
            )}
          </div>
        </div>
      );
    }

    case 'mundane-shop':
    case 'magic-shop': {
      const owner = p.owner || {};
      const inventory = p.inventory || [];
      const shopType = p.inputs?.shopType || p.inputs?.archetype || 'Specialty Shop';

      return (
        <div className="space-y-4 font-serif text-sm text-ink">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-wide text-ink">{p.shopName || 'Library Shop'}</h3>
            <div className="mt-0.5 text-xs uppercase italic tracking-wider text-ink-mute">
              {shopType} · {p.inputs?.settlementSize || 'Town'} {p.hours ? `· ${p.hours}` : ''}
            </div>
          </div>

          <div className="flex justify-between gap-4 border-t border-rule/40 pt-3">
            <div>
              <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Proprietor</h4>
              <p className="text-sm font-semibold">{owner.name} <span className="font-serif text-xs font-normal italic text-ink-soft">— {owner.descriptor}</span></p>
            </div>
            {p.rumor && (
              <div className="max-w-xs text-right">
                <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Rumor</h4>
                <p className="text-xs italic text-ink-soft">"{p.rumor}"</p>
              </div>
            )}
          </div>

          {inventory.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Inventory</h4>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {inventory.map((it: InventoryItem, idx: number) => (
                  <div key={idx} className="flex items-baseline justify-between rounded border-b border-rule/30 px-1 pb-1 transition-colors hover:bg-parchment-soft/30">
                    <div className="min-w-0 flex-1 pr-3">
                      <span className="font-display text-xs font-semibold tracking-wide">{it.name}</span>
                      {it.rarity && it.rarity !== 'mundane' && (
                        <span className="py-0.2 ml-2 inline-block rounded bg-brass/15 px-1 font-display text-[8px] uppercase tracking-wider text-brass-deep">
                          {it.rarity}
                        </span>
                      )}
                      {it.note && <p className="mt-0.5 font-serif text-[10px] italic text-ink-soft">{it.note}</p>}
                    </div>
                    <span className="font-display text-xs font-semibold tracking-wider text-brass-deep">{it.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    case 'treasure-hoard': {
      const coins = p.coins || {};
      const gems = p.gems || [];
      const art = p.artObjects || [];
      const items = p.magicItems || [];
      const type = p.inputs?.hoardType || 'Treasure Hoard';

      return (
        <div className="space-y-4 font-serif text-sm text-ink">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wide text-ink">
              {type} (CR {p.inputs?.crTier || '0-4'})
            </h3>
            <p className="mt-0.5 text-[10px] uppercase italic tracking-wider text-ink-mute">Seeded: {p.seed?.toString(16)}</p>
          </div>

          {/* Coin Purse Ledger */}
          <div className="border-t border-rule/40 pt-3">
            <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Valuables Ledger</h4>
            <div className="grid grid-cols-5 gap-2 rounded border border-rule/40 bg-parchment-soft/50 p-2 text-center text-xs">
              <div>
                <div className="font-sans font-semibold text-brass-deep">PP</div>
                <div className="mt-0.5 font-display font-semibold tracking-wider text-ink">{coins.pp || 0}</div>
              </div>
              <div>
                <div className="font-sans font-semibold text-brass-deep">GP</div>
                <div className="mt-0.5 font-display font-semibold tracking-wider text-ink">{coins.gp || 0}</div>
              </div>
              <div>
                <div className="font-sans font-semibold text-brass-deep">EP</div>
                <div className="mt-0.5 font-display font-semibold tracking-wider text-ink">{coins.ep || 0}</div>
              </div>
              <div>
                <div className="font-sans font-semibold text-brass-deep">SP</div>
                <div className="mt-0.5 font-display font-semibold tracking-wider text-ink">{coins.sp || 0}</div>
              </div>
              <div>
                <div className="font-sans font-semibold text-brass-deep">CP</div>
                <div className="mt-0.5 font-display font-semibold tracking-wider text-ink">{coins.cp || 0}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-rule/40 pt-3 md:grid-cols-2">
            {/* Gems & Art */}
            {(gems.length > 0 || art.length > 0) && (
              <div className="space-y-3">
                {gems.length > 0 && (
                  <div>
                    <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Gems</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
                      {gems.map((g: Valuable, idx: number) => (
                        <li key={idx}>{g.name || 'Gems'} — {g.value}gp</li>
                      ))}
                    </ul>
                  </div>
                )}
                {art.length > 0 && (
                  <div>
                    <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Art Objects</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
                      {art.map((a: Valuable, idx: number) => (
                        <li key={idx}>{a.name || 'Art'} — {a.value}gp</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Magic Items */}
            {items.length > 0 && (
              <div>
                <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Magic Items</h4>
                <ul className="list-disc space-y-1 pl-4 font-serif text-xs text-ink-soft">
                  {items.map((it: MagicItem, idx: number) => (
                    <li key={idx}>
                      <span className="text-ink">{it.name}</span> <span className="italic">({it.rarity})</span>
                      {it.note && <p className="ml-1 text-[10px] text-ink-soft/90">{it.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {p.enhancementNote && (
            <div className="rounded border border-rule/30 border-rule/40 bg-parchment-soft p-2.5 text-xs italic text-ink-soft">
              <strong>Narrative context:</strong> {p.enhancementNote}
            </div>
          )}
        </div>
      );
    }

    case 'settlement': {
      const details = p.details || {};
      const notables = details.notables || [];
      const hooks = details.hooks || [];

      return (
        <div className="space-y-4 font-serif text-sm text-ink">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-wide text-ink">{p.name || 'Secluded Settlement'}</h3>
            <div className="mt-0.5 text-xs uppercase italic tracking-wider text-ink-mute">
              {details.sizeClass || 'Village'} · Pop. {details.population?.toLocaleString() || 'Unknown'} {details.region ? `· ${details.region}` : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-rule/40 pt-3 sm:grid-cols-2">
            <div>
              <h4 className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Government Style</h4>
              <p className="text-sm font-semibold">{details.government || 'Traditional Council'}</p>
            </div>
            <div>
              <h4 className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Local Economy</h4>
              <p className="text-sm font-semibold">{details.economy || 'Farming & Trade'}</p>
            </div>
          </div>

          {notables.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Notable Figures</h4>
              <div className="space-y-1 text-xs text-ink-soft">
                {notables.map((n, idx: number) => (
                  <div key={idx}>
                    <span className="font-display font-semibold tracking-wide text-ink">{n.name}</span> — <span className="italic">{n.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hooks.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Regional Hooks & Threads</h4>
              <ul className="list-disc space-y-1 pl-4 text-xs text-ink-soft">
                {hooks.map((hk: string, idx: number) => (
                  <li key={idx}>{hk}</li>
                ))}
              </ul>
            </div>
          )}

          {p.currentSituation && (
            <div className="rounded border border-rule/30 border-rule/40 bg-parchment-soft p-2.5 text-xs italic text-ink-soft">
              <strong>Current Situation:</strong> {p.currentSituation}
            </div>
          )}
        </div>
      );
    }

    case 'dungeon': {
      const details = p.details || {};
      const rooms = details.rooms || [];
      const hazards = details.hazards || [];
      const inhabitants = details.inhabitants || [];

      return (
        <div className="space-y-4 font-serif text-sm text-ink">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-wide text-ink">{p.name || 'Deep Ruins'}</h3>
            <div className="mt-0.5 text-xs uppercase italic tracking-wider text-ink-mute">
              {details.size || 'Medium'} size · Theme: {p.inputs?.theme || 'Ruin'} · Tier: {p.inputs?.challengeTier || '0-4'}
            </div>
          </div>

          {p.hook && (
            <p className="rounded border-l-2 border-crimson/50 bg-parchment-soft/50 p-2.5 italic text-ink-soft">
              {p.hook}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 border-t border-rule/40 pt-3 sm:grid-cols-2">
            {inhabitants.length > 0 && (
              <div>
                <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Inhabitants</h4>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
                  {inhabitants.map((inhab: string, idx: number) => <li key={idx}>{inhab}</li>)}
                </ul>
              </div>
            )}
            {hazards.length > 0 && (
              <div>
                <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Hazards</h4>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
                  {hazards.map((haz: string, idx: number) => <li key={idx}>{haz}</li>)}
                </ul>
              </div>
            )}
          </div>

          {rooms.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Rooms Ledger</h4>
              <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                {rooms.map((rm: DungeonRoom) => (
                  <div key={rm.index} className="space-y-1 rounded border border-rule/40 bg-parchment-soft/45 p-2.5 text-xs">
                    <div className="flex justify-between font-display text-[10px] uppercase tracking-wider text-brass-deep">
                      <span className="font-semibold text-ink">Room {rm.index}: {rm.name}</span>
                      {rm.kind && <span>{rm.kind}</span>}
                    </div>
                    {rm.contents && <p className="text-ink-soft"><strong className="font-display text-[8px] uppercase tracking-wider">Contents:</strong> {rm.contents}</p>}
                    {rm.dressing && <p className="italic text-ink-mute"><strong className="font-display text-[8px] uppercase tracking-wider">Dressing:</strong> {rm.dressing}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    case 'monster-roll':
    case 'monster-scale': {
      // Monstat Scaler details
      const name = p.name || p.monsterName || 'Scaled Monster';
      return (
        <div className="space-y-3 font-serif text-sm text-ink">
          <div>
            <h3 className="font-display text-sm font-semibold tracking-wide text-ink">{name}</h3>
            {p.challengeRating && <p className="font-display text-xs uppercase text-brass-deep">CR {p.challengeRating} {p.type ? `· ${p.type}` : ''}</p>}
          </div>
          {p.stats && (
            <div className="grid grid-cols-6 gap-1 rounded border border-rule/40 bg-parchment-soft/50 p-2 text-center text-xs">
              {Object.entries(p.stats).map(([k, v]) => (
                <div key={k}>
                  <div className="font-sans text-[9px] font-semibold uppercase text-brass-deep">{k}</div>
                  <div className="mt-0.5 font-display font-semibold tracking-wider text-ink">{v}</div>
                </div>
              ))}
            </div>
          )}
          {p.actions && p.actions.length > 0 && (
            <div className="border-t border-rule/40 pt-2 text-xs">
              <h4 className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Actions</h4>
              <ul className="space-y-1.5 text-ink-soft">
                {p.actions.map((act: MonsterAction, idx: number) => (
                  <li key={idx}>
                    <strong>{act.name}:</strong> {act.description || act.desc}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    case 'dice': {
      return (
        <div className="space-y-1 font-serif text-sm">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Saved Dice Roll</h4>
          <p className="text-base font-semibold text-ink">Result: {p.result}</p>
          {p.breakdown && <p className="text-xs italic text-ink-soft">{p.breakdown}</p>}
        </div>
      );
    }

    default:
      return (
        <div className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs text-ink-soft">
          {JSON.stringify(p, null, 2)}
        </div>
      );
  }
}
