export type ShortcutContext = 'global' | 'editor' | 'palette';

export type Shortcut = {
  keys: string;
  description: string;
  context: ShortcutContext;
};

export const SHORTCUTS: Shortcut[] = [
  { keys: '?',     description: 'Show this cheatsheet',         context: 'global' },
  { keys: 'Esc',   description: 'Close any open modal or pill', context: 'global' },
  { keys: '⌘/Ctrl + K', description: 'Open command palette / search', context: 'global' },
  { keys: '←/→',   description: 'Previous / next tab',          context: 'editor' },
  { keys: '↑/↓',   description: 'Move selection up / down',     context: 'palette' },
  { keys: '↵',     description: 'Open selected item',           context: 'palette' },
];

export const CONTEXT_LABEL: Record<ShortcutContext, string> = {
  global: 'Global',
  editor: 'Editor',
  palette: 'Command palette',
};
