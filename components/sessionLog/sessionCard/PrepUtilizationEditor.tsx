import { X } from 'lucide-react';
import { parseMonsterName, parseMonsterXP } from '@/lib/sessionLog';
import { normalizeItem } from '@/lib/playerMode/types';
import type { NPC, LocationRow } from '../types';
import type { LinkedPrepItem } from '@/lib/sessionLog';

type RawItem = string | Record<string, any>;

type Props = {
  linkedItems: LinkedPrepItem[];
  npcs: NPC[];
  locations: LocationRow[];
  monsters: string[];
  items: unknown[];
  treasure: string[];
  isGhostItem: (item: LinkedPrepItem) => boolean;
  handleAddLink: (type: LinkedPrepItem['type'], id: string, name: string, extra?: { xp?: number; loot?: string }) => void;
  handleRemoveLink: (type: LinkedPrepItem['type'], id: string) => void;
  handleUpdateXP: (id: string, xp: number) => void;
};

export function PrepUtilizationEditor({
  linkedItems, npcs, locations, monsters, items, treasure,
  isGhostItem, handleAddLink, handleRemoveLink, handleUpdateXP,
}: Props) {
  return (
    <div className="mt-3 space-y-3 rounded border border-rule bg-parchment-soft p-3.5 shadow-sm">
      <span className="block border-b border-rule/40 pb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Prep Utilization & Party State Ledger</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {/* NPCs utilization */}
        <div className="space-y-2">
          <span className="block font-display text-[9px] uppercase tracking-wider text-ink-mute">NPCs Utilized</span>
          <ul className="space-y-1">
            {linkedItems.filter(i => i.type === 'npc').map(item => {
              const ghost = isGhostItem(item);
              return (
                <li key={item.id} className="flex items-center justify-between gap-1.5 rounded border border-rule/40 bg-parchment px-2 py-1 font-serif text-xs">
                  <span className={ghost ? "flex items-center gap-1 italic text-ink-mute" : "text-ink"}>
                    {ghost && <span className="py-0.2 inline-block scale-90 rounded bg-wine/10 px-1 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    {item.snapshotName}
                  </span>
                  <button type="button" onClick={() => handleRemoveLink('npc', item.id)} className="text-ink-mute transition-colors hover:text-crimson">
                    <X size={12} />
                  </button>
                </li>
              );
            })}
            {linkedItems.filter(i => i.type === 'npc').length === 0 && (
              <li className="font-serif text-[11px] italic text-ink-mute">No NPCs linked</li>
            )}
          </ul>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const npc = npcs.find(n => n.id === val);
              if (npc) handleAddLink('npc', val, npc.name || 'Unnamed NPC');
            }}
            className="w-full cursor-pointer rounded border border-rule/50 bg-parchment px-2 py-0.5 font-serif text-xs text-ink-soft transition-colors hover:border-brass focus:outline-none"
          >
            <option value="">+ Link NPC</option>
            {npcs.filter(n => !linkedItems.some(i => i.type === 'npc' && i.id === n.id)).map(n => (
              <option key={n.id} value={n.id}>{n.name || 'Unnamed NPC'}</option>
            ))}
          </select>
        </div>

        {/* Locations utilization */}
        <div className="space-y-2">
          <span className="block font-display text-[9px] uppercase tracking-wider text-ink-mute">Locations Utilized</span>
          <ul className="space-y-1">
            {linkedItems.filter(i => i.type === 'location').map(item => {
              const ghost = isGhostItem(item);
              return (
                <li key={item.id} className="flex items-center justify-between gap-1.5 rounded border border-rule/40 bg-parchment px-2 py-1 font-serif text-xs">
                  <span className={ghost ? "flex items-center gap-1 italic text-ink-mute" : "text-ink"}>
                    {ghost && <span className="py-0.2 inline-block scale-90 rounded bg-wine/10 px-1 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    {item.snapshotName}
                  </span>
                  <button type="button" onClick={() => handleRemoveLink('location', item.id)} className="text-ink-mute transition-colors hover:text-crimson">
                    <X size={12} />
                  </button>
                </li>
              );
            })}
            {linkedItems.filter(i => i.type === 'location').length === 0 && (
              <li className="font-serif text-[11px] italic text-ink-mute">No locations linked</li>
            )}
          </ul>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const loc = locations.find(l => l.id === val || l.name === val);
              if (loc) handleAddLink('location', val, loc.name);
            }}
            className="w-full cursor-pointer rounded border border-rule/50 bg-parchment px-2 py-0.5 font-serif text-xs text-ink-soft transition-colors hover:border-brass focus:outline-none"
          >
            <option value="">+ Link Location</option>
            {locations.filter(l => !linkedItems.some(i => i.type === 'location' && (i.id === l.id || i.snapshotName === l.name))).map((l, idx) => (
              <option key={l.id || idx} value={l.id || l.name}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Encounters utilization */}
        <div className="space-y-2">
          <span className="block font-display text-[9px] uppercase tracking-wider text-ink-mute">Encounters Utilized</span>
          <ul className="space-y-1.5">
            {linkedItems.filter(i => i.type === 'encounter').map(item => {
              const ghost = isGhostItem(item);
              return (
                <li key={item.id} className="space-y-1 rounded border border-rule/40 bg-parchment px-2 py-1.5 font-serif text-xs">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={ghost ? "flex items-center gap-1 italic text-ink-mute" : "font-semibold text-ink"}>
                      {ghost && <span className="py-0.2 inline-block scale-90 rounded bg-wine/10 px-1 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                      {item.snapshotName}
                    </span>
                    <button type="button" onClick={() => handleRemoveLink('encounter', item.id)} className="text-ink-mute transition-colors hover:text-crimson">
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="font-display text-[10px] uppercase text-brass-deep">XP:</span>
                    <input
                      type="number"
                      min={0}
                      value={item.snapshotXP || 0}
                      onChange={(e) => handleUpdateXP(item.id, parseInt(e.target.value || '0', 10))}
                      className="w-16 rounded border border-rule/60 bg-parchment-soft px-1 text-center text-[11px] text-ink focus:outline-none"
                    />
                  </div>
                </li>
              );
            })}
            {linkedItems.filter(i => i.type === 'encounter').length === 0 && (
              <li className="font-serif text-[11px] italic text-ink-mute">No encounters linked</li>
            )}
          </ul>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const name = parseMonsterName(val);
              const xp = parseMonsterXP(val);
              handleAddLink('encounter', val, name, { xp });
            }}
            className="w-full cursor-pointer rounded border border-rule/50 bg-parchment px-2 py-0.5 font-serif text-xs text-ink-soft transition-colors hover:border-brass focus:outline-none"
          >
            <option value="">+ Link Encounter</option>
            {monsters.filter(m => !linkedItems.some(i => i.type === 'encounter' && i.id === m)).map((m, idx) => (
              <option key={idx} value={m}>{parseMonsterName(m)}</option>
            ))}
          </select>
        </div>

        {/* Loot utilization */}
        <div className="space-y-2">
          <span className="block font-display text-[9px] uppercase tracking-wider text-ink-mute">Loot Awarded</span>
          <ul className="space-y-1">
            {linkedItems.filter(i => i.type === 'loot').map(item => {
              const ghost = isGhostItem(item);
              return (
                <li key={item.id} className="flex items-center justify-between gap-1.5 rounded border border-rule/40 bg-parchment px-2 py-1 font-serif text-xs" title={item.snapshotLoot}>
                  <span className={ghost ? "flex max-w-[80%] items-center gap-1 truncate italic text-ink-mute" : "max-w-[80%] truncate text-ink"}>
                    {ghost && <span className="py-0.2 inline-block flex-shrink-0 scale-90 rounded bg-wine/10 px-1 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    {item.snapshotName}
                  </span>
                  <button type="button" onClick={() => handleRemoveLink('loot', item.id)} className="flex-shrink-0 text-ink-mute transition-colors hover:text-crimson">
                    <X size={12} />
                  </button>
                </li>
              );
            })}
            {linkedItems.filter(i => i.type === 'loot').length === 0 && (
              <li className="font-serif text-[11px] italic text-ink-mute">No loot linked</li>
            )}
          </ul>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const itemObj = (items as RawItem[]).map((it, idx) => normalizeItem(it, idx)).find(it => it.id === val);
              if (itemObj) {
                handleAddLink('loot', val, itemObj.name, { loot: itemObj.description });
              } else {
                handleAddLink('loot', val, val, { loot: val });
              }
            }}
            className="w-full cursor-pointer rounded border border-rule/50 bg-parchment px-2 py-0.5 font-serif text-xs text-ink-soft transition-colors hover:border-brass focus:outline-none"
          >
            <option value="">+ Link Loot</option>
            {(items as RawItem[]).map((it, idx) => normalizeItem(it, idx))
              .filter(it => !linkedItems.some(i => i.type === 'loot' && i.id === it.id))
              .map(it => (
                <option key={it.id} value={it.id}>{it.name || 'Unnamed Item'}</option>
              ))
            }
            {treasure.filter(t => !linkedItems.some(i => i.type === 'loot' && i.id === t)).map((t, idx) => (
              <option key={`t-${idx}`} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
