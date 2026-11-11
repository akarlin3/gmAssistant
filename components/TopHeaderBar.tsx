'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Search,
  Eye,
  MoreHorizontal,
  Download,
  Upload,
  FileSpreadsheet,
  Keyboard,
  Smartphone,
  Sparkles,
  Check,
  Pencil,
  FolderOpen,
  Archive,
  LogOut,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { ThemeToggleButton } from '@/lib/theme';
import { UnifiedSyncDot } from '@/components/SyncIndicator';
import { triggerPwaInstallPrompt } from '@/src/components/PwaInstaller';
import { useAuth } from '@/lib/firebase/auth-context';
import { resolveTerm, type TerminologyMap } from '@/lib/workspaceConfigCompiler';

export type GmPrimaryTab = 'prep' | 'world_roster' | 'run' | 'reference';
export type PlayerPrimaryTab = 'sheet' | 'quests' | 'world_journal' | 'gear' | 'play';
export type WorkspaceRole = 'gm' | 'player';
export type PrepScale = 'solo' | 'duet' | 'standard';

export const GM_PRIMARY_TABS: ReadonlyArray<{
  id: GmPrimaryTab;
  label: string;
  shortcut: string;
}> = [
  { id: 'prep', label: 'Prep', shortcut: '1' },
  { id: 'world_roster', label: 'World & Roster', shortcut: '2' },
  { id: 'run', label: 'Run', shortcut: '3' },
  { id: 'reference', label: 'Reference', shortcut: '4' },
];

export const PLAYER_PRIMARY_TABS: ReadonlyArray<{
  id: PlayerPrimaryTab;
  label: string;
  shortcut: string;
}> = [
  { id: 'sheet', label: 'Sheet', shortcut: '1' },
  { id: 'quests', label: 'Quests', shortcut: '2' },
  { id: 'world_journal', label: 'World & Journal', shortcut: '3' },
  { id: 'gear', label: 'Gear', shortcut: '4' },
  { id: 'play', label: 'Play', shortcut: '5' },
];

export interface TopHeaderBarProps {
  campaignName: string;
  onRenameCampaign?: (nextName: string) => void;
  role: WorkspaceRole;
  onRoleChange?: (nextRole: WorkspaceRole) => void;
  gmActiveTab?: GmPrimaryTab;
  onGmTabChange?: (tab: GmPrimaryTab) => void;
  playerActiveTab?: PlayerPrimaryTab;
  onPlayerTabChange?: (tab: PlayerPrimaryTab) => void;
  prepScale?: PrepScale;
  onPrepScaleChange?: (scale: PrepScale) => void;
  saveStatus?: 'saved' | 'saving' | 'error';
  idbHydrated?: boolean;
  onOpenCommandPalette?: () => void;
  onOpenWorkspaceArchitect?: () => void;
  terminologyMap?: TerminologyMap;
  onOpenShortcuts?: () => void;
  onOpenPreviewAsParty?: () => void;
  onSyncCapsule?: () => void;
  onExportCampaignJson?: () => void;
  onImportCampaignJson?: (file: File) => void;
  onExportPartyPdf?: () => void;
  onUploadCharacterSheet?: (file: File) => void;
  onOpenSessionZeroSetup?: () => void;
  onArchiveCampaign?: () => void;
  isLivePlayerShareView?: boolean;
  playerDisplayName?: string;
  onSwitchPlayerSlot?: () => void;
}

export function TopHeaderBar({
  campaignName,
  onRenameCampaign,
  role,
  onRoleChange,
  gmActiveTab = 'prep',
  onGmTabChange,
  playerActiveTab = 'sheet',
  onPlayerTabChange,
  prepScale = 'standard',
  onPrepScaleChange,
  saveStatus = 'saved',
  idbHydrated = true,
  onOpenCommandPalette,
  onOpenWorkspaceArchitect,
  terminologyMap,
  onOpenShortcuts,
  onOpenPreviewAsParty,
  onSyncCapsule,
  onExportCampaignJson,
  onImportCampaignJson,
  onExportPartyPdf,
  onUploadCharacterSheet,
  onOpenSessionZeroSetup,
  onArchiveCampaign,
  isLivePlayerShareView = false,
  playerDisplayName,
  onSwitchPlayerSlot,
}: TopHeaderBarProps) {
  const { user, logout: signOut } = useAuth();
  const [campaignMenuOpen, setCampaignMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(campaignName);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [installToast, setInstallToast] = useState<string | null>(null);

  const campaignMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(campaignName);
  }, [campaignName]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        campaignMenuRef.current &&
        !campaignMenuRef.current.contains(e.target as Node)
      ) {
        setCampaignMenuOpen(false);
      }
      if (
        overflowMenuRef.current &&
        !overflowMenuRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== campaignName) {
      onRenameCampaign?.(trimmed);
    } else {
      setTitleDraft(campaignName);
    }
  };

  const handleInstallAppClick = async () => {
    const accepted = await triggerPwaInstallPrompt();
    if (!accepted) {
      setInstallToast(
        'Use your browser menu ("Add to Home Screen" or "Install GM Assistant") to install as an app.',
      );
      setTimeout(() => setInstallToast(null), 4000);
    }
    setOverflowOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full max-w-none items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-4 backdrop-blur-md">
      {/* LEFT ZONE: Campaign Selector + Role Switcher Pill + Unified Sync Dot */}
      <div className="flex min-w-0 items-center gap-2">
        {/* Campaign Selector Dropdown */}
        <div ref={campaignMenuRef} className="relative flex items-center">
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(campaignName);
                  setEditingTitle(false);
                }
              }}
              className="h-7 w-44 rounded-md border border-[var(--accent-primary)] bg-[var(--bg-canvas)] px-2 font-display text-sm font-semibold text-[var(--text-primary)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCampaignMenuOpen((o) => !o)}
              className="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-display text-base font-semibold tracking-wide text-[var(--text-primary)] transition-colors hover:border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] sm:max-w-[240px]"
              title={campaignName}
            >
              <span className="truncate">{campaignName}</span>
              <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" />
            </button>
          )}

          {campaignMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1.5 shadow-2xl">
              <div className="px-2.5 py-1.5">
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Active Campaign
                </div>
                <div className="truncate font-display text-sm font-semibold text-[var(--text-primary)]">
                  {campaignName}
                </div>
                {playerDisplayName && (
                  <div className="mt-0.5 font-sans text-xs text-emerald-400">
                    Playing as {playerDisplayName}
                  </div>
                )}
              </div>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              {onRenameCampaign && (
                <button
                  type="button"
                  onClick={() => {
                    setCampaignMenuOpen(false);
                    setEditingTitle(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                >
                  <Pencil size={13} className="text-[var(--text-muted)]" />
                  <span>Rename Campaign</span>
                </button>
              )}
              {onSwitchPlayerSlot && (
                <button
                  type="button"
                  onClick={() => {
                    setCampaignMenuOpen(false);
                    onSwitchPlayerSlot();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                >
                  <RefreshCw size={13} className="text-[var(--text-muted)]" />
                  <span>Switch Player Slot</span>
                </button>
              )}
              <Link
                href="/campaign"
                onClick={() => setCampaignMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
              >
                <FolderOpen size={13} className="text-[var(--text-muted)]" />
                <span>All Campaigns Dashboard</span>
              </Link>
              <Link
                href="/player"
                onClick={() => setCampaignMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
              >
                <Sparkles size={13} className="text-emerald-400" />
                <span>Standalone Player Vault (/player)</span>
              </Link>
            </div>
          )}
        </div>

        {/* Role Switcher Pill (GM Workspace vs. Player Companion) */}
        {onRoleChange && !isLivePlayerShareView && (
          <div
            role="group"
            aria-label="Workspace role switcher"
            className="hidden items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/80 p-0.5 sm:inline-flex"
          >
            <button
              type="button"
              onClick={() => onRoleChange('gm')}
              className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium transition-all duration-200 ${
                role === 'gm'
                  ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              GM Workspace
            </button>
            <button
              type="button"
              onClick={() => onRoleChange('player')}
              className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium transition-all duration-200 ${
                role === 'player'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Player Companion
            </button>
          </div>
        )}

        {/* Single Unified Sync Status Indicator Dot */}
        <UnifiedSyncDot saveStatus={saveStatus} idbHydrated={idbHydrated} />
      </div>

      {/* CENTER ZONE: Primary Workspace Tabs with Smooth Spring-Animated Active Indicator */}
      <nav
        aria-label="Primary workspace navigation"
        className="hidden items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-1 md:flex"
      >
        {role === 'gm'
          ? GM_PRIMARY_TABS.map((tab) => {
              const active = gmActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onGmTabChange?.(tab.id)}
                  className={`relative rounded-md px-3 py-1 font-sans text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    active
                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })
          : PLAYER_PRIMARY_TABS.map((tab) => {
              const active = playerActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onPlayerTabChange?.(tab.id)}
                  className={`relative rounded-md px-3 py-1 font-sans text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    active
                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
      </nav>

      {/* RIGHT ZONE: Strictly 4 Clean Controls */}
      <div className="flex items-center gap-1.5">
        {/* 1. Search / Command (Cmd+K) pill button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Search or run command (Cmd+K)"
          title="Global Spotlight Search & Dice Roller (⌘K / Ctrl+K)"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/80 px-2.5 py-1 font-sans text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
        >
          <Search size={13} />
          <span className="hidden lg:inline">Search</span>
          <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.2 font-mono text-[10px] text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </button>

        {/* 2. Theme Toggle icon button (Moon Slate / Scroll Parchment) */}
        <ThemeToggleButton />

        {/* 3. Share / Preview as Party button (in GM mode) or Sync Capsule button (in /player mode) */}
        {role === 'gm' && !isLivePlayerShareView ? (
          <button
            type="button"
            onClick={onOpenPreviewAsParty}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 font-sans text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
            title="Preview live redacted /player projection side-by-side"
          >
            <Eye size={13} />
            <span className="hidden sm:inline">Preview as Party</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSyncCapsule}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 font-sans text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
            title="Sync Character Capsule or Share State"
          >
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Sync Capsule</span>
          </button>
        )}

        {/* 4. Single Overflow Menu (⋯) */}
        <div ref={overflowMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setOverflowOpen((o) => !o)}
            aria-label="More options"
            title="More options (Export/Import, Prep Scale, Shortcuts, Install App)"
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
          >
            <MoreHorizontal size={15} />
          </button>

          {overflowOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 shadow-2xl">
              {/* Mobile Role Switcher inside Overflow */}
              {onRoleChange && !isLivePlayerShareView && (
                <div className="mb-2 border-b border-[var(--border-subtle)] pb-2 sm:hidden">
                  <div className="mb-1 px-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Workspace Role
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onRoleChange('gm');
                        setOverflowOpen(false);
                      }}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        role === 'gm'
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                      }`}
                    >
                      GM Workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRoleChange('player');
                        setOverflowOpen(false);
                      }}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        role === 'player'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                      }`}
                    >
                      Player
                    </button>
                  </div>
                </div>
              )}

              {/* Prep Scale Selector (Solo | Duet | Standard) */}
              {onPrepScaleChange && (
                <div className="mb-2 border-b border-[var(--border-subtle)] pb-2">
                  <div className="mb-1 px-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Prep Scale Target
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['solo', 'duet', 'standard'] as const).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => onPrepScaleChange(sc)}
                        className={`flex items-center justify-center gap-1 rounded-md px-2 py-1 font-sans text-xs font-medium capitalize transition-colors ${
                          prepScale === sc
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {prepScale === sc && <Check size={11} />}
                        <span>{sc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* File & Sheet Actions */}
              <div className="space-y-0.5">
                {onUploadCharacterSheet && (
                  <button
                    type="button"
                    onClick={() => sheetInputRef.current?.click()}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <Upload size={13} className="text-[var(--accent-primary)]" />
                    <span>Upload Character Sheet (.pdf/.json)</span>
                  </button>
                )}

                {onExportPartyPdf && (
                  <button
                    type="button"
                    onClick={() => {
                      onExportPartyPdf();
                      setOverflowOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <FileSpreadsheet size={13} className="text-emerald-400" />
                    <span>Batch Party PDF Export</span>
                  </button>
                )}

                {onExportCampaignJson && (
                  <button
                    type="button"
                    onClick={() => {
                      onExportCampaignJson();
                      setOverflowOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <Download size={13} className="text-[var(--text-muted)]" />
                    <span>Export Campaign JSON</span>
                  </button>
                )}

                {onImportCampaignJson && (
                  <button
                    type="button"
                    onClick={() => jsonInputRef.current?.click()}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <Upload size={13} className="text-[var(--text-muted)]" />
                    <span>Import Campaign JSON</span>
                  </button>
                )}

                {onOpenWorkspaceArchitect && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenWorkspaceArchitect();
                      setOverflowOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <span className="flex items-center gap-2.5">
                      <SlidersHorizontal size={13} className="text-[var(--accent-primary)]" />
                      <span>Campaign &amp; Table Customizer</span>
                    </span>
                    <kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                      ⌘⇧K
                    </kbd>
                  </button>
                )}

                {onOpenSessionZeroSetup && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSessionZeroSetup();
                      setOverflowOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <Sparkles size={13} className="text-amber-400" />
                    <span>Session 0 &amp; Prep Target Counts</span>
                  </button>
                )}

                {onOpenShortcuts && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenShortcuts();
                      setOverflowOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                  >
                    <span className="flex items-center gap-2.5">
                      <Keyboard size={13} className="text-[var(--text-muted)]" />
                      <span>Keyboard Shortcuts</span>
                    </span>
                    <kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                      ?
                    </kbd>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleInstallAppClick}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-primary)] hover:bg-white/5"
                >
                  <Smartphone size={13} className="text-sky-400" />
                  <span>Install App (PWA)</span>
                </button>
              </div>

              {(onArchiveCampaign || user) && (
                <div className="mt-2 border-t border-[var(--border-subtle)] pt-1.5">
                  {onArchiveCampaign && (
                    <button
                      type="button"
                      onClick={() => {
                        onArchiveCampaign();
                        setOverflowOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-rose-400 hover:bg-rose-500/10"
                    >
                      <Archive size={13} />
                      <span>Archive Campaign</span>
                    </button>
                  )}
                  {user && (
                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                        setOverflowOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-xs text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                    >
                      <LogOut size={13} />
                      <span className="truncate">Sign Out ({user.email})</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Hidden File Inputs for JSON Import & Character Sheet Upload */}
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onImportCampaignJson) {
                onImportCampaignJson(file);
              }
              e.target.value = '';
              setOverflowOpen(false);
            }}
          />
          <input
            ref={sheetInputRef}
            type="file"
            accept=".pdf,.json,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onUploadCharacterSheet) {
                onUploadCharacterSheet(file);
              }
              e.target.value = '';
              setOverflowOpen(false);
            }}
          />
        </div>
      </div>

      {installToast && (
        <div className="gm-toast fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 font-sans text-xs text-[var(--text-primary)] shadow-xl">
          {installToast}
        </div>
      )}
    </header>
  );
}

/**
 * Reusable inline Prep Scale Pill (Solo | Duet | Standard) for the Prep Workspace Header
 */
export function PrepScaleInlinePill({
  scale,
  onChange,
}: {
  scale: PrepScale;
  onChange: (next: PrepScale) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Campaign prep scale"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/80 p-0.5"
    >
      <span className="px-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Scale:
      </span>
      {(['solo', 'duet', 'standard'] as const).map((sc) => (
        <button
          key={sc}
          type="button"
          onClick={() => onChange(sc)}
          className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium capitalize transition-all ${
            scale === sc
              ? 'bg-[var(--accent-primary)] text-white shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {sc}
        </button>
      ))}
    </div>
  );
}
