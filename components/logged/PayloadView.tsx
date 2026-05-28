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
        <div className="space-y-4 text-sm text-ink font-serif">
          <div>
            <h3 className="font-display text-lg text-ink font-semibold tracking-wide">{p.name || 'Cozy Tavern'}</h3>
            <div className="text-xs italic text-ink-mute uppercase tracking-wider mt-0.5">
              {p.inputs?.vibe || 'Cozy'} · {p.inputs?.settlementSize || 'Town'}
            </div>
          </div>
          <p className="italic text-ink-soft bg-parchment-soft/50 p-2.5 rounded border-l-2 border-brass/45">{details.atmosphere}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-rule/40 pt-3">
            <div>
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Proprietor</h4>
              <p className="text-sm font-semibold">{owner.name} <span className="font-serif font-normal italic text-xs text-ink-soft">— {owner.descriptor}</span></p>
            </div>
            {rumors.length > 0 && (
              <div>
                <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Local Rumors</h4>
                <ul className="list-disc pl-4 space-y-1 text-xs text-ink-soft">
                  {rumors.map((rm: string, idx: number) => <li key={idx}>{rm}</li>)}
                </ul>
              </div>
            )}
          </div>

          {menu.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Menu</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {menu.map((m: MenuItem, idx: number) => (
                  <div key={idx} className="flex justify-between items-baseline border-b border-rule/30 pb-0.5 pr-2">
                    <span>{m.name} <span className="text-[9px] uppercase text-ink-mute">({m.kind})</span></span>
                    <span className="font-display tracking-wider text-brass-deep">{m.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {patrons.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Notable Patrons</h4>
              <div className="space-y-1 text-xs text-ink-soft">
                {patrons.map((pt: NamedDescriptor, idx: number) => (
                  <div key={idx}>
                    <span className="font-display font-semibold text-ink tracking-wide">{pt.name}</span> — {pt.descriptor}
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
          <ul className="list-disc pl-5 space-y-1 text-sm font-serif text-ink-soft">
            {names.map((name: string, idx: number) => <li key={idx} className="hover:text-brass-deep transition-colors">{name}</li>)}
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
              <div key={idx} className="text-sm font-serif text-ink-soft bg-parchment-soft/45 p-2 rounded border border-rule/30">
                <p className="font-semibold text-ink">Trinket #{idx + 1}</p>
                <p className="italic mt-0.5">"{tr.description}"</p>
                {tr.hook && <p className="text-xs text-brass-deep mt-1"><strong>Plot Hook:</strong> {tr.hook}</p>}
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
              <div key={idx} className="border-l-2 border-crimson/50 pl-3.5 py-1 space-y-1 text-sm font-serif">
                <h5 className="font-display text-xs font-semibold text-ink tracking-wide uppercase">{seg.title}</h5>
                <p className="italic text-ink-soft">"{seg.readAloud}"</p>
                {seg.gmNote && (
                  <p className="text-xs text-brass-deep font-sans">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-serif">
            {names.map((n: GeneratedName, idx: number) => {
              const full = [n.first, n.last].filter(Boolean).join(' ');
              const sameCulture = n.firstCulture && n.firstCulture === n.lastCulture;
              const tag = sameCulture
                ? n.firstCulture
                : [n.firstCulture, n.lastCulture].filter(Boolean).join(' · ');
              return (
                <div key={idx} className="flex justify-between items-center bg-parchment-soft/45 px-2.5 py-1 rounded">
                  <span className="font-semibold text-ink">{full}</span>
                  {tag && <span className="text-[10px] text-ink-mute italic">{tag}</span>}
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
        <div className="space-y-2 text-sm font-serif text-ink">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">AI Generated Location</h4>
          <div className="space-y-1">
            <h5 className="font-display text-sm font-semibold tracking-wide">{loc.name}</h5>
            {loc.type && <p className="text-xs font-display text-brass-deep uppercase">{loc.type}</p>}
            {loc.description && <p className="italic text-ink-soft bg-parchment-soft p-2.5 rounded border border-rule/45">{loc.description}</p>}
            {Array.isArray(loc.aspects) && aspects.filter(Boolean).length > 0 && (
              <ul className="list-disc pl-5 mt-2 text-xs text-ink-soft space-y-0.5">
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
        <div className="space-y-4 text-sm text-ink font-serif">
          <div>
            <h3 className="font-display text-lg text-ink font-semibold tracking-wide">{p.shopName || 'Library Shop'}</h3>
            <div className="text-xs italic text-ink-mute uppercase tracking-wider mt-0.5">
              {shopType} · {p.inputs?.settlementSize || 'Town'} {p.hours ? `· ${p.hours}` : ''}
            </div>
          </div>

          <div className="border-t border-rule/40 pt-3 flex justify-between gap-4">
            <div>
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Proprietor</h4>
              <p className="text-sm font-semibold">{owner.name} <span className="font-serif font-normal italic text-xs text-ink-soft">— {owner.descriptor}</span></p>
            </div>
            {p.rumor && (
              <div className="max-w-xs text-right">
                <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Rumor</h4>
                <p className="text-xs italic text-ink-soft">"{p.rumor}"</p>
              </div>
            )}
          </div>

          {inventory.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Inventory</h4>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {inventory.map((it: InventoryItem, idx: number) => (
                  <div key={idx} className="flex justify-between items-baseline border-b border-rule/30 pb-1 hover:bg-parchment-soft/30 px-1 rounded transition-colors">
                    <div className="min-w-0 flex-1 pr-3">
                      <span className="font-display font-semibold text-xs tracking-wide">{it.name}</span>
                      {it.rarity && it.rarity !== 'mundane' && (
                        <span className="ml-2 inline-block rounded bg-brass/15 px-1 py-0.2 text-[8px] font-display uppercase tracking-wider text-brass-deep">
                          {it.rarity}
                        </span>
                      )}
                      {it.note && <p className="text-[10px] text-ink-soft italic font-serif mt-0.5">{it.note}</p>}
                    </div>
                    <span className="font-display text-xs tracking-wider text-brass-deep font-semibold">{it.price}</span>
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
        <div className="space-y-4 text-sm text-ink font-serif">
          <div>
            <h3 className="font-display text-base text-ink font-semibold tracking-wide">
              {type} (CR {p.inputs?.crTier || '0-4'})
            </h3>
            <p className="text-[10px] italic text-ink-mute uppercase tracking-wider mt-0.5">Seeded: {p.seed?.toString(16)}</p>
          </div>

          {/* Coin Purse Ledger */}
          <div className="border-t border-rule/40 pt-3">
            <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Valuables Ledger</h4>
            <div className="grid grid-cols-5 gap-2 text-center text-xs border border-rule/40 rounded bg-parchment-soft/50 p-2">
              <div>
                <div className="font-semibold text-brass-deep font-sans">PP</div>
                <div className="font-display tracking-wider font-semibold text-ink mt-0.5">{coins.pp || 0}</div>
              </div>
              <div>
                <div className="font-semibold text-brass-deep font-sans">GP</div>
                <div className="font-display tracking-wider font-semibold text-ink mt-0.5">{coins.gp || 0}</div>
              </div>
              <div>
                <div className="font-semibold text-brass-deep font-sans">EP</div>
                <div className="font-display tracking-wider font-semibold text-ink mt-0.5">{coins.ep || 0}</div>
              </div>
              <div>
                <div className="font-semibold text-brass-deep font-sans">SP</div>
                <div className="font-display tracking-wider font-semibold text-ink mt-0.5">{coins.sp || 0}</div>
              </div>
              <div>
                <div className="font-semibold text-brass-deep font-sans">CP</div>
                <div className="font-display tracking-wider font-semibold text-ink mt-0.5">{coins.cp || 0}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-rule/40 pt-3">
            {/* Gems & Art */}
            {(gems.length > 0 || art.length > 0) && (
              <div className="space-y-3">
                {gems.length > 0 && (
                  <div>
                    <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Gems</h4>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs text-ink-soft">
                      {gems.map((g: Valuable, idx: number) => (
                        <li key={idx}>{g.name || 'Gems'} — {g.value}gp</li>
                      ))}
                    </ul>
                  </div>
                )}
                {art.length > 0 && (
                  <div>
                    <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Art Objects</h4>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs text-ink-soft">
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
                <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Magic Items</h4>
                <ul className="list-disc pl-4 space-y-1 text-xs text-ink-soft font-serif">
                  {items.map((it: MagicItem, idx: number) => (
                    <li key={idx}>
                      <span className="text-ink">{it.name}</span> <span className="italic">({it.rarity})</span>
                      {it.note && <p className="text-[10px] text-ink-soft/90 ml-1">{it.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {p.enhancementNote && (
            <div className="border-t border-rule/40 pt-2.5 text-xs italic text-ink-soft bg-parchment-soft p-2.5 rounded border border-rule/30">
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
        <div className="space-y-4 text-sm text-ink font-serif">
          <div>
            <h3 className="font-display text-lg text-ink font-semibold tracking-wide">{p.name || 'Secluded Settlement'}</h3>
            <div className="text-xs italic text-ink-mute uppercase tracking-wider mt-0.5">
              {details.sizeClass || 'Village'} · Pop. {details.population?.toLocaleString() || 'Unknown'} {details.region ? `· ${details.region}` : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-rule/40 pt-3">
            <div>
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-0.5">Government Style</h4>
              <p className="text-sm font-semibold">{details.government || 'Traditional Council'}</p>
            </div>
            <div>
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-0.5">Local Economy</h4>
              <p className="text-sm font-semibold">{details.economy || 'Farming & Trade'}</p>
            </div>
          </div>

          {notables.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Notable Figures</h4>
              <div className="space-y-1 text-xs text-ink-soft">
                {notables.map((n, idx: number) => (
                  <div key={idx}>
                    <span className="font-display font-semibold text-ink tracking-wide">{n.name}</span> — <span className="italic">{n.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hooks.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Regional Hooks & Threads</h4>
              <ul className="list-disc pl-4 space-y-1 text-xs text-ink-soft">
                {hooks.map((hk: string, idx: number) => (
                  <li key={idx}>{hk}</li>
                ))}
              </ul>
            </div>
          )}

          {p.currentSituation && (
            <div className="border-t border-rule/40 pt-2.5 text-xs italic text-ink-soft bg-parchment-soft p-2.5 rounded border border-rule/30">
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
        <div className="space-y-4 text-sm text-ink font-serif">
          <div>
            <h3 className="font-display text-lg text-ink font-semibold tracking-wide">{p.name || 'Deep Ruins'}</h3>
            <div className="text-xs italic text-ink-mute uppercase tracking-wider mt-0.5">
              {details.size || 'Medium'} size · Theme: {p.inputs?.theme || 'Ruin'} · Tier: {p.inputs?.challengeTier || '0-4'}
            </div>
          </div>

          {p.hook && (
            <p className="italic text-ink-soft bg-parchment-soft/50 p-2.5 rounded border-l-2 border-crimson/50">
              {p.hook}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-rule/40 pt-3">
            {inhabitants.length > 0 && (
              <div>
                <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Inhabitants</h4>
                <ul className="list-disc pl-4 space-y-0.5 text-xs text-ink-soft">
                  {inhabitants.map((inhab: string, idx: number) => <li key={idx}>{inhab}</li>)}
                </ul>
              </div>
            )}
            {hazards.length > 0 && (
              <div>
                <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Hazards</h4>
                <ul className="list-disc pl-4 space-y-0.5 text-xs text-ink-soft">
                  {hazards.map((haz: string, idx: number) => <li key={idx}>{haz}</li>)}
                </ul>
              </div>
            )}
          </div>

          {rooms.length > 0 && (
            <div className="border-t border-rule/40 pt-3">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1.5">Rooms Ledger</h4>
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {rooms.map((rm: DungeonRoom) => (
                  <div key={rm.index} className="bg-parchment-soft/45 border border-rule/40 p-2.5 rounded text-xs space-y-1">
                    <div className="flex justify-between font-display text-[10px] uppercase tracking-wider text-brass-deep">
                      <span className="font-semibold text-ink">Room {rm.index}: {rm.name}</span>
                      {rm.kind && <span>{rm.kind}</span>}
                    </div>
                    {rm.contents && <p className="text-ink-soft"><strong className="font-display text-[8px] uppercase tracking-wider">Contents:</strong> {rm.contents}</p>}
                    {rm.dressing && <p className="text-ink-mute italic"><strong className="font-display text-[8px] uppercase tracking-wider">Dressing:</strong> {rm.dressing}</p>}
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
        <div className="space-y-3 text-sm text-ink font-serif">
          <div>
            <h3 className="font-display text-sm text-ink font-semibold tracking-wide">{name}</h3>
            {p.challengeRating && <p className="text-xs font-display text-brass-deep uppercase">CR {p.challengeRating} {p.type ? `· ${p.type}` : ''}</p>}
          </div>
          {p.stats && (
            <div className="grid grid-cols-6 gap-1 bg-parchment-soft/50 p-2 border border-rule/40 rounded text-center text-xs">
              {Object.entries(p.stats).map(([k, v]) => (
                <div key={k}>
                  <div className="font-semibold text-brass-deep font-sans uppercase text-[9px]">{k}</div>
                  <div className="font-display tracking-wider font-semibold text-ink mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          )}
          {p.actions && p.actions.length > 0 && (
            <div className="border-t border-rule/40 pt-2 text-xs">
              <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Actions</h4>
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
        <div className="font-mono text-xs text-ink-soft whitespace-pre-wrap max-h-56 overflow-auto">
          {JSON.stringify(p, null, 2)}
        </div>
      );
  }
}
