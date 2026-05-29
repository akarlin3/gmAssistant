'use client';

import { Plus, MessageSquare, Search, Archive, RotateCcw, Trash2 } from 'lucide-react';
import type { AssistantConversation } from '@/lib/assistant/types';

export function ConversationSidebar({
  conversations,
  activeId,
  query,
  showArchived,
  onQueryChange,
  onToggleArchived,
  onStart,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
}: {
  conversations: AssistantConversation[];
  activeId: string | null;
  query: string;
  showArchived: boolean;
  onQueryChange: (q: string) => void;
  onToggleArchived: () => void;
  onStart: () => void;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex w-64 flex-col rounded-lg border border-parchment-deep bg-parchment/40">
      <div className="flex items-center justify-between gap-2 border-b border-parchment-deep p-2">
        <button
          onClick={onStart}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-wine/10 px-2 py-1.5 font-display text-xs uppercase tracking-wider text-wine hover:bg-wine/20"
        >
          <Plus size={13} /> New Conversation
        </button>
      </div>
      <div className="flex items-center gap-1.5 border-b border-parchment-deep p-2">
        <Search size={13} className="text-ink-mute" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search conversations"
          className="w-full bg-transparent text-xs outline-none placeholder:text-ink-mute"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {conversations.length === 0 ? (
          <p className="p-2 text-xs italic text-ink-mute">
            {showArchived ? 'No archived conversations.' : 'No conversations yet.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <div
                  className={`group flex items-center gap-1 rounded-md px-2 py-1.5 ${
                    c.id === activeId ? 'bg-wine/15' : 'hover:bg-parchment-deep/60'
                  }`}
                >
                  <button
                    onClick={() => onSelect(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <MessageSquare size={12} className="shrink-0 text-ink-mute" />
                    <span className="truncate text-xs">{c.title}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    {c.status === 'active' ? (
                      <button
                        title="Archive"
                        onClick={() => onArchive(c.id)}
                        className="rounded p-0.5 text-ink-mute hover:text-brass-deep"
                      >
                        <Archive size={12} />
                      </button>
                    ) : (
                      <button
                        title="Restore"
                        onClick={() => onRestore(c.id)}
                        className="rounded p-0.5 text-ink-mute hover:text-brass-deep"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    <button
                      title="Delete"
                      onClick={() => onDelete(c.id)}
                      className="rounded p-0.5 text-ink-mute hover:text-crimson"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        onClick={onToggleArchived}
        className="border-t border-parchment-deep p-2 font-display text-[11px] uppercase tracking-wider text-ink-mute hover:text-ink"
      >
        {showArchived ? 'Show Active' : 'Show Archived'}
      </button>
    </aside>
  );
}
