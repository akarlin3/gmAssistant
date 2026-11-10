export type ShortcutContext = 'global' | 'editor' | 'palette';

export type Shortcut = {
  keys: string;
  description: string;
  context: ShortcutContext;
};

export const SHORTCUTS: Shortcut[] = [
  { keys: '?',          description: 'Show this hotkey cheatsheet',                            context: 'global' },
  { keys: '⌘/Ctrl + K', description: 'Open Spotlight search & inline /roll dice bar',          context: 'global' },
  { keys: '[',          description: 'Toggle Left Reference Drawer (Spells, Oracle, Library)', context: 'global' },
  { keys: 'Esc',        description: 'Close any open modal, Peek inspector, or drawer',        context: 'global' },
  { keys: '←/→',        description: 'Previous / next workspace tab',                          context: 'editor' },
  { keys: '⌘/Ctrl + Z', description: 'Undo last campaign change',                              context: 'editor' },
  { keys: '↑/↓',        description: 'Move selection up / down',                               context: 'palette' },
  { keys: '↵',          description: 'Execute selected action or reroll /roll formula',        context: 'palette' },
];

export const CONTEXT_LABEL: Record<ShortcutContext, string> = {
  global: 'Global & Table Stage',
  editor: 'Workspace Editor',
  palette: 'Spotlight Command Palette',
};

