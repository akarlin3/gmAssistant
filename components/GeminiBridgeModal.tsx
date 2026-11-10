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
} from '@/lib/geminiCampaignBridge';
import type { PlayerTrackerState } from '@/lib/playerMode/playerTrackerStorage';
import { restoreVaultSnapshot } from '@/lib/snapshotVault';

export interface GeminiBridgeModalProps {
  open: boolean;
  onClose: () => void;
  campaignId?: string;
  campaignName?: string;
  campaignData?: Record<string, any>;
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
        playerTracker,
        playerVisibleEntities,
        playerState,
        customGuidance,
      }),
    [preset, campaignName, campaignData, playerTracker, playerVisibleEntities, playerState, customGuidance],
  );

  const validation = useMemo(() => {
    if (!rawJsonInput.trim()) return null;
    return parseAndValidateGeminiBridgeJson(rawJsonInput);
  }, [rawJsonInput]);

  const diffPreview = useMemo(() => {
    if (!validation || !validation.ok) return null;
    return buildGeminiDiffPreview(campaignData, validation.payload);
  }, [campaignData, validation]);

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

  const handlePasteFromClipboardAndApply = async () => {
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

    const result = applyGeminiBridgePayload({
      campaignId,
      campaignName,
      currentData: campaignData,
      payload: parsed.payload,
      publishRecapToPartyFeed: role === 'gm' && publishRecapToPartyFeed,
      currentTracker: playerTracker,
    });

    if (onApplyCampaignData) {
      onApplyCampaignData(result.nextData);
    }
    if (result.nextTracker && onApplyPlayerTracker) {
      onApplyPlayerTracker(result.nextTracker);
    }

    setLastUndoSnapshotId(result.undoSnapshot.id);
    setApplyFeedback(
      `Applied ${result.diff.summary.join(', ')}! Pre-import snapshot saved to Vault.`,
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
      aria-label="Gemini Studio / Recap Bridge"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-5 text-slate-100 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/40">
                ZERO-KEY AI BRIDGE
              </span>
              <span className="text-xs text-slate-400">Hotkey: Cmd/Ctrl + G</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-100">
              ✨ Gemini Studio &amp; &ldquo;Previously On…&rdquo; Recap Bridge
            </h2>
            <p className="text-xs text-slate-400">
              Zero API keys required. Step 1 builds a context-aware schema prompt for Gemini; Step 2 validates, previews, snapshots, and merges the JSON response in 1 click.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            ✕ Close
          </button>
        </div>

        {/* STEP 1 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-amber-300">
              Step 1 — Context-Aware Schema Prompt Generator
            </h3>
            {copyStatus && (
              <span className="text-xs font-medium text-emerald-400">{copyStatus}</span>
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
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-100'
                    : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold">{p.label}</div>
                <div className="mt-1 text-[11px] text-slate-400">{p.description}</div>
              </button>
            ))}
          </div>

          <div>
            <input
              type="text"
              value={customGuidance}
              onChange={(e) => setCustomGuidance(e.target.value)}
              placeholder="Optional direction (e.g. 'Focus on the betrayal at the docks', 'Create 3 spooky swamp monsters')…"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
            />
          </div>

          <textarea
            readOnly
            value={generatedPrompt}
            rows={6}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-300"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyPrompt(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              📋 Copy Prompt
            </button>
            <button
              type="button"
              onClick={() => void handleCopyPrompt(true)}
              className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
            >
              🚀 Copy Prompt &amp; Open Gemini ↗
            </button>
          </div>
        </div>

        {/* STEP 2 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-sky-300">
              Step 2 — 1-Click Paste, Diff Preview &amp; Undoable Apply
            </h3>
            {role === 'gm' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
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
            className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-slate-200"
          />

          {/* Live Validation & Diff Preview */}
          {validation && !validation.ok && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              ⚠️ {validation.error}
            </div>
          )}

          {validation?.ok && diffPreview && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs space-y-1.5">
              <div className="font-semibold text-emerald-300">
                ✅ Validated Gemini Schema — Ready to Merge:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {diffPreview.summary.map((item, i) => (
                  <span
                    key={i}
                    className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200 border border-emerald-500/30"
                  >
                    {item}
                  </span>
                ))}
              </div>
              {diffPreview.hasRecap && (
                <div className="mt-1 rounded bg-slate-950/80 p-2 text-slate-300">
                  <strong className="text-amber-300">{diffPreview.recapTitle}:</strong>{' '}
                  {diffPreview.recapText.slice(0, 220)}
                  {diffPreview.recapText.length > 220 ? '…' : ''}
                </div>
              )}
            </div>
          )}

          {applyFeedback && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-xs text-sky-200">
              <span>{applyFeedback}</span>
              {lastUndoSnapshotId && (
                <button
                  type="button"
                  onClick={handleUndoLastApply}
                  className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
                >
                  ↩ Undo Apply
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePasteFromClipboardAndApply()}
              className="rounded-lg bg-emerald-500/25 border border-emerald-500/50 px-3.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/35"
            >
              📥 Paste from Clipboard &amp; Apply
            </button>
            {rawJsonInput.trim() && validation?.ok && (
              <button
                type="button"
                onClick={() => void handlePasteFromClipboardAndApply()}
                className="rounded-lg bg-sky-500/25 border border-sky-500/50 px-3.5 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/35"
              >
                ✓ Apply Previewed Diff
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default GeminiBridgeModal;
