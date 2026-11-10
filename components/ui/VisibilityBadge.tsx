'use client';

import React, { useState } from 'react';

export interface EntityVisibility {
  scope?: 'private' | 'party' | 'slots';
  mode?: 'private' | 'party' | 'custom';
  slotIds?: string[];
  allowedSlotIds?: string[];
}

export interface PlayerSlot {
  id?: string;
  slotId?: string;
  characterName?: string;
  displayName?: string;
  playerName?: string;
}

export function getGmVisibilityMode(
  visibility?: EntityVisibility,
  legacyRevealed?: boolean,
): 'private' | 'party' | 'custom' {
  if (!visibility) {
    return legacyRevealed ? 'party' : 'private';
  }
  if (visibility.scope === 'party' || visibility.mode === 'party') return 'party';
  const ids = visibility.slotIds ?? visibility.allowedSlotIds ?? [];
  if ((visibility.scope === 'slots' || visibility.mode === 'custom') && ids.length > 0) {
    return 'custom';
  }
  return 'private';
}

export function getEntityCardAccentClass(
  visibility?: EntityVisibility,
  legacyRevealed?: boolean,
): string {
  const mode = getGmVisibilityMode(visibility, legacyRevealed);
  if (mode === 'party') {
    return 'border-l-2 border-l-emerald-500/80';
  }
  if (mode === 'custom') {
    return 'border-l-2 border-l-amber-500/80';
  }
  return '';
}

export interface GmVisibilityPillProps {
  visibility?: EntityVisibility;
  legacyRevealed?: boolean;
  playerSlots?: PlayerSlot[];
  onChange?: (next: EntityVisibility, legacyRevealed: boolean) => void;
  onSimpleToggle?: () => void;
  compact?: boolean;
  className?: string;
}

/**
 * GM -> Player Visibility Pill:
 * - 🔒 Private (muted slate dashed border — GM eyes only)
 * - 👁️ Party (emerald pill + subtle emerald left card accent — live in /player)
 * - 🎯 Custom (amber pill listing specific player slots)
 */
export function GmVisibilityPill({
  visibility,
  legacyRevealed,
  playerSlots = [],
  onChange,
  onSimpleToggle,
  compact = false,
  className = '',
}: GmVisibilityPillProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mode = getGmVisibilityMode(visibility, legacyRevealed);
  const slotIds: string[] = visibility?.slotIds ?? visibility?.allowedSlotIds ?? [];

  const slotLabel = (() => {
    if (mode !== 'custom') return '';
    if (playerSlots.length > 0) {
      const names = slotIds
        .map((id: string) => {
          const found = playerSlots.find((s) => (s.id || s.slotId) === id);
          return found?.characterName || found?.displayName || id;
        })
        .filter(Boolean);
      if (names.length > 0 && names.length <= 2) return names.join(', ');
    }
    return `${slotIds.length} slot${slotIds.length === 1 ? '' : 's'}`;
  })();

  const handlePrimaryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange && playerSlots.length > 0) {
      setMenuOpen((prev) => !prev);
      return;
    }
    if (onChange) {
      const nextScope = mode === 'party' ? 'private' : 'party';
      onChange({ scope: nextScope, mode: nextScope }, nextScope === 'party');
      return;
    }
    if (onSimpleToggle) {
      onSimpleToggle();
    }
  };

  const toggleQuick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) {
      const nextScope = mode === 'party' ? 'private' : 'party';
      onChange({ scope: nextScope, mode: nextScope }, nextScope === 'party');
      setMenuOpen(false);
    } else if (onSimpleToggle) {
      onSimpleToggle();
    }
  };

  const selectScope = (scope: 'private' | 'party') => {
    if (!onChange) return;
    onChange({ scope, mode: scope }, scope === 'party');
    setMenuOpen(false);
  };

  const toggleSlot = (slotId: string) => {
    if (!onChange) return;
    const exists = slotIds.includes(slotId);
    const nextIds = exists
      ? slotIds.filter((id: string) => id !== slotId)
      : [...slotIds, slotId];
    if (nextIds.length === 0) {
      onChange({ scope: 'private', mode: 'private' }, false);
    } else {
      onChange({ scope: 'slots', mode: 'custom', slotIds: nextIds, allowedSlotIds: nextIds }, false);
    }
  };

  const badgeStyles =
    mode === 'party'
      ? 'border border-emerald-500/45 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.12)]'
      : mode === 'custom'
        ? 'border border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : 'border border-dashed border-slate-500/40 bg-slate-500/5 text-[var(--text-muted)] hover:border-slate-400/60 hover:text-[var(--text-primary)]';

  const interactive = Boolean(onChange || onSimpleToggle);

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        disabled={!interactive}
        onClick={
          playerSlots.length > 0 && onChange ? handlePrimaryClick : toggleQuick
        }
        title={
          mode === 'party'
            ? 'Visible to all players in /player — click to change'
            : mode === 'custom'
              ? `Visible to selected slots (${slotLabel}) — click to change`
              : 'GM Private — hidden from players. Click to share with party.'
        }
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium transition-all ${badgeStyles} ${
          interactive ? 'cursor-pointer active:scale-95' : 'cursor-default'
        }`}
      >
        {mode === 'party' && (
          <>
            <span aria-hidden="true">👁️</span>
            <span>{compact ? 'Party' : 'Party'}</span>
          </>
        )}
        {mode === 'custom' && (
          <>
            <span aria-hidden="true">🎯</span>
            <span>{compact ? 'Custom' : `Custom (${slotLabel})`}</span>
          </>
        )}
        {mode === 'private' && (
          <>
            <span aria-hidden="true">🔒</span>
            <span>Private</span>
          </>
        )}
      </button>

      {menuOpen && onChange && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 shadow-xl"
        >
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            GM → Player Visibility
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => selectScope('private')}
              className={`flex items-center justify-between rounded px-2 py-1 text-left text-xs ${
                mode === 'private'
                  ? 'bg-slate-500/20 font-semibold text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-white/5'
              }`}
            >
              <span>🔒 Private (GM Only)</span>
              {mode === 'private' && <span>✓</span>}
            </button>
            <button
              type="button"
              onClick={() => selectScope('party')}
              className={`flex items-center justify-between rounded px-2 py-1 text-left text-xs ${
                mode === 'party'
                  ? 'bg-emerald-500/20 font-semibold text-emerald-500'
                  : 'text-[var(--text-muted)] hover:bg-white/5'
              }`}
            >
              <span>👁️ Party (Live in /player)</span>
              {mode === 'party' && <span>✓</span>}
            </button>
          </div>
          {playerSlots.length > 0 && (
            <div className="mt-2 border-t border-[var(--border-subtle)] pt-1.5">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                🎯 Custom Player Slots
              </div>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {playerSlots.map((slot) => {
                  const sid = slot.id || slot.slotId || '';
                  if (!sid) return null;
                  const checked = slotIds.includes(sid);
                  return (
                    <label
                      key={sid}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSlot(sid)}
                        className="accent-amber-500"
                      />
                      <span className="truncate">
                        {slot.characterName || slot.displayName || slot.playerName || sid}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface PlayerPrivacyPillProps {
  sharedWithGm: boolean;
  onToggle?: (nextShared: boolean) => void;
  compact?: boolean;
  className?: string;
}

/**
 * Player -> GM Privacy Pill (/player & Player Notes):
 * - 🔒 Private (Local Only) (violet/slate lock pill — never leaves device)
 * - 👁️ Shared with GM (emerald/cyan eye pill — synced via pcWritebacks)
 */
export function PlayerPrivacyPill({
  sharedWithGm,
  onToggle,
  compact = false,
  className = '',
}: PlayerPrivacyPillProps) {
  const styles = sharedWithGm
    ? 'border border-emerald-500/45 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
    : 'border border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300';

  return (
    <button
      type="button"
      disabled={!onToggle}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.(!sharedWithGm);
      }}
      title={
        sharedWithGm
          ? 'Shared with GM via pcWritebacks — click to make Private (Local Only)'
          : 'Private (Local Only) — never leaves your device. Click to share with GM.'
      }
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium transition-all ${styles} ${
        onToggle ? 'cursor-pointer active:scale-95' : 'cursor-default'
      } ${className}`}
    >
      {sharedWithGm ? (
        <>
          <span aria-hidden="true">👁️</span>
          <span>{compact ? 'Shared' : 'Shared with GM'}</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">🔒</span>
          <span>{compact ? 'Private' : 'Private (Local Only)'}</span>
        </>
      )}
    </button>
  );
}
