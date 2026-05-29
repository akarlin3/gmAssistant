'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Get } from '../types';
import type { PlayerConfig, PlayerEntityType } from '@/lib/playerMode/types';
import type { PlayerLogEntry, Mention } from '@/lib/playerMode/sessionLog';
import { applyNarrationReveal, makeLogEntryId } from '@/lib/playerMode/sessionLog';
import { publishProjections } from '@/lib/playerMode/publish';
import type { SessionSyncAnchor } from './types';

type PublishState = 'idle' | 'publishing' | 'done' | 'error';

type UseAutoPublishOptions = {
  get: Get;
  setVal: (key: string, val: unknown) => void;
  playerConfig: PlayerConfig;
  playerLog: PlayerLogEntry[];
  campaignId?: string;
  campaignName?: string;
  sessionPlaylistAnchor?: SessionSyncAnchor | null;
};

export function useAutoPublish({
  get,
  setVal,
  playerConfig,
  playerLog,
  campaignId,
  campaignName,
  sessionPlaylistAnchor,
}: UseAutoPublishOptions) {
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentSignatureRef = useRef('');
  const prevMusicSignatureRef = useRef('');

  const contentSignature = useMemo(
    () => JSON.stringify({
      p: playerConfig,
      n: get('npcs', []),
      l: get('locations', []),
      f: get('factions', []),
      c: get('characters', []),
      k: get('clocks', []),
      h: get('handouts', ''),
      s: playerLog,
      i: get('items', []),
    }),
    [playerConfig, get, playerLog],
  );

  const musicSignature = useMemo(
    () => JSON.stringify({
      playlist: get('__sessionPlaylist', ''),
      playing: !!get('__sessionPlaylistPlaying', false),
      index: get('__sessionPlaylistIndex', 0),
      anchor: sessionPlaylistAnchor?.anchorWallTimeMs ?? 0,
    }),
    [get, sessionPlaylistAnchor],
  );

  useEffect(() => {
    if (!playerConfig?.shareToken || !campaignId) return;

    const contentChanged = prevContentSignatureRef.current !== contentSignature;
    const musicChanged = prevMusicSignatureRef.current !== musicSignature;

    prevContentSignatureRef.current = contentSignature;
    prevMusicSignatureRef.current = musicSignature;

    if (!contentChanged && !musicChanged) return;

    const delay = (!contentChanged && musicChanged) ? 100 : 1500;

    if (publishTimer.current) clearTimeout(publishTimer.current);
    publishTimer.current = setTimeout(() => {
      void (async () => {
        setPublishState('publishing');
        try {
          const dataToPublish = {
            player: playerConfig,
            npcs: get('npcs', []),
            locations: get('locations', []),
            factions: get('factions', []),
            characters: get('characters', []),
            clocks: get('clocks', []),
            handouts: get('handouts', ''),
            playerLog,
            items: get('items', []),
            maps: get('maps', []),
            __sessionPlaylist: get('__sessionPlaylist', '') as string,
            __sessionPlaylistPlaying: !!get('__sessionPlaylistPlaying', false),
            __sessionPlaylistIndex: get('__sessionPlaylistIndex', 0) as number,
            __sessionPlaylistAnchor: sessionPlaylistAnchor ?? undefined,
          };
          await publishProjections(campaignId, campaignName || 'Campaign', dataToPublish);
          setPublishState('done');
          setTimeout(() => setPublishState('idle'), 2000);
        } catch (e) {
          console.error('[RunSessionView] publish failed', e);
          setPublishState('error');
        }
      })();
    }, delay);

    return () => { if (publishTimer.current) clearTimeout(publishTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSignature, musicSignature, campaignId, campaignName]);

  return { publishState };
}

type UseShareActionsOptions = {
  playerLog: PlayerLogEntry[];
  playerConfig: PlayerConfig;
  setVal: (key: string, val: unknown) => void;
  setToast: (msg: string) => void;
};

export function useShareActions({
  playerLog,
  playerConfig,
  setVal,
  setToast,
}: UseShareActionsOptions) {
  const shareToPlayerLog = (text: string, mentions: Mention[] = []) => {
    const nextLog = [...playerLog, {
      id: makeLogEntryId(),
      text: text.trim(),
      mentions,
      visibility: { mode: 'party' },
      authorRef: 'gm',
      postedAtMs: Date.now(),
    }];
    setVal('playerLog', nextLog);

    if (mentions.length > 0) {
      const nextConfig = applyNarrationReveal(playerConfig, mentions, { mode: 'party' });
      setVal('player', nextConfig);
    }
    setToast('Shared with players!');
  };

  const toggleEntityShare = (type: PlayerEntityType, id: string) => {
    const ev = { ...(playerConfig.entityVisibility ?? {}) };
    const bucket = { ...(ev[type] ?? {}) };
    const curVis = bucket[id];

    if (curVis && curVis.mode === 'party') {
      delete bucket[id];
    } else {
      bucket[id] = { mode: 'party' };
    }
    ev[type] = bucket;
    setVal('player', { ...playerConfig, entityVisibility: ev });
    setToast(bucket[id] ? 'Shared with players!' : 'Removed from player view');
  };

  return { shareToPlayerLog, toggleEntityShare };
}
