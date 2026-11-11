'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Lock,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { LockedInline } from '@/components/LockedFeature';
import { captureVaultSnapshot } from '@/lib/snapshotVault';
import {
  applyValidatedPatchToPlayerTracker,
  applyWorkspacePatchToCampaignData,
  buildArchitectRelayPrompt,
  buildHudScopeKey,
  buildSafeArchitectContextSummary,
  buildWorkspacePatchDiff,
  compileNaturalLanguageArchitectTurn,
  isChromeLanguageModelAvailable,
  loadLocalHudPrefs,
  loadLocalTerminologyPrefs,
  mergeHudLayoutPrefs,
  parseArchitectRelayResponse,
  runChromeLanguageModelArchitect,
  saveLocalHudPrefs,
  saveLocalTerminologyPrefs,
  validateWorkspacePatch,
  type ArchitectChatMessage,
  type ArchitectTurnResponse,
  type CampaignModeOption,
  type CampaignWorkspacePatch,
  type FollowUpOptionChip,
  type HudLayoutPrefs,
  type TerminologyMap,
  type ValidatedWorkspacePatch,
  type WorkspaceAuthorityContext,
  type WorkspaceUndoBundle,
} from '@/lib/workspaceConfigCompiler';
import type { PlayerEditableField } from '@/lib/player/allowlist';
import type { PlayerCharacter } from '@/lib/pc/types';
import type { PlayerLocalTrackerState } from '@/lib/playerMode/playerTrackerStorage';

export interface WorkspaceArchitectModalProps {
  open: boolean;
  onClose: () => void;
  campaignId?: string;
  campaignName?: string;
  campaignOwnerUid?: string;
  /** Current campaign data (GM workspace only; never pass raw GM data in `/play/[shareToken]`). */
  campaignData?: Record<string, any>;
  role: 'gm' | 'player';
  /** True ONLY when the authenticated user owns this campaign. Must be false on `/player` & `/play/[shareToken]`. */
  isCampaignOwner: boolean;
  /** Active slot ID in shared player mode (`/play/[shareToken]`). */
  activeSlotId?: string;
  /** PCs visible/owned in the current session. */
  pcs?: PlayerCharacter[];
  /** Explicit IDs of PCs owned by the active player. */
  ownedPcIds?: string[];
  /** Current local player tracker state (for share-confirmation invariant checks). */
  currentTrackerState?: PlayerLocalTrackerState;
  /** Callback to apply validated campaign-wide data through CRDT-synced `setState` (GM owner only). */
  onApplyCampaignData?: (
    nextData: Record<string, any>,
    nextMode?: CampaignModeOption,
  ) => void;
  /** Callback to apply whitelisted PC writebacks strictly to owned PC(s) in player mode. */
  onApplyPlayerPcWriteback?: (
    pcId: string,
    updates: Partial<Record<PlayerEditableField, unknown>>,
  ) => void | Promise<void>;
  /** Optional callback if local tracker state was updated. */
  onApplyPlayerTrackerState?: (
    nextTracker: PlayerLocalTrackerState,
  ) => void | Promise<void>;
  /** Optional toast callback. */
  onNotify?: (message: string) => void;
}

type ProviderBadge =
  | 'cloud_pro'
  | 'chrome_on_device'
  | 'prompt_relay'
  | 'local_compiler';

interface ChatTurnEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: ProviderBadge;
  followUpOptions?: FollowUpOptionChip[];
}

const GM_STARTER_PROMPTS: ReadonlyArray<{ label: string; prompt: string }> = [
  {
    label: 'Cosmic Horror Duet Mystery',
    prompt:
      'Set up a 2-player cosmic horror mystery: switch to Duet prep counts, add Sanity and Luck trackers to PCs, rename Gold to Cash and Quests to Leads, and pin Clocks + Investigation Board to the top of Run.',
  },
  {
    label: 'Cyberpunk Heist Crew',
    prompt:
      'Cyberpunk heist: rename Quests / Dungeons / Gold to Jobs / Sites / Credits, add Stress and Heat trackers, and switch the HUD to compact density.',
  },
  {
    label: 'Gritty Solo Crawl',
    prompt:
      'Switch to Solo mode with 4 Locations, 3 Encounters, and 4 Secrets, add a Supply tracker to PCs, and hide Audio in the HUD.',
  },
];

const PLAYER_STARTER_PROMPTS: ReadonlyArray<{ label: string; prompt: string }> = [
  {
    label: 'Investigation Focus HUD + Sanity',
    prompt:
      'Pin Clocks + Investigation Board to the top of Play, use compact HUD density, and add Sanity and Luck trackers to my sheet.',
  },
  {
    label: 'Sci-Fi Local Labels & Clean HUD',
    prompt:
      'Rename Quests to Contracts and Gold to Credits locally, and hide Audio in my Play HUD.',
  },
];

function mergeWorkspacePatches(
  base: CampaignWorkspacePatch | null,
  incoming: CampaignWorkspacePatch,
): CampaignWorkspacePatch {
  if (!base) return { ...incoming };
  return {
    ...base,
    campaignMode: incoming.campaignMode
      ? {
          ...(base.campaignMode ?? {}),
          ...incoming.campaignMode,
          prepTargetOverrides: {
            ...(base.campaignMode?.prepTargetOverrides ?? {}),
            ...(incoming.campaignMode.prepTargetOverrides ?? {}),
          },
        }
      : base.campaignMode,
    systemFlavorAndTrackers: incoming.systemFlavorAndTrackers
      ? {
          ...(base.systemFlavorAndTrackers ?? {}),
          ...incoming.systemFlavorAndTrackers,
          resourcePoolTemplates: incoming.systemFlavorAndTrackers.resourcePoolTemplates
            ? [
                ...(base.systemFlavorAndTrackers?.resourcePoolTemplates ?? []).filter(
                  (prev) =>
                    !incoming.systemFlavorAndTrackers!.resourcePoolTemplates!.some(
                      (n) => n.name.toLowerCase() === prev.name.toLowerCase(),
                    ),
                ),
                ...incoming.systemFlavorAndTrackers.resourcePoolTemplates,
              ]
            : base.systemFlavorAndTrackers?.resourcePoolTemplates,
          conditionBuffPresets: incoming.systemFlavorAndTrackers.conditionBuffPresets
            ? [
                ...(base.systemFlavorAndTrackers?.conditionBuffPresets ?? []).filter(
                  (prev) =>
                    !incoming.systemFlavorAndTrackers!.conditionBuffPresets!.some(
                      (n) => n.name.toLowerCase() === prev.name.toLowerCase(),
                    ),
                ),
                ...incoming.systemFlavorAndTrackers.conditionBuffPresets,
              ]
            : base.systemFlavorAndTrackers?.conditionBuffPresets,
          toneTags: incoming.systemFlavorAndTrackers.toneTags
            ? Array.from(
                new Set([
                  ...(base.systemFlavorAndTrackers?.toneTags ?? []),
                  ...incoming.systemFlavorAndTrackers.toneTags,
                ]),
              )
            : base.systemFlavorAndTrackers?.toneTags,
          clockCategories: incoming.systemFlavorAndTrackers.clockCategories
            ? Array.from(
                new Set([
                  ...(base.systemFlavorAndTrackers?.clockCategories ?? []),
                  ...incoming.systemFlavorAndTrackers.clockCategories,
                ]),
              )
            : base.systemFlavorAndTrackers?.clockCategories,
        }
      : base.systemFlavorAndTrackers,
    terminologyMap: incoming.terminologyMap
      ? { ...(base.terminologyMap ?? {}), ...incoming.terminologyMap }
      : base.terminologyMap,
    hudLayoutPrefs: incoming.hudLayoutPrefs
      ? mergeHudLayoutPrefs(base.hudLayoutPrefs, incoming.hudLayoutPrefs)
      : base.hudLayoutPrefs,
  };
}

export function WorkspaceArchitectModal({
  open,
  onClose,
  campaignId,
  campaignName = 'Campaign',
  campaignOwnerUid,
  campaignData,
  role,
  isCampaignOwner,
  activeSlotId,
  pcs,
  ownedPcIds,
  currentTrackerState,
  onApplyCampaignData,
  onApplyPlayerPcWriteback,
  onApplyPlayerTrackerState,
  onNotify,
}: WorkspaceArchitectModalProps) {
  const { user, isPro } = useAuth();
  const canEditCampaign = Boolean(isCampaignOwner) && role === 'gm';

  const hudScopeKey = useMemo(
    () => buildHudScopeKey(campaignId, role, activeSlotId),
    [campaignId, role, activeSlotId],
  );

  const [activeTab, setActiveTab] = useState<'chat' | 'relay'>('chat');
  const [preferChromeAi, setPreferChromeAi] = useState(false);
  const [chromeAiAvailable, setChromeAiAvailable] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [relayPasteText, setRelayPasteText] = useState('');
  const [relayCopied, setRelayCopied] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurnEntry[]>([]);
  const [stagedPatch, setStagedPatch] = useState<CampaignWorkspacePatch | null>(null);
  const [turnWarnings, setTurnWarnings] = useState<string[]>([]);
  const [lastUndo, setLastUndo] = useState<WorkspaceUndoBundle | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const authorityContext = useMemo<WorkspaceAuthorityContext>(() => {
    const derivedOwnedIds =
      ownedPcIds ??
      (role === 'player'
        ? (pcs ?? [])
            .filter((p) =>
              activeSlotId
                ? p.ownership?.ownerType === 'player' &&
                  p.ownership?.playerSlotId === activeSlotId
                : p.ownership?.ownerType !== 'dm',
            )
            .map((p) => p.id)
        : (pcs ?? []).map((p) => p.id));

    return {
      role,
      isCampaignOwner,
      activeSlotId,
      ownedPcIds: derivedOwnedIds,
      pcs: pcs as Array<Record<string, any>> | undefined,
      currentTrackerState,
    };
  }, [role, isCampaignOwner, activeSlotId, ownedPcIds, pcs, currentTrackerState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    isChromeLanguageModelAvailable().then((avail) => {
      if (!cancelled) setChromeAiAvailable(avail);
    });
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const currentHudPrefs = useMemo(
    () => (open ? loadLocalHudPrefs(hudScopeKey) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, hudScopeKey, statusBanner],
  );

  const validatedResult = useMemo<ValidatedWorkspacePatch | null>(() => {
    if (!stagedPatch) return null;
    return validateWorkspacePatch(stagedPatch, authorityContext);
  }, [stagedPatch, authorityContext]);

  const diffItems = useMemo(() => {
    if (!validatedResult || !validatedResult.ok) return [];
    return buildWorkspacePatchDiff(
      canEditCampaign ? campaignData : undefined,
      currentHudPrefs ?? undefined,
      validatedResult,
    );
  }, [validatedResult, canEditCampaign, campaignData, currentHudPrefs]);

  const chatHistoryForPrompt = useMemo<ArchitectChatMessage[]>(
    () => turns.map((t) => ({ role: t.role, content: t.content })),
    [turns],
  );

  const relayPromptText = useMemo(
    () =>
      buildArchitectRelayPrompt(
        promptInput.trim() ||
          (canEditCampaign
            ? GM_STARTER_PROMPTS[0].prompt
            : PLAYER_STARTER_PROMPTS[0].prompt),
        chatHistoryForPrompt,
        campaignName,
        canEditCampaign ? campaignData : undefined,
        authorityContext,
        currentHudPrefs,
      ),
    [
      promptInput,
      canEditCampaign,
      chatHistoryForPrompt,
      campaignName,
      campaignData,
      authorityContext,
      currentHudPrefs,
    ],
  );

  const runPromptTurn = useCallback(
    async (rawUserPrompt: string, explicitOverridePatch?: CampaignWorkspacePatch) => {
      const trimmed = rawUserPrompt.trim();
      if (!trimmed || busy) return;

      const userTurnId = `u_${Date.now()}`;
      setTurns((prev) => [
        ...prev,
        { id: userTurnId, role: 'user', content: trimmed },
      ]);
      setPromptInput('');
      setRelayError(null);

      // If an Option A / Option B chip supplied an immediate structured patch override, merge it directly!
      if (explicitOverridePatch) {
        const merged = mergeWorkspacePatches(stagedPatch, explicitOverridePatch);
        setStagedPatch(merged);
        setTurns((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            content: `Updated preview with: "${trimmed}". Review the updated diff below before applying.`,
            provider: 'local_compiler',
          },
        ]);
        return;
      }

      setBusy(true);
      try {
        let resolvedTurn: ArchitectTurnResponse | null = null;
        let usedProvider: ProviderBadge = 'local_compiler';

        // Tier 1: Cloud Pro Structured JSON Proxy (when signed-in Pro & not explicitly forcing on-device)
        if (isPro && user && !preferChromeAi) {
          try {
            const idToken = await user.getIdToken();
            const safeContextData = buildSafeArchitectContextSummary(
              campaignName,
              canEditCampaign ? campaignData : undefined,
              authorityContext,
              currentHudPrefs,
            );
            const res = await fetch('/api/workspace-architect', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                prompt: trimmed,
                history: chatHistoryForPrompt,
                campaignName,
                role,
                campaignOwnerUid,
                activeSlotId,
                ownedPcIds: authorityContext.ownedPcIds,
                currentHudPrefs,
                safeContextData,
              }),
            });
            if (res.ok) {
              const json = (await res.json()) as {
                turn?: ArchitectTurnResponse;
                provider?: string;
              };
              if (json?.turn) {
                resolvedTurn = json.turn;
                usedProvider =
                  json.provider === 'cloud_pro' ? 'cloud_pro' : 'local_compiler';
              }
            }
          } catch {
            // Fall through to on-device Chrome AI or deterministic local compiler
          }
        }

        // Tier 2: Chrome Built-in On-Device `LanguageModel` Fallback
        if (!resolvedTurn && chromeAiAvailable) {
          const onDevice = await runChromeLanguageModelArchitect(
            trimmed,
            chatHistoryForPrompt,
            campaignName,
            canEditCampaign ? campaignData : undefined,
            authorityContext,
            currentHudPrefs,
          );
          if (onDevice.ok && onDevice.turn) {
            resolvedTurn = onDevice.turn;
            usedProvider = 'chrome_on_device';
            setTurnWarnings(onDevice.validated?.warnings ?? []);
          }
        }

        // Tier 3: Deterministic Offline Natural-Language Compiler
        if (!resolvedTurn) {
          const compiled = compileNaturalLanguageArchitectTurn(
            trimmed,
            authorityContext,
          );
          resolvedTurn = compiled.turn;
          usedProvider = 'local_compiler';
          setTurnWarnings(compiled.validated.warnings);
        }

        const merged = mergeWorkspacePatches(stagedPatch, resolvedTurn.patch);
        setStagedPatch(merged);
        setTurns((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            content: resolvedTurn!.reply,
            provider: usedProvider,
            followUpOptions: resolvedTurn!.followUpOptions,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      stagedPatch,
      isPro,
      user,
      preferChromeAi,
      campaignName,
      canEditCampaign,
      campaignData,
      authorityContext,
      currentHudPrefs,
      chatHistoryForPrompt,
      role,
      campaignOwnerUid,
      activeSlotId,
      chromeAiAvailable,
    ],
  );

  const handleValidateRelayPaste = () => {
    setRelayError(null);
    const parsed = parseArchitectRelayResponse(relayPasteText, authorityContext);
    if (!parsed.ok || !parsed.turn) {
      setRelayError(parsed.error || 'Could not validate pasted JSON response.');
      return;
    }
    setTurnWarnings(parsed.validated?.warnings ?? []);
    const merged = mergeWorkspacePatches(stagedPatch, parsed.turn.patch);
    setStagedPatch(merged);
    setTurns((prev) => [
      ...prev,
      {
        id: `a_relay_${Date.now()}`,
        role: 'assistant',
        content: parsed.turn!.reply,
        provider: 'prompt_relay',
        followUpOptions: parsed.turn!.followUpOptions,
      },
    ]);
    setActiveTab('chat');
  };

  const handleApplyToCampaign = () => {
    if (!validatedResult || !validatedResult.canApplyToCampaign || !onApplyCampaignData) {
      return;
    }

    const prevHud = loadLocalHudPrefs(hudScopeKey);
    const prevTerms = loadLocalTerminologyPrefs(hudScopeKey);

    if (campaignId && campaignData) {
      captureVaultSnapshot({
        campaignId,
        campaignName,
        reason: 'workspace_architect_apply',
        label: 'Pre-Workspace Customizer Apply',
        data: campaignData,
      });
    }

    const { nextData, undoSnapshot } = applyWorkspacePatchToCampaignData(
      campaignData ?? {},
      validatedResult,
    );

    if (validatedResult.localHudPrefs) {
      const mergedHud = mergeHudLayoutPrefs(prevHud, validatedResult.localHudPrefs);
      saveLocalHudPrefs(hudScopeKey, mergedHud);
    }

    const nextMode = validatedResult.campaignPatch.campaignMode?.mode;
    onApplyCampaignData(nextData, nextMode);

    setLastUndo({
      createdAtMs: Date.now(),
      summary: 'Applied customizations to Campaign & Table HUD',
      previousCampaignData: undoSnapshot,
      previousHudPrefs: prevHud,
      previousLocalTerms: prevTerms,
    });
    setStagedPatch(null);
    const msg = 'Applied campaign & HUD configuration (1-tap Undo ready)';
    setStatusBanner(msg);
    onNotify?.(msg);
  };

  const handleApplyLocalHudOnly = async (includeOwnedSheetWriteback = false) => {
    if (!validatedResult) return;

    const prevHud = loadLocalHudPrefs(hudScopeKey);
    const prevTerms = loadLocalTerminologyPrefs(hudScopeKey);
    const prevOwnedSnapshots: Record<string, PlayerCharacter> = {};

    if (validatedResult.localHudPrefs) {
      const mergedHud = mergeHudLayoutPrefs(prevHud, validatedResult.localHudPrefs);
      saveLocalHudPrefs(hudScopeKey, mergedHud);
    }

    if (validatedResult.localTerminologyMap) {
      saveLocalTerminologyPrefs(hudScopeKey, {
        ...(prevTerms ?? {}),
        ...validatedResult.localTerminologyMap,
      });
    }

    if (
      includeOwnedSheetWriteback &&
      onApplyPlayerPcWriteback &&
      Object.keys(validatedResult.pcWritebacks).length > 0
    ) {
      for (const [pcId, fields] of Object.entries(validatedResult.pcWritebacks)) {
        const existingPc = pcs?.find((p) => p.id === pcId);
        if (existingPc) {
          prevOwnedSnapshots[pcId] = JSON.parse(JSON.stringify(existingPc));
        }
        await onApplyPlayerPcWriteback(pcId, fields);
      }
    }

    if (
      includeOwnedSheetWriteback &&
      validatedResult.localTrackerPatch &&
      currentTrackerState &&
      onApplyPlayerTrackerState
    ) {
      const { nextTracker } = applyValidatedPatchToPlayerTracker(
        currentTrackerState,
        validatedResult,
      );
      await onApplyPlayerTrackerState(nextTracker);
    }

    setLastUndo({
      createdAtMs: Date.now(),
      summary: includeOwnedSheetWriteback
        ? 'Applied to Local HUD & Owned Character Sheet'
        : 'Applied to Local HUD Only',
      previousHudPrefs: prevHud,
      previousLocalTerms: prevTerms,
      previousOwnedPcSnapshots:
        Object.keys(prevOwnedSnapshots).length > 0 ? prevOwnedSnapshots : undefined,
      previousTrackerState: currentTrackerState
        ? JSON.parse(JSON.stringify(currentTrackerState))
        : undefined,
    });
    setStagedPatch(null);
    const msg = includeOwnedSheetWriteback
      ? 'Applied to Local HUD & Owned Sheet (1-tap Undo ready)'
      : 'Applied to Local HUD Only (1-tap Undo ready)';
    setStatusBanner(msg);
    onNotify?.(msg);
  };

  const handleUndoLastApply = async () => {
    if (!lastUndo) return;

    if (
      lastUndo.previousCampaignData &&
      canEditCampaign &&
      onApplyCampaignData
    ) {
      const restoredMode = (lastUndo.previousCampaignData.mode ??
        (lastUndo.previousCampaignData.__soloMode
          ? 'duet'
          : 'standard')) as CampaignModeOption;
      onApplyCampaignData(lastUndo.previousCampaignData, restoredMode);
    }

    saveLocalHudPrefs(hudScopeKey, lastUndo.previousHudPrefs ?? null);
    saveLocalTerminologyPrefs(hudScopeKey, lastUndo.previousLocalTerms ?? null);

    if (lastUndo.previousOwnedPcSnapshots && onApplyPlayerPcWriteback) {
      for (const [pcId, snap] of Object.entries(lastUndo.previousOwnedPcSnapshots)) {
        await onApplyPlayerPcWriteback(pcId, {
          resourcePools: snap.resourcePools,
          activeBuffs: snap.activeBuffs ?? [],
        });
      }
    }

    if (lastUndo.previousTrackerState && onApplyPlayerTrackerState) {
      await onApplyPlayerTrackerState(lastUndo.previousTrackerState);
    }

    setLastUndo(null);
    const msg = 'Rolled back workspace customization';
    setStatusBanner(msg);
    onNotify?.(msg);
  };

  if (!open) return null;

  const hasCampaignScopedDiff = diffItems.some((d) => d.scope === 'campaign');
  const hasLocalHudDiff = Boolean(
    validatedResult?.localHudPrefs || validatedResult?.localTerminologyMap,
  );
  const hasOwnedSheetDiff =
    validatedResult && Object.keys(validatedResult.pcWritebacks).length > 0;
  const starterPrompts = canEditCampaign
    ? GM_STARTER_PROMPTS
    : PLAYER_STARTER_PROMPTS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Conversational Campaign & Table Customizer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal size={16} className="text-[var(--accent-primary)]" />
              <h2 className="font-display text-base font-bold tracking-wide">
                Conversational Campaign &amp; Table Customizer
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${
                  canEditCampaign
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                }`}
              >
                <ShieldCheck size={11} />
                {canEditCampaign ? 'GM Owner Authority' : 'Player Local + Owned Sheet Scope'}
              </span>
              <kbd className="hidden rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline-block">
                ⌘⇧K
              </kbd>
            </div>
            <p className="font-sans text-xs text-[var(--text-muted)]">
              {canEditCampaign
                ? 'Tailor play mode, prep targets, custom PC resource trackers, UI terminology, and Run HUD widgets in plain English.'
                : 'Customize your local Play HUD widgets, terminology labels, and whitelisted trackers on your owned character sheet.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close customizer"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Mode & Engine Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-5 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Wand2 size={12} /> Conversational Architect
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relay')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'relay'
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Copy size={12} /> Copy/Paste Prompt Relay
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPro ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300">
                <Sparkles size={11} /> Cloud Structured JSON Ready
              </span>
            ) : (
              <LockedInline label="Cloud AI (Pro)" />
            )}

            {chromeAiAvailable && (
              <button
                type="button"
                onClick={() => setPreferChromeAi((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
                  preferChromeAi || !isPro
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
                title="Chrome Built-in On-Device LanguageModel API"
              >
                <Cpu size={11} /> On-Device Chrome AI
              </button>
            )}
          </div>
        </div>

        {/* 1-Tap Undo Rollback Banner */}
        {(lastUndo || statusBanner) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-5 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-emerald-300">
              <Check size={13} />
              {statusBanner || lastUndo?.summary}
            </span>
            {lastUndo && (
              <button
                type="button"
                onClick={() => void handleUndoLastApply()}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-200 hover:bg-amber-500/30"
              >
                <RotateCcw size={12} /> Undo
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {activeTab === 'chat' ? (
            <>
              {/* Starter Prompts */}
              {turns.length === 0 && (
                <div className="space-y-2">
                  <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Quick Start Examples
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {starterPrompts.map((ex) => (
                      <button
                        key={ex.label}
                        type="button"
                        onClick={() => void runPromptTurn(ex.prompt)}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-left font-sans text-xs text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)]"
                      >
                        <div className="font-semibold text-[var(--accent-primary)]">
                          {ex.label}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-muted)]">
                          &ldquo;{ex.prompt}&rdquo;
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation History + Clickable Option A / Option B Chips */}
              {turns.length > 0 && (
                <div className="space-y-3" aria-live="polite">
                  {turns.map((turn) => (
                    <div
                      key={turn.id}
                      className={`rounded-xl border p-3 text-xs ${
                        turn.role === 'user'
                          ? 'ml-6 border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10'
                          : 'mr-4 border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        <span>{turn.role === 'user' ? 'You' : 'Table Architect'}</span>
                        {turn.provider && (
                          <span className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono">
                            {turn.provider === 'cloud_pro'
                              ? 'Gemini / Cloud JSON'
                              : turn.provider === 'chrome_on_device'
                                ? 'Chrome LanguageModel'
                                : turn.provider === 'prompt_relay'
                                  ? 'Prompt Relay JSON'
                                  : 'Instant Rule Compiler'}
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed text-[var(--text-primary)]">
                        {turn.content}
                      </p>

                      {turn.followUpOptions && turn.followUpOptions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {turn.followUpOptions.map((chip) => (
                            <button
                              key={chip.id}
                              type="button"
                              onClick={() =>
                                void runPromptTurn(chip.promptReply, chip.patchOverride)
                              }
                              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
                            >
                              <div>{chip.label}</div>
                              {chip.description && (
                                <div className="text-[10px] font-normal text-[var(--text-muted)]">
                                  {chip.description}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Prompt Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runPromptTurn(promptInput);
                }}
                className="space-y-2"
              >
                <label
                  htmlFor="workspace-architect-input"
                  className="block font-sans text-xs font-medium text-[var(--text-muted)]"
                >
                  Describe your system, custom trackers, terminology, or HUD layout:
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="workspace-architect-input"
                    ref={inputRef}
                    rows={2}
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void runPromptTurn(promptInput);
                      }
                    }}
                    placeholder={
                      canEditCampaign
                        ? 'e.g., Set up a 2-player cosmic horror mystery: switch to Duet prep counts, add Sanity and Luck trackers to PCs, rename Gold to Cash and Quests to Leads, and pin Clocks + Investigation Board to the top of Run'
                        : 'e.g., Pin Clocks + Investigation Board to the top of Play, add Sanity and Luck trackers to my sheet, and rename Gold to Cash'
                    }
                    className="min-h-[60px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-sans text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !promptInput.trim()}
                    className="inline-flex h-[60px] items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 font-sans text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <Send size={14} />
                    <span>{busy ? 'Compiling…' : 'Compile'}</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Copy/Paste Prompt Relay Panel for Offline / External Gemini Users */
            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">
                    Step 1 — Copy Privacy-Redacted Schema Prompt
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(relayPromptText);
                        setRelayCopied(true);
                        setTimeout(() => setRelayCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 font-medium hover:border-[var(--accent-primary)]"
                    >
                      {relayCopied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{relayCopied ? 'Copied!' : 'Copy Prompt'}</span>
                    </button>
                    <a
                      href="https://gemini.google.com/app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 font-medium text-indigo-300 hover:bg-indigo-500/20"
                    >
                      <span>Open Gemini</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
                <pre className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2 font-mono text-[10px] text-[var(--text-muted)]">
                  {relayPromptText}
                </pre>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2">
                <label
                  htmlFor="architect-relay-paste"
                  className="block font-semibold text-[var(--text-primary)]"
                >
                  Step 2 — Paste Structured JSON Reply
                </label>
                <textarea
                  id="architect-relay-paste"
                  rows={4}
                  value={relayPasteText}
                  onChange={(e) => setRelayPasteText(e.target.value)}
                  placeholder='Paste JSON (markdown ```json fences are stripped automatically)...'
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 font-mono text-xs text-[var(--text-primary)]"
                />
                {relayError && (
                  <p className="text-xs text-rose-400" role="alert">
                    {relayError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleValidateRelayPaste}
                  disabled={!relayPasteText.trim()}
                  className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                >
                  Validate &amp; Preview Diff
                </button>
              </div>
            </div>
          )}

          {/* Authority / Privacy Guard Notices */}
          {(() => {
            const combinedWarnings = Array.from(
              new Set([...turnWarnings, ...(validatedResult?.warnings ?? [])]),
            );
            if (combinedWarnings.length === 0) return null;
            return (
              <div
                role="status"
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1"
              >
                <div className="font-semibold">CRDT Privacy &amp; Authority Guard</div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {combinedWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* Interactive Diff Preview */}
          {stagedPatch && (
            <div
              data-testid="workspace-diff-preview"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Diff Preview ({diffItems.length} change{diffItems.length === 1 ? '' : 's'})
                </h3>
                <button
                  type="button"
                  onClick={() => setStagedPatch(null)}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Clear Staged Changes
                </button>
              </div>

              {diffItems.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No net configuration deltas detected yet — refine your request above or pick an option chip.
                </p>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                  {diffItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                            item.scope === 'campaign'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : item.scope === 'owned_pc'
                                ? 'bg-indigo-500/15 text-indigo-300'
                                : 'bg-sky-500/15 text-sky-300'
                          }`}
                        >
                          {item.scope === 'campaign'
                            ? 'Campaign'
                            : item.scope === 'owned_pc'
                              ? 'Owned Sheet'
                              : 'Local HUD'}
                        </span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="text-[var(--text-muted)] line-through">
                          {item.before}
                        </span>
                        <span className="text-[var(--text-muted)]">→</span>
                        <span className="font-semibold text-emerald-400">
                          {item.after}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Apply Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3">
          <div className="text-[11px] text-[var(--text-muted)]">
            {canEditCampaign
              ? 'Campaign updates sync via CRDT; Local HUD applies only to this device.'
              : 'Player mode never mutates campaign-wide rules or unowned PCs.'}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleApplyLocalHudOnly(false)}
              disabled={!stagedPatch || (!hasLocalHudDiff && !hasOwnedSheetDiff)}
              className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 font-sans text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
            >
              Apply to Local HUD Only
            </button>

            {!canEditCampaign && hasOwnedSheetDiff && onApplyPlayerPcWriteback && (
              <button
                type="button"
                onClick={() => void handleApplyLocalHudOnly(true)}
                className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-sm hover:opacity-90"
              >
                Apply to Local HUD &amp; My Sheet
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyToCampaign}
              disabled={
                !canEditCampaign ||
                !onApplyCampaignData ||
                !stagedPatch ||
                (!hasCampaignScopedDiff && !hasLocalHudDiff)
              }
              title={
                canEditCampaign
                  ? 'Apply to shared Campaign & HUD'
                  : 'Campaign-wide updates require GM Campaign Owner authority'
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 font-sans text-xs font-semibold text-white shadow-sm transition-opacity hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {!canEditCampaign && <Lock size={12} />}
              <span>Apply to Campaign</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceArchitectModal;
