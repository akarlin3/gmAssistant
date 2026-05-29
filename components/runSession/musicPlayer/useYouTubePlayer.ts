'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { PlayerState, SyncAnchor } from './types';

interface UseYouTubePlayerOptions {
  hasContent: boolean;
  playlistId: string | null;
  videoId: string | null;
  isPlayingProp?: boolean;
  playlistIndexProp?: number;
  onChangePlaying?: (v: boolean) => void;
  onChangePlaylistIndex?: (index: number) => void;
  onPublishSyncAnchor?: (anchor: SyncAnchor) => void;
  syncAnchor?: SyncAnchor | null;
  readOnly?: boolean;
  volumeKey: string;
  mutedKey: string;
}

interface UseYouTubePlayerResult {
  iframeId: string;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  isMuted: boolean;
  setIsMuted: (v: boolean) => void;
  playerState: PlayerState;
  ytPlayer: any;
  isApiReady: boolean;
  volumeRef: React.MutableRefObject<number>;
  isMutedRef: React.MutableRefObject<boolean>;
}

export function useYouTubePlayer({
  hasContent,
  playlistId,
  videoId,
  isPlayingProp,
  playlistIndexProp,
  onChangePlaying,
  onChangePlaylistIndex,
  onPublishSyncAnchor,
  syncAnchor,
  readOnly,
  volumeKey,
  mutedKey,
}: UseYouTubePlayerOptions): UseYouTubePlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>('unknown');
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);

  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  const onChangePlayingRef = useRef(onChangePlaying);
  const onChangePlaylistIndexRef = useRef(onChangePlaylistIndex);
  const playlistIdRef = useRef(playlistId);
  const videoIdRef = useRef(videoId);
  const isPlayingPropRef = useRef(isPlayingProp);
  const playlistIndexPropRef = useRef(playlistIndexProp);

  const autoResumeCountRef = useRef(0);
  const lastAutoResumeTimeRef = useRef(0);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => {
    onChangePlayingRef.current = onChangePlaying;
    onChangePlaylistIndexRef.current = onChangePlaylistIndex;
    playlistIdRef.current = playlistId;
    videoIdRef.current = videoId;
    isPlayingPropRef.current = isPlayingProp;
    playlistIndexPropRef.current = playlistIndexProp;
  });

  const lastPlaylistIdRef = useRef<string | null>(null);
  const lastVideoIdRef = useRef<string | null>(null);
  const lastPlaylistIndexRef = useRef<number | null>(null);
  const lastPlayingRef = useRef<boolean | null>(null);

  // Load persisted volume & mute state from localStorage on client-side mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedVolume = window.localStorage.getItem(volumeKey);
      if (savedVolume !== null) {
        const parsed = parseInt(savedVolume, 10);
        if (!isNaN(parsed)) setVolume(parsed);
      }
      const savedMuted = window.localStorage.getItem(mutedKey);
      if (savedMuted !== null) setIsMuted(savedMuted === 'true');
    }
  }, [volumeKey, mutedKey]);

  // Synchronize local isPlaying state with isPlayingProp
  useEffect(() => {
    if (isPlayingProp !== undefined) setIsPlaying(isPlayingProp);
  }, [isPlayingProp]);

  const uniqueId = useId();
  const iframeId = `yt-audio-player-iframe-${uniqueId.replace(/:/g, '')}`;

  // Dynamic YT Iframe Player API Loader & Binder
  useEffect(() => {
    if (!hasContent) return;
    if (ytPlayer) return;

    let player: any = null;
    let timer: NodeJS.Timeout;

    const initPlayer = () => {
      const element = document.getElementById(iframeId);
      if (!element) return;

      try {
        // @ts-ignore
        player = new window.YT.Player(iframeId, {
          height: '1',
          width: '1',
          playerVars: {
            enablejsapi: 1,
            autoplay: isPlayingPropRef.current ? 1 : 0,
          },
          events: {
            onReady: () => {
              setYtPlayer(player);
              setIsApiReady(true);
              try {
                player.setVolume(volumeRef.current);
                if (isMutedRef.current) {
                  player.mute();
                } else {
                  player.unMute();
                }

                const currentPlaylistId = playlistIdRef.current;
                const currentVideoId = videoIdRef.current;
                const currentIsPlayingProp = isPlayingPropRef.current;
                const currentPlaylistIndexProp = playlistIndexPropRef.current;

                if (currentPlaylistId) {
                  if (currentIsPlayingProp) {
                    player.loadPlaylist(currentPlaylistId, currentPlaylistIndexProp || 0);
                  } else {
                    player.cuePlaylist(currentPlaylistId, currentPlaylistIndexProp || 0);
                  }
                  player.setShuffle(true);
                } else if (currentVideoId) {
                  if (currentIsPlayingProp) {
                    player.loadVideoById(currentVideoId);
                  } else {
                    player.cueVideoById(currentVideoId);
                  }
                }

                lastPlaylistIdRef.current = currentPlaylistId;
                lastVideoIdRef.current = currentVideoId;
                lastPlaylistIndexRef.current = currentPlaylistIndexProp || 0;
                lastPlayingRef.current = !!currentIsPlayingProp;
              } catch (err) {
                console.warn('Could not read initial player settings', err);
              }
            },
            onStateChange: (event: any) => {
              // @ts-ignore
              const states = window.YT.PlayerState;
              if (event.data === states.PLAYING) {
                setPlayerState('playing');
                setIsPlaying(true);
                onChangePlayingRef.current?.(true);
                autoResumeCountRef.current = 0;
                try {
                  const idx = event.target.getPlaylistIndex();
                  if (typeof idx === 'number' && idx >= 0) {
                    onChangePlaylistIndexRef.current?.(idx);
                    lastPlaylistIndexRef.current = idx;
                  }
                } catch (err) {
                  console.warn('Could not read playlist index on state change', err);
                }
              } else if (event.data === states.PAUSED) {
                setPlayerState('paused');
                setIsPlaying(false);

                if (isPlayingPropRef.current) {
                  const now = Date.now();
                  if (now - lastAutoResumeTimeRef.current > 2000) {
                    autoResumeCountRef.current = 0;
                  }

                  if (autoResumeCountRef.current < 3) {
                    autoResumeCountRef.current += 1;
                    lastAutoResumeTimeRef.current = now;
                    console.warn(`[MusicPlayer] Automatic pause detected while playing. Attempting auto-resume (attempt ${autoResumeCountRef.current}/3)`);
                    const targetPlayer = event.target;
                    setTimeout(() => {
                      try {
                        if (isPlayingPropRef.current) targetPlayer.playVideo();
                      } catch (err) {
                        console.warn('[MusicPlayer] Failed to play video on auto-resume', err);
                      }
                    }, 500);
                  } else {
                    console.warn('[MusicPlayer] Auto-resume limit reached. Autoplay may be blocked by the browser or adblocker.');
                  }
                }
              } else if (event.data === states.BUFFERING) {
                setPlayerState('buffering');
              } else if (event.data === states.ENDED) {
                setPlayerState('ended');
                if (playlistIdRef.current) {
                  const targetPlayer = event.target;
                  setTimeout(() => {
                    try {
                      const curr = targetPlayer.getPlayerState();
                      // @ts-ignore
                      const currStates = window.YT.PlayerState;
                      if (curr === currStates.PLAYING || curr === currStates.BUFFERING) return;

                      let idx = -1;
                      let len = 0;
                      try { idx = targetPlayer.getPlaylistIndex?.() ?? -1; } catch {}
                      try { len = targetPlayer.getPlaylist?.()?.length ?? 0; } catch {}
                      const atEnd = typeof idx === 'number' && len > 0 && idx >= len - 1;
                      if (!atEnd && isPlayingPropRef.current) {
                        console.warn('[MusicPlayer] track ended early; advancing playlist', { idx, len });
                        targetPlayer.nextVideo();
                        return;
                      }

                      console.warn('[MusicPlayer] playlist ended; stopping session playback', { idx, len });
                      setIsPlaying(false);
                      onChangePlayingRef.current?.(false);
                    } catch (err) {
                      setIsPlaying(false);
                      onChangePlayingRef.current?.(false);
                    }
                  }, 2000);
                } else {
                  setIsPlaying(false);
                  onChangePlayingRef.current?.(false);
                }
              } else if (event.data === states.UNSTARTED) {
                setPlayerState('unstarted');
              }
            },
            onError: (event: any) => {
              console.warn('[MusicPlayer] YT player error', event?.data);
              try {
                if (playlistIdRef.current && isPlayingPropRef.current) {
                  event.target.nextVideo();
                }
              } catch (err) {
                console.warn('[MusicPlayer] failed to skip errored track', err);
              }
            },
          },
        });
      } catch (e) {
        console.error('Failed to instantiate YT Player', e);
      }
    };

    // @ts-ignore
    if (!window.YT || !window.YT.Player) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
      // @ts-ignore
      window.onYouTubeIframeAPIReady = () => { initPlayer(); };
    } else {
      timer = setTimeout(() => { initPlayer(); }, 500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (player && typeof player.destroy === 'function') {
        try { player.destroy(); } catch (e) { console.warn('Error destroying player', e); }
      }
      setYtPlayer(null);
      setIsPlaying(false);
      setIsApiReady(false);
      setPlayerState('unknown');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContent]);

  // Synchronize underlying YT Player with prop updates in-place
  useEffect(() => {
    if (!ytPlayer || !isApiReady) return;

    const iframe = typeof ytPlayer.getIframe === 'function' ? ytPlayer.getIframe() : null;
    if (!iframe || !document.body.contains(iframe)) return;

    try {
      ytPlayer.setVolume(volumeRef.current);
      if (isMutedRef.current) { ytPlayer.mute(); } else { ytPlayer.unMute(); }

      const playlistIdChanged = playlistId !== lastPlaylistIdRef.current;
      const videoIdChanged = videoId !== lastVideoIdRef.current;

      if (playlistIdChanged || videoIdChanged) {
        if (playlistId) {
          if (isPlayingProp) {
            ytPlayer.loadPlaylist(playlistId, playlistIndexProp || 0);
          } else {
            ytPlayer.cuePlaylist(playlistId, playlistIndexProp || 0);
          }
          ytPlayer.setShuffle(true);
        } else if (videoId) {
          if (isPlayingProp) { ytPlayer.loadVideoById(videoId); }
          else { ytPlayer.cueVideoById(videoId); }
        }

        lastPlaylistIdRef.current = playlistId;
        lastVideoIdRef.current = videoId;
        lastPlaylistIndexRef.current = playlistIndexProp ?? 0;
        lastPlayingRef.current = isPlayingProp ?? false;
        return;
      }

      if (playlistId && typeof playlistIndexProp === 'number' && playlistIndexProp >= 0) {
        const indexChanged = playlistIndexProp !== lastPlaylistIndexRef.current;
        if (indexChanged) {
          let isActuallyPlaying = false;
          try {
            // @ts-ignore
            const states = window.YT?.PlayerState;
            isActuallyPlaying = states && ytPlayer.getPlayerState() === states.PLAYING;
          } catch (err) {}

          if (isActuallyPlaying) {
            lastPlaylistIndexRef.current = playlistIndexProp;
          } else {
            if (isPlayingProp) {
              ytPlayer.playVideoAt(playlistIndexProp);
            } else {
              ytPlayer.cuePlaylist({ listType: 'playlist', list: playlistId, index: playlistIndexProp });
            }
            lastPlaylistIndexRef.current = playlistIndexProp;
            lastPlayingRef.current = isPlayingProp ?? false;
            return;
          }
        }
      }

      if (isPlayingProp !== lastPlayingRef.current) {
        // @ts-ignore
        const states = window.YT.PlayerState;
        const currentPlayerState = ytPlayer.getPlayerState();

        if (isPlayingProp && currentPlayerState !== states.PLAYING) {
          ytPlayer.playVideo();
        } else if (!isPlayingProp && currentPlayerState === states.PLAYING) {
          ytPlayer.pauseVideo();
        }
        lastPlayingRef.current = isPlayingProp ?? false;
      }
    } catch (e) {
      console.warn('Failed to sync YT player with prop state in-place', e);
    }
  }, [playlistId, videoId, playlistIndexProp, isPlayingProp, ytPlayer, isApiReady]);

  // GM: publish playback sync anchors
  const onPublishSyncAnchorRef = useRef(onPublishSyncAnchor);
  useEffect(() => { onPublishSyncAnchorRef.current = onPublishSyncAnchor; });

  const publishAnchor = (player: any) => {
    if (!onPublishSyncAnchorRef.current || !player) return;
    try {
      const positionSec = typeof player.getCurrentTime === 'function' ? Number(player.getCurrentTime()) || 0 : 0;
      const rawIdx = typeof player.getPlaylistIndex === 'function' ? player.getPlaylistIndex() : -1;
      const playlistIndex = typeof rawIdx === 'number' && rawIdx >= 0 ? rawIdx : (playlistIndexPropRef.current ?? 0);
      onPublishSyncAnchorRef.current({ positionSec, anchorWallTimeMs: Date.now(), playlistIndex });
    } catch (e) {
      console.warn('Failed to publish sync anchor', e);
    }
  };

  useEffect(() => {
    if (readOnly || !ytPlayer || !isApiReady || !isPlayingProp) return;
    publishAnchor(ytPlayer);
    const id = setInterval(() => publishAnchor(ytPlayer), 15000);
    return () => clearInterval(id);
  }, [readOnly, ytPlayer, isApiReady, isPlayingProp, playlistId, videoId, playlistIndexProp]);

  // Player: receive sync anchor, seek when local playback drifts > tolerance
  useEffect(() => {
    if (!readOnly || !ytPlayer || !isApiReady || !syncAnchor || !isPlayingProp) return;

    const TOLERANCE_SEC = 2;

    const correctDrift = () => {
      try {
        if (typeof ytPlayer.getCurrentTime !== 'function') return;
        const ytIdx = typeof ytPlayer.getPlaylistIndex === 'function' ? ytPlayer.getPlaylistIndex() : -1;
        if (typeof ytIdx === 'number' && ytIdx >= 0 && ytIdx !== syncAnchor.playlistIndex) return;

        const expected = syncAnchor.positionSec + (Date.now() - syncAnchor.anchorWallTimeMs) / 1000;
        if (expected < 0) return;
        const current = Number(ytPlayer.getCurrentTime()) || 0;
        if (Math.abs(current - expected) > TOLERANCE_SEC) {
          ytPlayer.seekTo(expected, true);
        }
      } catch (e) {
        console.warn('Failed to correct music drift', e);
      }
    };

    correctDrift();
    const id = setInterval(correctDrift, 5000);
    return () => clearInterval(id);
  }, [readOnly, ytPlayer, isApiReady, isPlayingProp, syncAnchor]);

  return {
    iframeId,
    isPlaying,
    setIsPlaying,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    playerState,
    ytPlayer,
    isApiReady,
    volumeRef,
    isMutedRef,
  };
}
