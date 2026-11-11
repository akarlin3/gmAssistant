'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  applyGeminiBridgePayload,
  buildGeminiBridgePrompt,
  buildGeminiDiffPreview,
  GEMINI_BRIDGE_PRESETS,
  GEMINI_WEB_APP_URL,
  parseAndValidateGeminiBridgeJson,
  type GeminiBridgePresetId,
  type GeminiBridgeSelectionKey,
} from '@/lib/geminiCampaignBridge';
import type { PlayerTrackerState } from '@/lib/playerMode/playerTrackerStorage';
import { restoreVaultSnapshot } from '@/lib/snapshotVault';

export interface GeminiBridgeModalProps {
  open: boolean;
  onClose: () => void;
  campaignId?: string;
  campaignName?: string;
  campaignData?: Record<string, any>;
  prepScale?: string;
  /** Role of the user: 'gm' or 'player'. Controls available presets & publish toggle. */
  role?: 'gm' | 'player';
  playerTracker?: PlayerTrackerState | null;
  playerVisibleEntities?: Record<string, Array<Record<string, unknown>>>;
  playerState?: {
    pcName?: string;
    quests?: Array<{ id?: string; title: string; status?: string; notes?: string }>;
    journal?: Array<{ id?: string; sessionNumber?: number; date?: string; title?: string; content?: string }>;
    revealedEntities?: Array<{ id?: string; name: string; type?: string; category?: string }>;
  };
  /** Called when the validated Gemini JSON is applied to campaign data. */
  onApplyCampaignData?: (nextData: Record<string, any>) => void;
  /** Called when a player applies journal/quest summaries to their local tracker. */
  onApplyPlayerTracker?: (nextTracker: PlayerTrackerState) => void;
}

export function GeminiBridgeModal({
  open,
  onClose,
  campaignId = 'local_campaign',
  campaignName = 'Campaign',
  campaignData = {},
  prepScale,
  role = 'gm',
  playerTracker,
  playerVisibleEntities,
  playerState,
  onApplyCampaignData,
  onApplyPlayerTracker,
}: GeminiBridgeModalProps) {
  const defaultPreset: GeminiBridgePresetId =
    role === 'player' ? 'player_journal_summary' : 'session_recap';

  const [preset, setPreset] = useState<GeminiBridgePresetId>(defaultPreset);
  const [customGuidance, setCustomGuidance] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [publishRecapToPartyFeed, setPublishRecapToPartyFeed] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Partial<Record<GeminiBridgeSelectionKey, boolean>>>({});
  const [lastUndoSnapshotId, setLastUndoSnapshotId] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);

  useEffect(() => {
    setPreset(role === 'player' ? 'player_journal_summary' : 'session_recap');
  }, [role]);

  const generatedPrompt = useMemo(
    () =>
      buildGeminiBridgePrompt({
        preset,
        campaignName,
        campaignData,
        prepScale,
        playerTracker,
        playerVisibleEntities,
        playerState,
        customGuidance,
      }),
    [preset, campaignName, campaignData, prepScale, playerTracker, playerVisibleEntities, playerState, customGuidance],
  );

  const validation = useMemo(() => {
    if (!rawJsonInput.trim()) return null;
    return parseAndValidateGeminiBridgeJson(rawJsonInput);
  }, [rawJsonInput]);

  const diffPreview = useMemo(() => {
    if (!validation || !validation.ok) return null;
    return buildGeminiDiffPreview(campaignData, validation.payload);
  }, [campaignData, validation]);

  useEffect(() => {
    if (!diffPreview) {
      setSelectedKeys({});
      return;
    }
    const initial: Partial<Record<GeminiBridgeSelectionKey, boolean>> = {};
    for (const item of diffPreview.selectableItems) {
      initial[item.key] = true;
    }
    setSelectedKeys(initial);
  }, [diffPreview]);

  if (!open) return null;

  const handleCopyPrompt = async (openGeminiTab: boolean) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedPrompt);
      }
      setCopyStatus(openGeminiTab ? 'Copied! Opening Gemini…' : 'Prompt copied to clipboard!');
      window.setTimeout(() => setCopyStatus(null), 3000);

      if (openGeminiTab && typeof window !== 'undefined') {
        const isMobile =
          typeof navigator !== 'undefined' &&
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') &&
          typeof navigator.share === 'function';
        if (isMobile) {
          try {
            await navigator.share({
              title: `${campaignName} — Gemini Studio Prompt`,
              text: generatedPrompt,
              url: GEMINI_WEB_APP_URL,
            });
            return;
          } catch {
            // Fall back to opening Gemini web app
          }
        }
        window.open(GEMINI_WEB_APP_URL, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setCopyStatus('Clipboard unavailable — select & copy manually below.');
    }
  };

  const handlePasteFromClipboardAndApply = async (useSelection = false) => {
    let textToParse = rawJsonInput;
    if (!textToParse.trim() && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip.trim()) {
          textToParse = clip;
          setRawJsonInput(clip);
        }
      } catch {
        setApplyFeedback('Paste the Gemini JSON response into the box below first.');
        return;
      }
    }

    const parsed = parseAndValidateGeminiBridgeJson(textToParse);
    if (!parsed.ok) {
      setApplyFeedback(`Validation Error: ${parsed.error}`);
      return;
    }

    const activeSelection = useSelection ? selectedKeys : undefined;
    if (useSelection) {
      const anyChecked = parsed.diff.selectableItems.some((item) => selectedKeys[item.key] !== false);
      if (!anyChecked) {
        setApplyFeedback('Select at least one checkbox in the Diff Preview to apply.');
        return;
      }
    }

    const result = applyGeminiBridgePayload({
      campaignId,
      campaignName,
      currentData: campaignData,
      payload: parsed.payload,
      selection: activeSelection,
      publishRecapToPartyFeed: role === 'gm' && publishRecapToPartyFeed,
      currentTracker: playerTracker,
    });

    if (onApplyCampaignData) {
      onApplyCampaignData(result.nextData);
    }
    if (result.nextTracker && onApplyPlayerTracker) {
      onApplyPlayerTracker(result.nextTracker);
    }

    const appliedLabels = parsed.diff.selectableItems
      .filter((item) => (activeSelection ? activeSelection[item.key] !== false : true))
      .map((item) => item.label);

    setLastUndoSnapshotId(result.undoSnapshot.id);
    setApplyFeedback(
      `Applied ${appliedLabels.join(', ')}! Pre-import snapshot saved to Vault.`,
    );
  };

  const handleUndoLastApply = () => {
    if (!lastUndoSnapshotId || !onApplyCampaignData) return;
    const restored = restoreVaultSnapshot(campaignId, lastUndoSnapshotId);
    if (restored) {
      onApplyCampaignData(restored.data);
      setLastUndoSnapshotId(null);
      setApplyFeedback('Reverted to pre-import campaign snapshot.');
    }
  };

  const availablePresets = GEMINI_BRIDGE_PRESETS.filter((p) =>
    role === 'player' ? p.playerSafe : true,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Gemini Studio & Recap Bridge"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-[var(--bg-elevated)] p-5 text-[var(--text-primary)] shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-300 border border-amber-500/40">
                ZERO-KEY AI BRIDGE
              </span>
              <span className="text-xs text-[var(--text-muted)]">Hotkey: Cmd/Ctrl + G</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
              ✨ Gemini Studio &amp; Recap Bridge
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Zero API keys required. Step 1 builds a context-aware schema prompt for Gemini; Step 2 validates, renders an interactive Diff Preview, snapshots, and merges cleanly into Yjs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:opacity-80"
          >
            ✕ Close
          </button>
        </div>

        {/* STEP 1 */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-300">
              Step 1 — Context-Aware Schema Prompt Generator
            </h3>
            {copyStatus && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{copyStatus}</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {availablePresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  preset === p.id
                    ? 'border-amber-500/60 bg-amber-500/15 text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-amber-500/40'
                }`}
              >
                <div className="text-xs font-bold">{p.label}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">{p.description}</div>
              </button>
            ))}
          </div>

          <div>
            <input
              type="text"
              value={customGuidance}
              onChange={(e) => setCustomGuidance(e.target.value)}
              placeholder="Optional direction (e.g. 'Focus on the betrayal at the docks', 'Create 3 spooky swamp monsters')…"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            />
          </div>

          <textarea
            readOnly
            value={generatedPrompt}
            rows={6}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)]"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyPrompt(false)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-amber-500/50"
            >
              📋 Copy Prompt
            </button>
            <button
              type="button"
              onClick={() => void handleCopyPrompt(true)}
              className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-200 hover:bg-amber-500/30"
            >
              🚀 Copy Prompt &amp; Open Gemini ↗
            </button>
          </div>
        </div>

        {/* STEP 2 */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-sky-600 dark:text-sky-300">
              Step 2 — Validated Paste, Diff Preview &amp; Undoable Apply
            </h3>
            {role === 'gm' && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishRecapToPartyFeed}
                  onChange={(e) => setPublishRecapToPartyFeed(e.target.checked)}
                />
                <span>📢 Publish Recap to Party Feed</span>
              </label>
            )}
          </div>

          <textarea
            value={rawJsonInput}
            onChange={(e) => setRawJsonInput(e.target.value)}
            rows={5}
            placeholder="Paste Gemini's response here (markdown ```json fences are stripped automatically)…"
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 font-mono text-xs text-[var(--text-primary)]"
          />

          {/* Live Validation & Interactive Checkbox Diff Preview */}
          {validation && !validation.ok && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-600 dark:text-rose-200">
              ⚠️ {validation.error}
            </div>
          )}

          {validation?.ok && diffPreview && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                  ✅ Validated Gemini Schema — Interactive Diff Preview:
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Uncheck any section to skip merging it
                </span>
              </div>
              <div className="space-y-1.5">
                {diffPreview.selectableItems.map((item) => {
                  const checked = selectedKeys[item.key] !== false;
                  return (
                    <label
                      key={item.key}
                      className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 cursor-pointer hover:border-emerald-500/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedKeys((prev) => ({
                            ...prev,
                            [item.key]: e.target.checked,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[var(--text-primary)]">{item.label}</div>
                        {item.detail && (
                          <div className="truncate text-[11px] text-[var(--text-muted)]">
                            {item.detail}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              {diffPreview.hasRecap && selectedKeys.recap !== false && (
                <div className="mt-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)]">
                  <strong className="text-amber-600 dark:text-amber-300">{diffPreview.recapTitle}:</strong>{' '}
                  {diffPreview.recapText.slice(0, 220)}
                  {diffPreview.recapText.length > 220 ? '…' : ''}
                </div>
              )}
            </div>
          )}

          {applyFeedback && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs text-sky-600 dark:text-sky-200">
              <span>{applyFeedback}</span>
              {lastUndoSnapshotId && (
                <button
                  type="button"
                  onClick={handleUndoLastApply}
                  className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
                >
                  ↩ Undo Apply
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePasteFromClipboardAndApply(false)}
              className="rounded-lg bg-emerald-500/25 border border-emerald-500/50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/35"
            >
              📥 Paste from Clipboard &amp; Apply
            </button>
            {rawJsonInput.trim() && validation?.ok && (
              <button
                type="button"
                onClick={() => void handlePasteFromClipboardAndApply(true)}
                className="rounded-lg bg-sky-500/25 border border-sky-500/50 px-3.5 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-200 hover:bg-sky-500/35"
              >
                ✓ Apply Checked Diff Items
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default GeminiBridgeModal;
