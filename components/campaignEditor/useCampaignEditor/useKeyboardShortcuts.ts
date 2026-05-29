'use client';

import { useEffect } from 'react';
import { ALL_SUBVIEWS } from '@/lib/modes';
import type { Mode } from '@/lib/modes';
import { popSnapshot, type Snapshot } from '@/lib/undoStack';

export function useKeyboardShortcuts(
  paletteOpen: boolean,
  shortcutsOpen: boolean,
  syncState: string,
  syncError: string,
  mode: Mode,
  subview: string,
  confirmUnsavedNav: () => boolean,
  showUndoToast: (msg: string, ms?: number) => void,
  undoStackRef: React.MutableRefObject<Snapshot[]>,
  skipNextSnapshotRef: React.MutableRefObject<boolean>,
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  setName: React.Dispatch<React.SetStateAction<string>>,
  setCanUndo: React.Dispatch<React.SetStateAction<boolean>>,
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setMode: React.Dispatch<React.SetStateAction<Mode>>,
  setSubview: React.Dispatch<React.SetStateAction<string>>,
) {
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(p => !p); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTyping(e.target)) return;
        const { snap, next } = popSnapshot(undoStackRef.current);
        if (snap) {
          skipNextSnapshotRef.current = true;
          setState(snap.state); setDone(snap.done); setName(snap.name);
          undoStackRef.current = next; setCanUndo(next.length > 0);
          showUndoToast(snap.description || 'Undid last change');
        }
        e.preventDefault(); return;
      }
      if (isTyping(e.target)) return;
      if (paletteOpen || shortcutsOpen) return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setShortcutsOpen(true); return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!confirmUnsavedNav()) return;
        e.preventDefault();
        const idx = ALL_SUBVIEWS.findIndex(p => p.mode === mode && p.subview === subview);
        if (idx < 0) return;
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = ALL_SUBVIEWS[(idx + step + ALL_SUBVIEWS.length) % ALL_SUBVIEWS.length];
        setMode(next.mode); setSubview(next.subview);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen, shortcutsOpen, syncState, syncError, mode, subview, confirmUnsavedNav, showUndoToast,
    undoStackRef, skipNextSnapshotRef, setState, setDone, setName, setCanUndo, setPaletteOpen, setShortcutsOpen, setMode, setSubview]);
}
