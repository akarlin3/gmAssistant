'use client';

import React, { useState, useMemo } from 'react';
import {
  History, Search, Eye, Check, Trash2, Copy, ChevronDown, ChevronRight,
  BookOpen, Sparkles, Skull, Hash, Gem, NotebookPen, Compass, Plus, X,
  Dribbble, Swords, MessageSquare, Flame, HelpCircle
} from 'lucide-react';
import { type LogEntry, type LogKind, removeFromLog, timeAgo } from '@/lib/generators/log';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { type ItemCategory, type ItemRarity, type CoinPurse } from '@/lib/generators/types';

type LoggedTabProps = {
  logs: Partial<Record<LogKind, LogEntry[]>>;
  onChangeLogs: (next: Partial<Record<LogKind, LogEntry[]>>) => void;
  playerLog: PlayerLogEntry[];
  onShareToPlayerLog: (text: string) => void;
};

const CATEGORIES: { value: string; label: string; icon: any }[] = [
  { value: 'all', label: 'All', icon: History },
  { value: 'tavern', label: 'Taverns', icon: Compass },
  { value: 'shop', label: 'Shops', icon: Gem },
  { value: 'dungeon', label: 'Dungeons', icon: Skull },
  { value: 'settlement', label: 'Settlements', icon: Compass },
  { value: 'names', label: 'Names', icon: NotebookPen },
  { value: 'locations', label: 'Locations', icon: Compass },
  { value: 'treasure', label: 'Treasure', icon: Gem },
  { value: 'plot-segue', label: 'Plot Hooks', icon: ScrollTextIcon },
  { value: 'dice', label: 'Dice Rolls', icon: Flame },
];

function ScrollTextIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

export default function LoggedTab({
  logs,
  onChangeLogs,
  playerLog,
  onShareToPlayerLog,
}: LoggedTabProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openEntries, setOpenEntries] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const now = Date.now();

  // Extract all entries into a flat array sorted by timestamp descending
  const allEntries = useMemo(() => {
    const entries: LogEntry[] = [];
    Object.entries(logs).forEach(([kind, kindEntries]) => {
      if (Array.isArray(kindEntries)) {
        kindEntries.forEach((e) => {
          entries.push(e);
        });
      }
    });
    return entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [logs]);

  // Check if a category matches the kind
  const matchesCategory = (kind: LogKind, cat: string): boolean => {
    if (cat === 'all') return true;
    if (cat === 'tavern') return kind === 'tavern' || kind === 'tavern-name';
    if (cat === 'shop') return kind === 'mundane-shop' || kind === 'magic-shop';
    if (cat === 'dungeon') return kind === 'dungeon';
    if (cat === 'settlement') return kind === 'settlement';
    if (cat === 'names') return kind === 'names';
    if (cat === 'locations') return kind === 'locations';
    if (cat === 'treasure') return kind === 'treasure-hoard' || kind === 'trinket';
    if (cat === 'plot-segue') return kind === 'plot-segue';
    if (cat === 'dice') return kind === 'dice';
    return false;
  };

  // Filter and search entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      const catMatch = matchesCategory(e.kind, activeCategory);
      if (!catMatch) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        JSON.stringify(e.payload).toLowerCase().includes(q)
      );
    });
  }, [allEntries, activeCategory, searchQuery]);

  const toggleEntry = (id: string) => {
    setOpenEntries((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const removeEntry = (id: string, kind: LogKind) => {
    const kindEntries = logs[kind] || [];
    const updated = removeFromLog(kindEntries, id);
    onChangeLogs({
      ...logs,
      [kind]: updated,
    });
    setOpenEntries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Checks if this logged library item is already shared in the Player Log
  const getIsShared = (entry: LogEntry): boolean => {
    const signature = `<!-- logged_item_id: ${entry.id} -->`;
    return playerLog.some((e) => e.text.includes(signature) || e.text.includes(entry.title));
  };

  // Copy helper
  const handleCopy = async (entry: LogEntry) => {
    const text = formatPlainText(entry);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1200);
    } catch {
      // clip failed
    }
  };

  // Share to Player Feed helper
  const handleShare = (entry: LogEntry) => {
    const formattedMarkdown = formatMarkdownText(entry);
    onShareToPlayerLog(formattedMarkdown);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-rule bg-parchment p-4 shadow-card space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-crimson animate-pulse" />
            <h2 className="font-display text-lg tracking-wide text-ink sm:text-xl">
              Logged Library Items
            </h2>
            <span className="rounded-full bg-parchment-deep border border-rule px-2.5 py-0.5 text-xs text-ink-soft italic font-serif">
              {allEntries.length} items saved
            </span>
          </div>
          
          <div className="relative w-full max-w-xs sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-ink-mute">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search logged items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-rule bg-parchment-soft pl-8 pr-3 py-1 text-sm font-serif text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-ink-mute hover:text-crimson"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </header>

        {/* Category badges */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule/50 pt-2.5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = cat.value === activeCategory;
            return (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-[10px] uppercase tracking-wider transition-all shadow-sm ${
                  active
                    ? 'border-crimson bg-crimson text-parchment font-semibold'
                    : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep hover:text-ink'
                }`}
              >
                <Icon size={10} className={active ? 'text-parchment' : 'text-brass-deep'} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Results Listing */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-lg border border-rule bg-parchment p-8 shadow-card text-center space-y-2">
          <BookOpen size={24} className="mx-auto text-ink-mute opacity-60" />
          <h3 className="font-display text-sm uppercase tracking-wide text-ink">No saved items found</h3>
          <p className="font-serif text-xs italic text-ink-mute max-w-sm mx-auto">
            {searchQuery
              ? "No items match your active search filter. Clear the query or pick another category."
              : "Items you generated in the Library and saved will be collected here to share, copy, or run."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredEntries.map((e) => {
            const isOpen = !!openEntries[e.id];
            const isShared = getIsShared(e);
            
            // Resolve Kind Label & Styling
            const kindLabel = getKindLabel(e.kind);
            const badgeColor = getKindBadgeStyle(e.kind);
            const LogIcon = getKindIcon(e.kind);

            return (
              <li
                key={e.id}
                className={`group rounded-lg border shadow-sm transition-all duration-150 ${
                  isOpen
                    ? 'border-brass bg-parchment'
                    : 'border-rule bg-parchment hover:border-brass/55'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4">
                  <button
                    onClick={() => toggleEntry(e.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
                    title={isOpen ? 'Collapse details' : 'Expand details'}
                  >
                    <span className="text-ink-mute flex-shrink-0">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="font-display text-[10px] tracking-wider text-ink-mute w-10 flex-shrink-0 tabular-nums">
                      {timeAgo(e.createdAtMs, now)}
                    </span>
                    <div className="min-w-0 flex flex-1 items-center gap-2">
                      <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded px-2 py-0.5 font-display text-[9px] uppercase tracking-wider ${badgeColor}`}>
                        <LogIcon size={9} /> {kindLabel}
                      </span>
                      <span className="truncate font-serif text-sm font-semibold text-ink group-hover:text-brass-deep transition-colors">
                        {e.title}
                      </span>
                    </div>
                  </button>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-1.5">
                    {/* Share with Players */}
                    <button
                      onClick={() => handleShare(e)}
                      disabled={isShared}
                      className={`flex items-center gap-1 rounded border px-2.5 py-1 font-display text-[10px] uppercase tracking-wider transition-all select-none shadow-sm ${
                        isShared
                          ? 'border-moss/40 bg-moss/5 text-moss cursor-default font-semibold'
                          : 'border-brass-deep/60 bg-parchment-soft text-brass-deep hover:bg-brass-deep hover:text-parchment hover:border-brass-deep'
                      }`}
                      title={isShared ? 'Shared in player feed' : 'Reveal details on players page'}
                    >
                      {isShared ? <Check size={11} strokeWidth={3} /> : <Eye size={11} />}
                      {isShared ? 'Shared' : 'Share'}
                    </button>

                    {/* Copy to Clipboard */}
                    <button
                      onClick={() => handleCopy(e)}
                      className="rounded border border-rule bg-parchment-soft p-1 text-ink-soft hover:bg-parchment-deep hover:text-ink transition-colors shadow-sm"
                      title="Copy item text"
                    >
                      {copiedId === e.id ? (
                        <Check size={13} className="text-moss font-bold" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>

                    {/* Remove Log Row */}
                    <button
                      onClick={() => {
                        if (confirm(`Remove this logged item?\n"${e.title}"`)) {
                          removeEntry(e.id, e.kind);
                        }
                      }}
                      className="rounded border border-rule bg-parchment-soft p-1 text-ink-mute hover:bg-crimson/15 hover:text-crimson hover:border-crimson/30 transition-colors shadow-sm"
                      title="Delete log"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded Body Visual Props */}
                {isOpen && (
                  <div className="border-t border-rule bg-parchment-soft/30 px-3.5 pb-4 pt-3.5 rounded-b-lg font-serif">
                    <div className="max-w-3xl mx-auto rounded border border-rule/60 bg-parchment p-4 shadow-card">
                      {renderPayload(e)}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── RENDER PAYLOAD UTIL ──────────────────────────────────────────────────────
function renderPayload(entry: LogEntry) {
  const p = entry.payload as any;

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
                {menu.map((m: any, idx: number) => (
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
                {patrons.map((pt: any, idx: number) => (
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
      const names = p.names || [];
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
            {trinkets.map((tr: any, idx: number) => (
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
            {segues.map((seg: any, idx: number) => (
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
      const names = p.names || [];
      return (
        <div className="space-y-2">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Batch Generated Names</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-serif">
            {names.map((n: any, idx: number) => {
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
      return (
        <div className="space-y-2 text-sm font-serif text-ink">
          <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep">AI Generated Location</h4>
          <div className="space-y-1">
            <h5 className="font-display text-sm font-semibold tracking-wide">{loc.name}</h5>
            {loc.type && <p className="text-xs font-display text-brass-deep uppercase">{loc.type}</p>}
            {loc.description && <p className="italic text-ink-soft bg-parchment-soft p-2.5 rounded border border-rule/45">{loc.description}</p>}
            {Array.isArray(loc.aspects) && loc.aspects.filter(Boolean).length > 0 && (
              <ul className="list-disc pl-5 mt-2 text-xs text-ink-soft space-y-0.5">
                {loc.aspects.filter(Boolean).map((asp: string, idx: number) => <li key={idx}>{asp}</li>)}
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
                {inventory.map((it: any, idx: number) => (
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
                      {gems.map((g: any, idx: number) => (
                        <li key={idx}>{g.name || 'Gems'} — {g.value}gp</li>
                      ))}
                    </ul>
                  </div>
                )}
                {art.length > 0 && (
                  <div>
                    <h4 className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1">Art Objects</h4>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs text-ink-soft">
                      {art.map((a: any, idx: number) => (
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
                  {items.map((it: any, idx: number) => (
                    <li key={idx}>
                      <span className="font-semibold text-ink">{it.name}</span> <span className="italic">({it.rarity})</span>
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
                {notables.map((n: any, idx: number) => (
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
                {rooms.map((rm: any) => (
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
              {Object.entries(p.stats).map(([k, v]: any) => (
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
                {p.actions.map((act: any, idx: number) => (
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

// ── FORMAT PLAIN TEXT UTIL (for Copy) ────────────────────────────────────────
function formatPlainText(entry: LogEntry): string {
  const p = entry.payload as any;
  const kind = entry.kind;

  if (kind === 'tavern') {
    const d = p.details || {};
    return [
      p.name,
      `${p.inputs?.vibe || 'Cozy'} · ${p.inputs?.settlementSize || 'Town'}`,
      d.atmosphere,
      `Proprietor: ${d.owner?.name} — ${d.owner?.descriptor}`,
      'Menu:',
      ...(d.menu || []).map((m: any) => `  - ${m.name} (${m.kind}) — ${m.price}`),
      'Patrons:',
      ...(d.patrons || []).map((pt: any) => `  - ${pt.name} — ${pt.descriptor}`),
      'Rumors:',
      ...(d.rumors || []).map((rm: string) => `  - ${rm}`),
    ].join('\n');
  }

  if (kind === 'tavern-name') {
    return (p.names || []).join('\n');
  }

  if (kind === 'trinket') {
    return (p.trinkets || []).map((t: any, idx: number) => `${idx + 1}. ${t.description}${t.hook ? ` (Plot Hook: ${t.hook})` : ''}`).join('\n');
  }

  if (kind === 'plot-segue') {
    return (p.segues || []).map((s: any) => `${s.title}\n"${s.readAloud}"\nGM Note: ${s.gmNote || ''}`).join('\n\n');
  }

  if (kind === 'names') {
    return (p.names || []).map((n: any) => `${n.first} ${n.last} (${n.firstCulture})`).join('\n');
  }

  if (kind === 'locations') {
    const loc = p.location || p;
    return `${loc.name}\n${loc.type || ''}\n${loc.description || ''}`;
  }

  if (kind === 'mundane-shop' || kind === 'magic-shop') {
    const o = p.owner || {};
    return [
      p.shopName,
      `${p.inputs?.shopType || p.inputs?.archetype || 'Shop'} · ${p.inputs?.settlementSize || 'Town'}`,
      `Owner: ${o.name} — ${o.descriptor}`,
      'Inventory:',
      ...(p.inventory || []).map((it: any) => `  - ${it.name} — ${it.price} (${it.rarity || 'mundane'})`),
    ].join('\n');
  }

  if (kind === 'treasure-hoard') {
    const c = p.coins || {};
    return [
      `Hoard (CR ${p.inputs?.crTier || '0-4'})`,
      `Coins: pp:${c.pp || 0}, gp:${c.gp || 0}, ep:${c.ep || 0}, sp:${c.sp || 0}, cp:${c.cp || 0}`,
      'Gems:',
      ...(p.gems || []).map((g: any) => `  - ${g.name} — ${g.value}gp`),
      'Art Objects:',
      ...(p.artObjects || []).map((a: any) => `  - ${a.name} — ${a.value}gp`),
      'Magic Items:',
      ...(p.magicItems || []).map((it: any) => `  - ${it.name} (${it.rarity})`),
    ].join('\n');
  }

  if (kind === 'settlement') {
    const d = p.details || {};
    return [
      p.name,
      `${d.sizeClass || 'Village'} · Pop. ${d.population || 'Unknown'}`,
      `Gov: ${d.government || 'Traditional'} · Econ: ${d.economy || 'Agriculture'}`,
      'Notables:',
      ...(d.notables || []).map((n: any) => `  - ${n.name} (${n.role})`),
      'Hooks:',
      ...(d.hooks || []).map((hk: string) => `  - ${hk}`),
    ].join('\n');
  }

  if (kind === 'dungeon') {
    const d = p.details || {};
    return [
      p.name,
      `Size: ${d.size} · Theme: ${p.inputs?.theme} · Tier: ${p.inputs?.challengeTier}`,
      `Hook: ${p.hook || ''}`,
      'Rooms:',
      ...(d.rooms || []).map((r: any) => `  Room ${r.index} [${r.name}]: ${r.contents}`),
    ].join('\n');
  }

  return JSON.stringify(p, null, 2);
}

// ── FORMAT MARKDOWN FOR PLAYER FEED (Share button) ──────────────────────────
function formatMarkdownText(entry: LogEntry): string {
  const p = entry.payload as any;
  const kind = entry.kind;
  const signature = `<!-- logged_item_id: ${entry.id} -->`;

  let md = `${signature}\n`;

  switch (kind) {
    case 'tavern': {
      const d = p.details || {};
      md += `### 🍺 Tavern: **${p.name}**\n`;
      md += `*${p.inputs?.vibe || 'Cozy'} tavern located in a ${p.inputs?.settlementSize || 'town'}*\n\n`;
      md += `> ${d.atmosphere}\n\n`;
      md += `**Proprietor:** ${d.owner?.name} — *${d.owner?.descriptor}*\n\n`;
      
      if (d.menu && d.menu.length > 0) {
        md += `#### **Menu Card**\n`;
        d.menu.slice(0, 10).forEach((m: any) => {
          md += `* **${m.name}** (${m.kind}) — \`${m.price}\`\n`;
        });
        md += `\n`;
      }
      
      if (d.rumors && d.rumors.length > 0) {
        md += `#### **Local Whispers**\n`;
        d.rumors.forEach((rm: string) => {
          md += `* *"${rm}"*\n`;
        });
      }
      break;
    }

    case 'tavern-name': {
      md += `### 🏨 **Tavern Names Catalog**\n`;
      (p.names || []).forEach((name: string) => {
        md += `* ${name}\n`;
      });
      break;
    }

    case 'trinket': {
      md += `### 🏺 **Discovered Trinkets**\n`;
      (p.trinkets || []).forEach((tr: any, idx: number) => {
        md += `**Trinket #${idx + 1}**: *"${tr.description}"*\n`;
        if (tr.hook) md += `> *Potential hook: ${tr.hook}*\n`;
        md += `\n`;
      });
      break;
    }

    case 'plot-segue': {
      md += `### 📜 **Story Developments**\n`;
      (p.segues || []).forEach((seg: any) => {
        md += `#### ✦ **${seg.title}**\n`;
        md += `> *${seg.readAloud}*\n\n`;
      });
      break;
    }

    case 'names': {
      md += `### 👥 **Discovered Names**\n`;
      md += `| Name | Culture / Tradition |\n`;
      md += `| :--- | :--- |\n`;
      (p.names || []).forEach((n: any) => {
        const full = [n.first, n.last].filter(Boolean).join(' ');
        md += `| **${full}** | *${n.firstCulture || 'Ancient Tradition'}* |\n`;
      });
      break;
    }

    case 'locations': {
      const loc = p.location || p;
      md += `### 🗺️ **Fantastic Location: ${loc.name}**\n`;
      if (loc.type) md += `*${loc.type}*\n\n`;
      if (loc.description) md += `> ${loc.description}\n\n`;
      if (Array.isArray(loc.aspects) && loc.aspects.filter(Boolean).length > 0) {
        md += `**Key Aspects:**\n`;
        loc.aspects.filter(Boolean).forEach((asp: string) => {
          md += `* *${asp}*\n`;
        });
      }
      break;
    }

    case 'mundane-shop':
    case 'magic-shop': {
      const o = p.owner || {};
      const type = p.inputs?.shopType || p.inputs?.archetype || 'Specialty Shop';
      md += `### 🛍️ Merchant: **${p.shopName || 'Local Shop'}**\n`;
      md += `*${type} · Proprietor: ${o.name} (${o.descriptor})*\n\n`;
      
      if (p.inventory && p.inventory.length > 0) {
        md += `#### **Goods & Services**\n`;
        md += `| Item | Price | Rarity |\n`;
        md += `| :--- | :--- | :--- |\n`;
        p.inventory.slice(0, 15).forEach((it: any) => {
          md += `| **${it.name}** | \`${it.price}\` | *${it.rarity || 'mundane'}* |\n`;
        });
        if (p.inventory.length > 15) {
          md += `\n*...and ${p.inventory.length - 15} additional items in stock.*`;
        }
      }
      break;
    }

    case 'treasure-hoard': {
      const c = p.coins || {};
      const gems = p.gems || [];
      const art = p.artObjects || [];
      const items = p.magicItems || [];
      
      md += `### 🪙 **Treasure Loot Catalog**\n`;
      md += `*Coins and valuables recovered during exploration:*\n\n`;
      
      // Coin table
      md += `| PP | GP | EP | SP | CP |\n`;
      md += `| :---: | :---: | :---: | :---: | :---: |\n`;
      md += `| **${c.pp || 0}** | **${c.gp || 0}** | **${c.ep || 0}** | **${c.sp || 0}** | **${c.cp || 0}** |\n\n`;

      if (gems.length > 0) {
        md += `**Gems Discovered:**\n`;
        gems.forEach((g: any) => {
          md += `* 💎 ${g.name} (Value: \`${g.value}gp\`)\n`;
        });
        md += `\n`;
      }
      
      if (art.length > 0) {
        md += `**Art Objects Recovered:**\n`;
        art.forEach((a: any) => {
          md += `* 🖼️ ${a.name} (Value: \`${a.value}gp\`)\n`;
        });
        md += `\n`;
      }

      if (items.length > 0) {
        md += `**Items Found:**\n`;
        items.forEach((it: any) => {
          md += `* 🛡️ **${it.name}** — *${it.rarity}* ${it.note ? `(*${it.note}*)` : ''}\n`;
        });
      }
      break;
    }

    case 'settlement': {
      const d = p.details || {};
      md += `### 🏰 Settlement: **${p.name}**\n`;
      md += `*${d.sizeClass || 'Settlement'} · Region: ${d.region || 'Uncharted Land'} · Pop. ${d.population?.toLocaleString() || 'Unknown'}*\n\n`;
      md += `* **Government Style:** ${d.government || 'Traditional'}\n`;
      md += `* **Core Economy:** ${d.economy || 'Local Trade'}\n\n`;

      if (d.notables && d.notables.length > 0) {
        md += `**Notable Figures:**\n`;
        d.notables.forEach((n: any) => {
          md += `* **${n.name}** — *${n.role}*\n`;
        });
        md += `\n`;
      }

      if (p.currentSituation) {
        md += `**Current Situation:**\n> ${p.currentSituation}\n`;
      }
      break;
    }

    case 'dungeon': {
      const d = p.details || {};
      md += `### 💀 Ruin: **${p.name}**\n`;
      md += `*${d.size || 'Medium'} size exploration zone · Theme: ${p.inputs?.theme}*\n\n`;
      if (p.hook) md += `> *${p.hook}*\n\n`;
      if (d.hazards && d.hazards.length > 0) {
        md += `**Identified Hazards:**\n`;
        d.hazards.forEach((h: string) => {
          md += `* ⚠️ *${h}*\n`;
        });
      }
      break;
    }

    case 'monster-roll':
    case 'monster-scale': {
      const name = p.name || p.monsterName || 'Scaled Monster';
      md += `### 🦖 Encountered: **${name}**\n`;
      if (p.challengeRating) md += `*Challenge Level: CR ${p.challengeRating}*\n\n`;
      if (p.stats) {
        md += `| STR | DEX | CON | INT | WIS | CHA |\n`;
        md += `| :---: | :---: | :---: | :---: | :---: | :---: |\n`;
        md += `| **${p.stats.str || 10}** | **${p.stats.dex || 10}** | **${p.stats.con || 10}** | **${p.stats.int || 10}** | **${p.stats.wis || 10}** | **${p.stats.cha || 10}** |\n`;
      }
      break;
    }

    case 'dice': {
      md += `### 🎲 Dice Roll: **${p.result}**\n`;
      if (p.breakdown) md += `*Breakdown: ${p.breakdown}*\n`;
      break;
    }

    default:
      md += `### 📋 **Logged: ${entry.title}**\n`;
      md += `\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\``;
  }

  return md;
}

// ── GET CATEGORY META UTILS ──────────────────────────────────────────────────
function getKindLabel(kind: LogKind): string {
  switch (kind) {
    case 'treasure-hoard': return 'Treasure';
    case 'trinket': return 'Trinket';
    case 'mundane-shop': return 'Mundane Shop';
    case 'magic-shop': return 'Magic Shop';
    case 'tavern': return 'Tavern';
    case 'tavern-name': return 'Tavern Name';
    case 'dungeon': return 'Dungeon';
    case 'settlement': return 'Settlement';
    case 'plot-segue': return 'Plot Hook';
    case 'names': return 'Name Batch';
    case 'locations': return 'Location';
    case 'monster-roll': return 'Monster';
    case 'monster-scale': return 'Monster Scale';
    case 'dice': return 'Dice Roll';
    default: return String(kind);
  }
}

function getKindIcon(kind: LogKind): any {
  switch (kind) {
    case 'treasure-hoard': return Gem;
    case 'trinket': return Gem;
    case 'mundane-shop': return Gem;
    case 'magic-shop': return Gem;
    case 'tavern': return Compass;
    case 'tavern-name': return Compass;
    case 'dungeon': return Skull;
    case 'settlement': return Compass;
    case 'plot-segue': return ScrollTextIcon;
    case 'names': return NotebookPen;
    case 'locations': return Compass;
    case 'monster-roll': return Skull;
    case 'monster-scale': return Skull;
    case 'dice': return Flame;
    default: return HelpCircle;
  }
}

function getKindBadgeStyle(kind: LogKind): string {
  switch (kind) {
    case 'treasure-hoard':
    case 'trinket':
      return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25';
    case 'mundane-shop':
    case 'magic-shop':
      return 'bg-amber-500/10 text-amber-600 border border-amber-500/25';
    case 'tavern':
    case 'tavern-name':
      return 'bg-blue-500/10 text-blue-600 border border-blue-500/25';
    case 'dungeon':
      return 'bg-purple-500/10 text-purple-600 border border-purple-500/25';
    case 'settlement':
    case 'locations':
      return 'bg-sky-500/10 text-sky-600 border border-sky-500/25';
    case 'plot-segue':
      return 'bg-rose-500/10 text-rose-600 border border-rose-500/25';
    case 'names':
      return 'bg-teal-500/10 text-teal-600 border border-teal-500/25';
    case 'monster-roll':
    case 'monster-scale':
      return 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/25';
    case 'dice':
      return 'bg-orange-500/10 text-orange-600 border border-orange-500/25';
    default:
      return 'bg-zinc-500/10 text-zinc-600 border border-zinc-500/25';
  }
}
