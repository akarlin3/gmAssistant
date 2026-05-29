'use client';

import { useEffect, useRef, useMemo } from 'react';
import { publishProjections } from '@/lib/playerMode/publish';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';

/**
 * Auto-publishes player-facing projections whenever campaign content or music
 * state changes. Debounced by 1.5 s for content; 100 ms for music-only.
 */
export function useAutoPublish(
  campaignId: string,
  name: string,
  playerConfig: PlayerConfig,
  playerLog: PlayerLogEntry[],
  get: (k: string, fb: any) => any,
  sessionPlaylistAnchor: { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null,
) {
  const prevContentSignatureRef = useRef('');
  const prevMusicSignatureRef = useRef('');

  const contentSignature = useMemo(
    () => JSON.stringify({
      p: playerConfig,
      pcs: get('pcs', []),
      n: get('npcs', []),
      l: get('locations', []),
      f: get('factions', []),
      c: get('characters', []),
      k: get('clocks', []),
      h: get('handouts', ''),
      s: playerLog,
      i: get('items', []),
      g: get('pcGoals', []),
      m: get('maps', []),
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

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const dataToPublish = {
            player: playerConfig,
            pcs: get('pcs', []),
            npcs: get('npcs', []),
            locations: get('locations', []),
            factions: get('factions', []),
            characters: get('characters', []),
            clocks: get('clocks', []),
            handouts: get('handouts', ''),
            playerLog,
            items: get('items', []),
            pcGoals: get('pcGoals', []),
            maps: get('maps', []),
            __sessionPlaylist: get('__sessionPlaylist', '') as string,
            __sessionPlaylistPlaying: !!get('__sessionPlaylistPlaying', false),
            __sessionPlaylistIndex: get('__sessionPlaylistIndex', 0) as number,
            __sessionPlaylistAnchor: sessionPlaylistAnchor ?? undefined,
          };
          await publishProjections(campaignId, name || 'Campaign', dataToPublish);
        } catch (e) {
          console.error('[CampaignEditor] auto-publish failed', e);
        }
      })();
    }, delay);

    return () => clearTimeout(timer);
  }, [contentSignature, musicSignature, campaignId, name, playerLog, playerConfig, get, sessionPlaylistAnchor]);

  return { contentSignature, musicSignature, prevContentSignatureRef, prevMusicSignatureRef };
}
