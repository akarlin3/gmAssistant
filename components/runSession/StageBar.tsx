// Extracted verbatim from RunSessionView.tsx.
import { Gem, Map, NotebookPen, Pin, Skull, Users, X } from 'lucide-react';
import type { HomebrewMonster } from '../MonstersTab';
import type { PinKind, PinRef } from './types';

export function StageBar({
  pinned, scenes, npcs, locations, monsters, items, homebrewMonsters, sceneDescriptions, onUnpin, onOpenStatBlock,
}: {
  pinned: PinRef[];
  scenes: string[];
  npcs: any[];
  locations: any[];
  monsters: string[];
  items: string[];
  homebrewMonsters: HomebrewMonster[];
  sceneDescriptions: Record<string, string>;
  onUnpin: (kind: PinKind, key: string) => void;
  onOpenStatBlock: (slug: string) => void;
}) {
  if (pinned.length === 0) return null;

  const KIND_ICON: Record<PinKind, any> = {
    scene: NotebookPen,
    npc: Users,
    location: Map,
    monster: Skull,
    item: Gem,
  };

  const renderContent = (p: PinRef): React.ReactNode => {
    if (p.kind === 'scene') {
      const desc = sceneDescriptions[p.key] || '';
      return (
        <>
          <p className="font-serif text-sm text-ink">{p.key}</p>
          {desc && (
            <p className="mt-1 whitespace-pre-wrap font-serif text-[12px] italic text-ink-soft">{desc}</p>
          )}
        </>
      );
    }
    if (p.kind === 'npc') {
      const n = npcs.find((x: any) => (x.name || '') === p.key);
      if (!n) return <p className="font-serif text-sm italic text-ink-mute">{p.key} (removed)</p>;
      return (
        <>
          <p className="font-serif text-sm text-ink">{n.name || 'Unnamed NPC'}</p>
          <div className="mt-0.5 space-y-0.5 text-[11px] text-ink-soft">
            {n.faction && <div><span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Faction · </span>{n.faction}</div>}
            {n.goal && <div><span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Goal · </span>{n.goal}</div>}
            {n.mannerism && <div><span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Mannerism · </span>{n.mannerism}</div>}
          </div>
        </>
      );
    }
    if (p.kind === 'location') {
      const l = locations.find((x: any) => (x.name || '') === p.key);
      if (!l) return <p className="font-serif text-sm italic text-ink-mute">{p.key} (removed)</p>;
      return (
        <>
          <p className="font-serif text-sm text-ink">{l.name || 'Location'}</p>
          {l.type && <p className="font-display text-[9px] uppercase tracking-wider text-brass-deep">{l.type}</p>}
          {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
            <ul className="ml-3 mt-0.5 list-disc text-[11px] italic text-ink-soft">
              {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
            </ul>
          )}
        </>
      );
    }
    if (p.kind === 'monster') {
      const hb = homebrewMonsters.find(h => h.slug === p.key);
      const name = hb?.name || monsters.find(m => m === p.key) || p.key;
      return (
        <>
          <p className="font-serif text-sm text-ink">{name}</p>
          {hb && (
            <button
              onClick={() => onOpenStatBlock(hb.slug)}
              className="mt-1 font-display text-[10px] uppercase tracking-wider text-brass-deep underline decoration-dotted underline-offset-2 hover:text-crimson"
            >
              Open stat block
            </button>
          )}
        </>
      );
    }
    return <p className="font-serif text-sm text-ink">{p.key}</p>;
  };

  return (
    <div className="rounded border-2 border-brass-deep/50 bg-brass/5 p-2 shadow-card">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
          <Pin size={10} /> Stage · pinned for quick reference
        </span>
        <span className="font-serif text-[10px] italic text-ink-mute">{pinned.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pinned.map((p) => {
          const Icon = KIND_ICON[p.kind];
          return (
            <div key={`${p.kind}:${p.key}`} className="relative rounded border border-rule bg-parchment p-2 pr-7 shadow-sm">
              <div className="mb-0.5 flex items-center gap-1 font-display text-[9px] uppercase tracking-wider text-brass-deep">
                <Icon size={10} /> {p.kind}
              </div>
              {renderContent(p)}
              <button
                onClick={() => onUnpin(p.kind, p.key)}
                className="absolute right-1 top-1 rounded p-1 text-ink-mute hover:bg-crimson/10 hover:text-crimson"
                title="Unpin"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
