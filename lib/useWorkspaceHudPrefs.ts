'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildHudScopeKey,
  HUD_PREFS_EVENT_NAME,
  loadLocalHudPrefs,
  loadLocalTerminologyPrefs,
  resolveEffectiveHudLayout,
  resolveTerm,
  saveLocalHudPrefs,
  saveLocalTerminologyPrefs,
  WORKSPACE_CONFIG_STATE_KEY,
  type CanonicalTerminologyKey,
  type HudLayoutPrefs,
  type ResolvedHudLayout,
  type StoredWorkspaceConfig,
  type TerminologyMap,
} from './workspaceConfigCompiler';

export interface UseWorkspaceCustomizationOptions {
  campaignId?: string;
  role: 'gm' | 'player';
  slotId?: string;
  /** Optional GM campaign state (`state`) or projected `workspaceConfig` from `SlotProjection`. */
  campaignStateOrProjectedConfig?: Record<string, any> | null;
}

export interface UseWorkspaceCustomizationResult {
  scopeKey: string;
  hudPrefs: HudLayoutPrefs | null;
  hudLayout: ResolvedHudLayout;
  terminologyMap: TerminologyMap | undefined;
  term: (key: CanonicalTerminologyKey | string, fallback?: string) => string;
  setLocalHudPrefs: (next: HudLayoutPrefs | null) => void;
  setLocalTerminology: (next: TerminologyMap | null) => void;
}

/**
 * Subscribes to per-user local HUD layout preferences and merges campaign/projected
 * terminology with local per-user terminology overrides.
 */
export function useWorkspaceCustomization({
  campaignId,
  role,
  slotId,
  campaignStateOrProjectedConfig,
}: UseWorkspaceCustomizationOptions): UseWorkspaceCustomizationResult {
  const scopeKey = useMemo(
    () => buildHudScopeKey(campaignId, role, slotId),
    [campaignId, role, slotId],
  );

  const [hudPrefs, setHudPrefsState] = useState<HudLayoutPrefs | null>(() =>
    loadLocalHudPrefs(scopeKey),
  );
  const [localTerms, setLocalTermsState] = useState<TerminologyMap | null>(() =>
    loadLocalTerminologyPrefs(scopeKey),
  );

  useEffect(() => {
    setHudPrefsState(loadLocalHudPrefs(scopeKey));
    setLocalTermsState(loadLocalTerminologyPrefs(scopeKey));
  }, [scopeKey]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detailScope = (e as CustomEvent<{ scopeKey?: string }>)?.detail?.scopeKey;
      if (!detailScope || detailScope === scopeKey) {
        setHudPrefsState(loadLocalHudPrefs(scopeKey));
        setLocalTermsState(loadLocalTerminologyPrefs(scopeKey));
      }
    };
    window.addEventListener(HUD_PREFS_EVENT_NAME, onUpdated);
    return () => window.removeEventListener(HUD_PREFS_EVENT_NAME, onUpdated);
  }, [scopeKey]);

  const campaignTerms: TerminologyMap | undefined = useMemo(() => {
    if (!campaignStateOrProjectedConfig) return undefined;
    const fromState = (
      campaignStateOrProjectedConfig[WORKSPACE_CONFIG_STATE_KEY] as
        | StoredWorkspaceConfig
        | undefined
    )?.terminologyMap;
    if (fromState) return fromState;
    if (
      campaignStateOrProjectedConfig.terminologyMap &&
      typeof campaignStateOrProjectedConfig.terminologyMap === 'object'
    ) {
      return campaignStateOrProjectedConfig.terminologyMap as TerminologyMap;
    }
    return undefined;
  }, [campaignStateOrProjectedConfig]);

  const mergedTerminologyMap = useMemo<TerminologyMap | undefined>(() => {
    if (!campaignTerms && !localTerms) return undefined;
    return {
      ...(campaignTerms ?? {}),
      ...(localTerms ?? {}),
    };
  }, [campaignTerms, localTerms]);

  const hudLayout = useMemo(
    () => resolveEffectiveHudLayout(hudPrefs),
    [hudPrefs],
  );

  const term = useCallback(
    (key: CanonicalTerminologyKey | string, fallback?: string) =>
      resolveTerm(mergedTerminologyMap, key, fallback),
    [mergedTerminologyMap],
  );

  const setLocalHudPrefs = useCallback(
    (next: HudLayoutPrefs | null) => {
      saveLocalHudPrefs(scopeKey, next);
      setHudPrefsState(next);
    },
    [scopeKey],
  );

  const setLocalTerminology = useCallback(
    (next: TerminologyMap | null) => {
      saveLocalTerminologyPrefs(scopeKey, next);
      setLocalTermsState(next);
    },
    [scopeKey],
  );

  return {
    scopeKey,
    hudPrefs,
    hudLayout,
    terminologyMap: mergedTerminologyMap,
    term,
    setLocalHudPrefs,
    setLocalTerminology,
  };
}
