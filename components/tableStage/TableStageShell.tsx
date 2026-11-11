'use client';

import React, { useEffect, useState } from 'react';
import {
  PanelLeftOpen,
  Dices,
  Send,
  Users,
  BookOpen,
  Swords,
  X,
} from 'lucide-react';
import { LeftReferenceDrawer } from './LeftReferenceDrawer';
import { VoiceDictationButton } from '@/components/ExternalTablePiP';
import {
  parseFormula,
  evalExpr,
  type Roll,
} from '@/components/diceRoller/parser';

export interface TableStageShellProps {
  centerStage: React.ReactNode;
  rightHudRail: React.ReactNode;
  rightHudTitle?: string;
  centerToolbar?: React.ReactNode;
  campaignData?: Record<string, any>;
  onUpdateCampaignKey?: (key: string, value: any) => void;
  onPostQuickNarration?: (text: string) => void;
  quickInputPlaceholder?: string;
  externalRollBanner?: React.ReactNode;
  defaultLeftDrawerOpen?: boolean;
}

const QUICK_FORMULAS = [
  { label: 'd20', formula: '1d20' },
  { label: 'Adv', formula: '2d20kh1' },
  { label: 'Dis', formula: '2d20kl1' },
  { label: 'd12', formula: '1d12' },
  { label: 'd10', formula: '1d10' },
  { label: 'd8', formula: '1d8' },
  { label: 'd6', formula: '1d6' },
  { label: 'd4', formula: '1d4' },
  { label: 'd100', formula: '1d100' },
] as const;

export function TableStageShell({
  centerStage,
  rightHudRail,
  rightHudTitle = 'Party & Character HUD',
  centerToolbar,
  campaignData,
  onUpdateCampaignKey,
  onPostQuickNarration,
  quickInputPlaceholder = 'Type @Entity narration or /roll 2d20kh1+7…',
  externalRollBanner,
  defaultLeftDrawerOpen = true,
}: TableStageShellProps) {
  const [leftOpen, setLeftOpen] = useState<boolean>(defaultLeftDrawerOpen);
  const [mobileSheet, setMobileSheet] = useState<'none' | 'hud' | 'reference' | 'dice'>('none');
  const [quickText, setQuickText] = useState('');
  const [rollLog, setRollLog] = useState<Roll[]>([]);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Toggle Left Collapsible Reference Drawer with `[` key (when not typing in an input)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setLeftOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const executeFormulaRoll = (rawFormula: string, label?: string) => {
    const clean = rawFormula.replace(/^\/r(?:oll)?\s+/i, '').trim();
    const parsed = parseFormula(clean);
    if (!parsed.ok) return false;
    const evaluated = evalExpr(parsed.expr, null);
    const nextRoll: Roll = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      label,
      formula: clean,
      parts: evaluated.parts,
      total: evaluated.total,
    };
    setRollLog((prev) => [nextRoll, ...prev.slice(0, 19)]);
    return true;
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickText.trim();
    if (!trimmed) return;

    if (/^\/r(?:oll)?\s+/i.test(trimmed) || /^\d+d\d+/i.test(trimmed)) {
      if (executeFormulaRoll(trimmed, 'Quick Roll')) {
        setQuickText('');
        return;
      }
    }

    if (onPostQuickNarration) {
      onPostQuickNarration(trimmed);
      setQuickText('');
    } else {
      executeFormulaRoll(trimmed, 'Formula');
      setQuickText('');
    }
  };

  const latestRoll = rollLog[0] ?? null;

  return (
    <div className="relative flex h-[calc(100vh-3rem)] w-full max-w-none flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] lg:grid lg:grid-cols-12">
      {/* LEFT COLLAPSIBLE REFERENCE DRAWER (Desktop: 3 cols when open) */}
      {leftOpen && (
        <aside
          aria-label="Left Reference Drawer"
          className="hidden h-full overflow-hidden border-r border-[var(--border-subtle)] lg:col-span-3 lg:block"
        >
          <LeftReferenceDrawer
            onCollapse={() => setLeftOpen(false)}
            campaignData={campaignData}
            onUpdateCampaignKey={onUpdateCampaignKey}
          />
        </aside>
      )}

      {/* CENTER TABLE STAGE (Desktop: 5 cols when left drawer open, 8 cols when collapsed) */}
      <section
        aria-label="Center Table Stage"
        className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${
          leftOpen ? 'lg:col-span-5' : 'lg:col-span-8'
        }`}
      >
        {/* Top Stage Bar (Collapsed Drawer Expand Button + Optional Stage Sub-Toolbar) */}
        {(!leftOpen || centerToolbar) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
            <div className="flex items-center gap-2">
              {!leftOpen && (
                <button
                  type="button"
                  onClick={() => setLeftOpen(true)}
                  aria-label="Open Left Reference Drawer ([)"
                  title="Open Reference Drawer ([)"
                  className="hidden items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 font-sans text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] lg:inline-flex"
                >
                  <PanelLeftOpen size={13} className="text-[var(--accent-primary)]" />
                  <span>Reference</span>
                  <kbd className="rounded border border-[var(--border-subtle)] px-1 font-mono text-[10px] text-[var(--text-muted)]">
                    [
                  </kbd>
                </button>
              )}
              {centerToolbar}
            </div>
          </div>
        )}

        {/* Independently Scrolling Center Stage Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {centerStage}
        </div>

        {/* Pinned Bottom Quick-Input / Dice & Roll Log Bar */}
        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-2 backdrop-blur">
          {externalRollBanner}
          {latestRoll && (
            <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs">
              <div className="flex items-center gap-2 truncate">
                <Dices size={13} className="shrink-0 text-[var(--accent-primary)]" />
                <span className="font-sans font-medium text-[var(--text-primary)]">
                  {latestRoll.label || 'Dice Roll'}
                </span>
                <code className="font-mono text-[11px] text-[var(--text-muted)]">
                  {latestRoll.formula}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="gm-roll-total font-mono text-base font-bold tabular-nums text-[var(--accent-primary)]">
                  {latestRoll.total}
                </span>
                <button
                  type="button"
                  onClick={() => setRollLog([])}
                  aria-label="Dismiss roll result"
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Quick 1-Tap Dice Pills */}
            <div className="hidden flex-wrap items-center gap-1 sm:flex">
              {QUICK_FORMULAS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => executeFormulaRoll(q.formula, q.label)}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 font-mono text-[11px] font-medium tabular-nums text-[var(--text-muted)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] active:scale-95"
                  title={`Roll ${q.formula}`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Inline Quick-Input / Formula Bar */}
            <form onSubmit={handleQuickSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                type="text"
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder={quickInputPlaceholder}
                className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <VoiceDictationButton
                compact
                entityNames={[
                  ...((Array.isArray(campaignData?.npcs) ? campaignData.npcs : []).map((n: any) => n?.name).filter(Boolean)),
                  ...((Array.isArray(campaignData?.locations) ? campaignData.locations : []).map((l: any) => l?.name).filter(Boolean)),
                  ...((Array.isArray(campaignData?.factions) ? campaignData.factions : []).map((f: any) => f?.name).filter(Boolean)),
                  ...((Array.isArray(campaignData?.pcs) ? campaignData.pcs : []).map((p: any) => p?.name).filter(Boolean)),
                ]}
                onTranscript={(spoken) =>
                  setQuickText((prev) => `${prev ? `${prev} ` : ''}${spoken}`)
                }
              />
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--accent-primary)] px-3 font-sans text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Send size={12} />
                <span className="hidden sm:inline">Roll / Post</span>
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* RIGHT PARTY / CHARACTER HUD RAIL (Desktop: 4 cols) */}
      <aside
        aria-label={rightHudTitle}
        className="hidden h-full overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3.5 lg:col-span-4 lg:block"
      >
        {rightHudRail}
      </aside>

      {/* MOBILE / ANDROID PWA THUMB-ZONE BOTTOM NAVIGATION BAR (<1024px) */}
      <nav
        aria-label="Mobile table stage navigation"
        className="flex shrink-0 items-center justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <button
          type="button"
          onClick={() => setMobileSheet('none')}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 font-sans text-[11px] font-medium ${
            mobileSheet === 'none'
              ? 'text-[var(--accent-primary)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          <Swords size={15} />
          <span>Table Stage</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSheet(mobileSheet === 'hud' ? 'none' : 'hud')}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 font-sans text-[11px] font-medium ${
            mobileSheet === 'hud'
              ? 'text-[var(--accent-primary)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          <Users size={15} />
          <span>Party / HUD</span>
        </button>
        <button
          type="button"
          onClick={() =>
            setMobileSheet(mobileSheet === 'reference' ? 'none' : 'reference')
          }
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 font-sans text-[11px] font-medium ${
            mobileSheet === 'reference'
              ? 'text-[var(--accent-primary)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          <BookOpen size={15} />
          <span>Reference</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSheet(mobileSheet === 'dice' ? 'none' : 'dice')}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 font-sans text-[11px] font-medium ${
            mobileSheet === 'dice'
              ? 'text-[var(--accent-primary)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          <Dices size={15} />
          <span>Dice Tray</span>
        </button>
      </nav>

      {/* SWIPEABLE MOBILE BOTTOM SHEET DRAWER (<1024px) */}
      {mobileSheet !== 'none' && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileSheet('none')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => setTouchStartY(e.touches[0]?.clientY ?? null)}
            onTouchEnd={(e) => {
              if (touchStartY !== null) {
                const deltaY = (e.changedTouches[0]?.clientY ?? touchStartY) - touchStartY;
                if (deltaY > 65) setMobileSheet('none');
              }
              setTouchStartY(null);
            }}
            className="flex max-h-[82vh] w-full flex-col rounded-t-2xl border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            {/* Swipe Handle & Sheet Header */}
            <div className="flex flex-col items-center border-b border-[var(--border-subtle)] px-4 pt-2 pb-2.5">
              <div className="mb-2 h-1.5 w-10 rounded-full bg-[var(--text-muted)]/40" />
              <div className="flex w-full items-center justify-between">
                <span className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {mobileSheet === 'hud'
                    ? rightHudTitle
                    : mobileSheet === 'reference'
                      ? 'Reference Drawer'
                      : 'Quick Dice & Roll History'}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSheet('none')}
                  aria-label="Close bottom sheet"
                  className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {mobileSheet === 'hud' && rightHudRail}
              {mobileSheet === 'reference' && (
                <LeftReferenceDrawer
                  campaignData={campaignData}
                  onUpdateCampaignKey={onUpdateCampaignKey}
                />
              )}
              {mobileSheet === 'dice' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {QUICK_FORMULAS.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => executeFormulaRoll(q.formula, q.label)}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2.5 font-mono text-xs font-semibold tabular-nums text-[var(--text-primary)] active:scale-95"
                      >
                        {q.label} ({q.formula})
                      </button>
                    ))}
                  </div>
                  {rollLog.length > 0 && (
                    <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
                      <div className="font-sans text-xs font-semibold text-[var(--text-muted)]">
                        Recent Rolls
                      </div>
                      {rollLog.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2"
                        >
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            {r.label ? `${r.label} · ` : ''}
                            {r.formula}
                          </span>
                          <span className="font-mono text-base font-bold tabular-nums text-[var(--accent-primary)]">
                            {r.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
