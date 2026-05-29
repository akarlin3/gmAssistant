'use client';

import React, { useCallback } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { updateCampaign } from '@/lib/firebase/campaigns';
import { updateWorld, createWorld } from '@/lib/firebase/worlds';
import { WORLD_KEYS } from '@/lib/worldData';
import type { Campaign } from '@/lib/firebase/campaigns';
import type { World } from '@/lib/firebase/worlds';

export interface SyncAndSaveOptions {
  campaign: Campaign;
  world: World | null | undefined;
  crdtApply: ((next: Record<string, any>) => void) | undefined;
  lastCrdtSnapshotRef: React.MutableRefObject<string>;
  setSyncState: React.Dispatch<React.SetStateAction<'synced' | 'pending' | 'saving' | 'error'>>;
  setSyncError: React.Dispatch<React.SetStateAction<string>>;
}

export function buildSaveToDB(opts: SyncAndSaveOptions) {
  const { campaign, world, crdtApply, lastCrdtSnapshotRef, setSyncState, setSyncError } = opts;

  return async function saveToDB(payload: { name: string; data: Record<string, any>; done: Record<string, boolean> }) {
    setSyncState('saving');
    try {
      const worldPatch: Record<string, any> = {};
      const campaignPatch: Record<string, any> = {};

      for (const [k, v] of Object.entries(payload.data)) {
        if (WORLD_KEYS.includes(k as any) && campaign.worldId) {
          const existingVal = world?.data?.[k];
          if (JSON.stringify(v) !== JSON.stringify(existingVal)) {
            worldPatch[k] = v;
          }
        } else {
          campaignPatch[k] = v;
        }
      }

      const promises = [];
      if (crdtApply) {
        crdtApply(campaignPatch);
        lastCrdtSnapshotRef.current = JSON.stringify(campaignPatch);
        promises.push(updateCampaign(campaign.id, { name: payload.name, done: payload.done }));
      } else {
        promises.push(updateCampaign(campaign.id, { name: payload.name, data: campaignPatch, done: payload.done }));
      }

      if (campaign.worldId && Object.keys(worldPatch).length > 0) {
        promises.push(updateWorld(campaign.worldId, { data: worldPatch }));
      }

      await Promise.all(promises);

      setSyncState('synced');
      setSyncError('');
    } catch (err: any) {
      console.error("Auto-save failed:", err);
      setSyncState('error');
      setSyncError(err?.message || 'Unknown error');
    }
  };
}

export function buildHandleConvertToWorld(opts: {
  campaign: Campaign;
  state: Record<string, any>;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setSyncState: React.Dispatch<React.SetStateAction<'synced' | 'pending' | 'saving' | 'error'>>;
  setSyncError: React.Dispatch<React.SetStateAction<string>>;
  confirmModal: (opts: { title: string; message: string; confirmText: string }) => Promise<boolean>;
}) {
  const { campaign, state, setState, setSyncState, setSyncError, confirmModal } = opts;

  return async function handleConvertToWorld() {
    if (campaign.worldId) return;
    const ok = await confirmModal({
      title: 'Convert to Shared World?',
      message: 'This moves all static lore (NPCs, locations, items, factions, etc.) into a central World that other campaigns can share. This cannot be undone.',
      confirmText: 'Convert to World',
    });
    if (!ok) return;

    try {
      setSyncState('saving');
      const worldData: Record<string, any> = {};
      const newCampaignData = { ...state };
      for (const key of WORLD_KEYS) {
        if (newCampaignData[key] !== undefined) {
          worldData[key] = newCampaignData[key];
          delete newCampaignData[key];
        }
      }
      const newWorldId = await createWorld(campaign.userId, `${campaign.name} (World)`, worldData);
      await updateCampaign(campaign.id, { worldId: newWorldId, data: newCampaignData });
      setSyncState('synced');
    } catch (err: any) {
      console.error("Convert to shared world failed:", err);
      setSyncError(err.message);
      setSyncState('error');
    }
  };
}

export function buildSyncIndicator(syncState: string, syncError: string) {
  return function SyncIndicator() {
    if (syncState === 'saving') return React.createElement('span', { className: "flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-soft" }, React.createElement(Cloud, { size: 12, className: "animate-pulse" }), ' Saving…');
    if (syncState === 'pending') return React.createElement('span', { className: "flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-mute" }, React.createElement(Cloud, { size: 12 }), ' Pending');
    if (syncState === 'error') return React.createElement('span', { className: "flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson", title: syncError }, React.createElement(CloudOff, { size: 12 }), ' Save Failed');
    return React.createElement('span', { className: "flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep" }, React.createElement(Cloud, { size: 12 }), ' Saved');
  };
}

export function buildSyncPill(syncState: string, syncError: string, retrySave: () => void, get: (k: string, fb: any) => any) {
  return function SyncPill() {
    if (syncState === 'synced') return null;
    const isRun = get('__runSessionOpen', false);
    const base = `fixed ${isRun ? 'bottom-[88px]' : 'bottom-4'} left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full shadow-page border text-xs font-display uppercase tracking-wider flex items-center gap-2 transition-all`;
    if (syncState === 'pending' || syncState === 'saving') {
      return null;
    }
    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: retrySave,
        title: syncError || 'Click to retry',
        className: `${base} cursor-pointer border-crimson/70 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment`,
      },
      React.createElement(CloudOff, { size: 12 }),
      'Save failed — click to retry',
    );
  };
}
