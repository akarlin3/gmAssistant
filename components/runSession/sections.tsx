// Presentational shell + row components extracted from RunSessionView.tsx.
// Markup and props are identical to the originals.
import { ChevronDown, ChevronRight, Eye, EyeOff, Pin, PinOff } from 'lucide-react';
import { useState } from 'react';

export function SectionShell({
  title, icon: Icon, open, onToggle, count, children, id
}: {
  title: string; icon: any; open: boolean; onToggle: () => void; count?: number; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded border border-rule bg-parchment-soft shadow-card">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30">
        <Icon size={14} className="flex-shrink-0 text-brass-deep" />
        <span className="flex-1 font-display text-sm tracking-wide text-ink">{title}</span>
        {typeof count === 'number' && <span className="font-serif text-[11px] text-ink-mute">{count}</span>}
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="border-t border-rule px-3 pb-3 pt-1">{children}</div>}
    </section>
  );
}

export function PanelShell({
  title, icon: Icon, open, onToggle, children,
}: {
  title: string; icon: any; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30">
        <Icon size={14} className="flex-shrink-0 text-crimson" />
        <span className="flex-1 font-display text-sm tracking-wide text-ink">{title}</span>
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="border-t border-rule px-3 pb-3 pt-1">{children}</div>}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-xs italic text-ink-mute">{children}</p>;
}

export function PinToggle({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  const Icon = pinned ? PinOff : Pin;
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 rounded p-1 transition-colors ${pinned ? 'text-crimson hover:bg-crimson/10' : 'text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
      title={pinned ? 'Unpin from Stage' : 'Pin to Stage'}
    >
      <Icon size={12} />
    </button>
  );
}

export function NPCRow({
  npc, pinned, onTogglePin, shared, onToggleShare,
}: {
  npc: any;
  pinned: boolean;
  onTogglePin: () => void;
  shared: boolean;
  onToggleShare: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded border border-rule bg-parchment font-serif text-sm">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(o => !o)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-parchment-deep/30">
          {open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />}
          <span className="flex-1 truncate text-ink">{npc.name || 'Unnamed NPC'}</span>
          {npc.type && <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">{npc.type}</span>}
        </button>
        <button
          onClick={onToggleShare}
          className={`p-1 transition-colors ${shared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:bg-brass/10 hover:text-brass-deep'}`}
          title={shared ? 'Shared with Players (Click to hide)' : 'Share with Players'}
        >
          {shared ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <div className="pr-2"><PinToggle pinned={pinned} onClick={onTogglePin} /></div>
      </div>
      {open && (
        <div className="space-y-0.5 border-t border-rule px-3 pb-2 pt-1 text-[12px] text-ink-soft">
          {npc.faction && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Faction · </span>{npc.faction}</div>}
          {npc.archetype && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Archetype · </span>{npc.archetype}</div>}
          {npc.goal && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Goal · </span>{npc.goal}</div>}
          {npc.method && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Method · </span>{npc.method}</div>}
          {npc.mannerism && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Mannerism · </span>{npc.mannerism}</div>}
          {npc.appearance && <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Appearance · </span>{npc.appearance}</div>}
        </div>
      )}
    </li>
  );
}
