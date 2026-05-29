'use client';

// Extracted verbatim from RunSessionView.tsx. All effects, refs, dependency
// arrays, timings (15s publish interval, 5s drift check, 2s tolerance, 2s
// ENDED recovery delay, 500ms init delay), and the YT IFrame sync logic are
// preserved exactly.
import { useEffect, useId, useRef, useState } from 'react';
import {
  ExternalLink, Loader2, Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X,
} from 'lucide-react';
import { DEFAULT_SCENARIOS, parseYoutubeUrl } from './helpers';

type SyncAnchor = { positionSec: number; anchorWallTimeMs: number; playlistIndex: number };

export function MusicPlayer({
  playlistUrl,
  onChangePlaylist,
  readOnly = false,
  isPlayingProp,
  onChangePlaying,
  playlists,
  onChangePlaylists,
  playlistIndexProp,
  onChangePlaylistIndex,
  onPublishSyncAnchor,
  syncAnchor,
}: {
  playlistUrl: string;
  onChangePlaylist?: (v: string) => void;
  readOnly?: boolean;
  isPlayingProp?: boolean;
  onChangePlaying?: (v: boolean) => void;
  playlists?: Array<{ id: string; name: string; url: string }>;
  onChangePlaylists?: (v: Array<{ id: string; name: string; url: string }>) => void;
  playlistIndexProp?: number;
  onChangePlaylistIndex?: (index: number) => void;
  onPublishSyncAnchor?: (anchor: SyncAnchor) => void;
  syncAnchor?: SyncAnchor | null;
}) {
  const { playlistId, videoId } = parseYoutubeUrl(playlistUrl);
  const hasContent = !!playlistId || !!videoId;

  const volumeKey = readOnly ? 'gmbuilder_player_music_player_volume' : 'gmbuilder_gm_music_player_volume';
  const mutedKey = readOnly ? 'gmbuilder_player_music_player_muted' : 'gmbuilder_gm_music_player_muted';

  const [inputUrl, setInputUrl] = useState(playlistUrl);
  const [error, setError] = useState('');

  // Player state variables for readOnly mode
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50); // Safe default background volume
  const [isMuted, setIsMuted] = useState(false);
  const [playerState, setPlayerState] = useState<'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'unknown'>('unknown');
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);

  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  // Prop/callback refs to avoid effect recreation and race conditions
  const onChangePlayingRef = useRef(onChangePlaying);
  const onChangePlaylistIndexRef = useRef(onChangePlaylistIndex);
  const playlistIdRef = useRef(playlistId);
  const videoIdRef = useRef(videoId);
  const isPlayingPropRef = useRef(isPlayingProp);
  const playlistIndexPropRef = useRef(playlistIndexProp);

  const autoResumeCountRef = useRef(0);
  const lastAutoResumeTimeRef = useRef(0);

  // Keep refs in sync with latest state/props on every render
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    onChangePlayingRef.current = onChangePlaying;
    onChangePlaylistIndexRef.current = onChangePlaylistIndex;
    playlistIdRef.current = playlistId;
    videoIdRef.current = videoId;
    isPlayingPropRef.current = isPlayingProp;
    playlistIndexPropRef.current = playlistIndexProp;
  });

  // Track the actual current state of the YouTube Player to perform minimal/correct changes
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
        if (!isNaN(parsed)) {
          setVolume(parsed);
        }
      }
      const savedMuted = window.localStorage.getItem(mutedKey);
      if (savedMuted !== null) {
        setIsMuted(savedMuted === 'true');
      }
    }
  }, [volumeKey, mutedKey]);

  // Playlists scenario management
  const activePlaylists = playlists && playlists.length > 0 ? playlists : DEFAULT_SCENARIOS;
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioUrl, setNewScenarioUrl] = useState('');

  const handleSavePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim() || !newScenarioUrl.trim()) return;
    const nextPlaylists = [
      ...activePlaylists,
      {
        id: `pl_${Date.now()}`,
        name: newScenarioName.trim(),
        url: newScenarioUrl.trim(),
      },
    ];
    if (onChangePlaylists) {
      onChangePlaylists(nextPlaylists);
    }
    setNewScenarioName('');
    setNewScenarioUrl('');
    setShowAddForm(false);
  };

  const handleDeletePlaylist = (id: string) => {
    const nextPlaylists = activePlaylists.filter((pl) => pl.id !== id);
    if (onChangePlaylists) {
      onChangePlaylists(nextPlaylists);
    }
  };

  useEffect(() => {
    setInputUrl(playlistUrl);
  }, [playlistUrl]);

  // Synchronize local isPlaying state with isPlayingProp
  useEffect(() => {
    if (isPlayingProp !== undefined) {
      setIsPlaying(isPlayingProp);
    }
  }, [isPlayingProp]);

  const uniqueId = useId();
  const iframeId = `yt-audio-player-iframe-${uniqueId.replace(/:/g, '')}`;

  // Dynamic YT Iframe Player API Loader & Binder (Stable mount / single init based on content existence)
  useEffect(() => {
    if (!hasContent) {
      return;
    }
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

                // Initialize tracking refs
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
                autoResumeCountRef.current = 0; // Reset auto-resume counter on successful playback
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
                // Don't propagate auto-pauses to players. Only an explicit
                // GM click on the pause button publishes paused=false (handled
                // in togglePlay), so YT auto-pausing for any other reason
                // (volume going to 0 on some browsers, transient network
                // hiccups, etc.) keeps players' music flowing.

                // --- AUTO-RESUME FOR UNEXPECTED AUTO-PAUSES ---
                // If the session is supposed to be playing (isPlayingPropRef is true)
                // but the player transitioned to PAUSED automatically (i.e. not via
                // explicit GM pause), try to auto-resume.
                if (isPlayingPropRef.current) {
                  const now = Date.now();
                  // Reset retry counter if enough time has passed since the last attempt
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
                        if (isPlayingPropRef.current) {
                          targetPlayer.playVideo();
                        }
                      } catch (err) {
                        console.warn('[MusicPlayer] Failed to play video on auto-resume', err);
                      }
                    }, 500); // Small delay to let the iframe settle
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
                      // The player auto-advanced to the next track — nothing to do.
                      if (curr === currStates.PLAYING || curr === currStates.BUFFERING) return;

                      // The player is idle after a track ended. Before tearing
                      // down the whole session's playback (which also stops every
                      // connected player), try to continue the playlist. A single
                      // unplayable / embedding-restricted track — common with
                      // music.youtube.com playlists in the IFrame player — would
                      // otherwise end the session a few seconds after it starts.
                      let idx = -1;
                      let len = 0;
                      try { idx = targetPlayer.getPlaylistIndex?.() ?? -1; } catch {}
                      try { len = targetPlayer.getPlaylist?.()?.length ?? 0; } catch {}
                      const atEnd = typeof idx === 'number' && len > 0 && idx >= len - 1;
                      if (!atEnd && isPlayingPropRef.current) {
                        console.warn('[MusicPlayer] track ended early; advancing playlist', { idx, len });
                        targetPlayer.nextVideo();
                        return; // keep the session playing
                      }

                      // Genuine end of the playlist (or we couldn't recover).
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
              // The IFrame API surfaces playback errors here (2 = bad param,
              // 5 = HTML5 error, 100 = removed, 101/150 = embedding disabled).
              // Previously there was no handler, so an unplayable track failed
              // silently and the player went idle — stopping the session for
              // everyone a few seconds after it started. For a playlist, skip
              // the offending track and keep going instead of dying.
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

    // Load API dynamically
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
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      timer = setTimeout(() => {
        initPlayer();
      }, 500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (e) {
          console.warn('Error destroying player', e);
        }
      }
      setYtPlayer(null);
      setIsPlaying(false);
      setIsApiReady(false);
      setPlayerState('unknown');
    };
    // Intentionally only depends on hasContent: including ytPlayer would cause
    // the cleanup (which resets ytPlayer to null) to re-trigger this effect,
    // destroying and recreating the player in a loop and leaving the UI stuck
    // on the loading spinner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContent]);

  // Synchronize underlying YT Player with prop updates in-place
  useEffect(() => {
    if (!ytPlayer || !isApiReady) return;

    // Guard against a destroyed or unmounted player iframe to prevent internal YT API crashes
    const iframe = typeof ytPlayer.getIframe === 'function' ? ytPlayer.getIframe() : null;
    if (!iframe || !document.body.contains(iframe)) return;

    try {
      // 1. Ensure volume and mute are set
      ytPlayer.setVolume(volumeRef.current);
      if (isMutedRef.current) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
      }

      // 2. Check if the playlist or video itself changed
      const playlistIdChanged = playlistId !== lastPlaylistIdRef.current;
      const videoIdChanged = videoId !== lastVideoIdRef.current;

      if (playlistIdChanged || videoIdChanged) {
        // Track has changed, perform full load/cue
        if (playlistId) {
          if (isPlayingProp) {
            ytPlayer.loadPlaylist(playlistId, playlistIndexProp || 0);
          } else {
            ytPlayer.cuePlaylist(playlistId, playlistIndexProp || 0);
          }
          ytPlayer.setShuffle(true);
        } else if (videoId) {
          if (isPlayingProp) {
            ytPlayer.loadVideoById(videoId);
          } else {
            ytPlayer.cueVideoById(videoId);
          }
        }

        lastPlaylistIdRef.current = playlistId;
        lastVideoIdRef.current = videoId;
        lastPlaylistIndexRef.current = playlistIndexProp ?? 0;
        lastPlayingRef.current = isPlayingProp ?? false;
        return; // Since load/cue resets play/pause/index, return early
      }

      // 3. If track/playlist didn't change, check if index changed (for playlists)
      if (playlistId && typeof playlistIndexProp === 'number' && playlistIndexProp >= 0) {
        const indexChanged = playlistIndexProp !== lastPlaylistIndexRef.current;
        if (indexChanged) {
          // Ignore automatic/shuffled index changes while the player is already
          // playing — for BOTH the GM and players. The incoming index prop is an
          // echo of the GM player's own `getPlaylistIndex()` (published from the
          // PLAYING onStateChange handler), and YouTube's shuffle reports indices
          // in shuffled order while `playVideoAt` expects original order, so
          // re-seeking here just restarts/jumps the current track every few
          // seconds in a feedback loop (the GM's "music pauses after a few
          // seconds" bug). Explicit GM skips go through nextVideo()/previousVideo()
          // directly, never this path, so playback control is unaffected.
          let isActuallyPlaying = false;
          try {
            // @ts-ignore
            const states = window.YT?.PlayerState;
            isActuallyPlaying = states && ytPlayer.getPlayerState() === states.PLAYING;
          } catch (err) {
            // Safe fallback
          }

          if (isActuallyPlaying) {
            lastPlaylistIndexRef.current = playlistIndexProp;
          } else {
            if (isPlayingProp) {
              ytPlayer.playVideoAt(playlistIndexProp);
            } else {
              // Recue at index when paused
              ytPlayer.cuePlaylist({
                listType: 'playlist',
                list: playlistId,
                index: playlistIndexProp
              });
            }
            lastPlaylistIndexRef.current = playlistIndexProp;
            lastPlayingRef.current = isPlayingProp ?? false;
            return;
          }
        }
      }

      // 4. Check if play/pause state changed
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

  // --- GM DJ: publish playback sync anchors so players can match the GM's
  // position. We publish on play start, on track change, and every 15s during
  // playback. Players auto-seek when drift exceeds tolerance.
  const onPublishSyncAnchorRef = useRef(onPublishSyncAnchor);
  useEffect(() => { onPublishSyncAnchorRef.current = onPublishSyncAnchor; });

  const publishAnchor = (player: any) => {
    if (!onPublishSyncAnchorRef.current || !player) return;
    try {
      const positionSec = typeof player.getCurrentTime === 'function' ? Number(player.getCurrentTime()) || 0 : 0;
      const rawIdx = typeof player.getPlaylistIndex === 'function' ? player.getPlaylistIndex() : -1;
      const playlistIndex = typeof rawIdx === 'number' && rawIdx >= 0 ? rawIdx : (playlistIndexPropRef.current ?? 0);
      onPublishSyncAnchorRef.current({
        positionSec,
        anchorWallTimeMs: Date.now(),
        playlistIndex,
      });
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

  // --- Player: receive sync anchor, seek when local playback drifts > tolerance.
  // We also re-check drift on a short interval to absorb buffering/jitter.
  useEffect(() => {
    if (!readOnly || !ytPlayer || !isApiReady || !syncAnchor || !isPlayingProp) return;

    const TOLERANCE_SEC = 2;

    const correctDrift = () => {
      try {
        if (typeof ytPlayer.getCurrentTime !== 'function') return;
        const ytIdx = typeof ytPlayer.getPlaylistIndex === 'function' ? ytPlayer.getPlaylistIndex() : -1;
        // If we're on a different track than the anchor refers to, leave it —
        // playlistIndexProp handles track-level alignment separately.
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

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !onChangePlaylist) return;
    setError('');
    const { playlistId: pId, videoId: vId } = parseYoutubeUrl(inputUrl);
    if (!pId && !vId) {
      setError('Invalid YouTube playlist or video URL. Please enter a valid link.');
      return;
    }
    onChangePlaylist(inputUrl);
  };

  const handleDisconnect = () => {
    if (readOnly || !onChangePlaylist) return;
    setInputUrl('');
    onChangePlaylist('');
    setError('');
  };

  // Playback Control Handlers
  const togglePlay = () => {
    if (!ytPlayer) return;
    if (isPlaying) {
      ytPlayer.pauseVideo();
      // Explicit user pause — publish paused=false to players. (The PAUSED
      // onStateChange branch intentionally no longer publishes, so this is
      // the only path that pauses player music.)
      onChangePlayingRef.current?.(false);
    } else {
      ytPlayer.playVideo();
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(mutedKey, String(nextMuted));
    }
    if (ytPlayer) {
      if (nextMuted) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseInt(e.target.value, 10);
    setVolume(nextVolume);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(volumeKey, String(nextVolume));
    }
    if (ytPlayer) {
      ytPlayer.setVolume(nextVolume);
      if (nextVolume > 0 && isMuted) {
        ytPlayer.unMute();
        setIsMuted(false);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(mutedKey, 'false');
        }
      }
    }
  };

  const renderScenarios = () => {
    if (readOnly) return null;
    return (
      <div className="space-y-2 rounded-lg border border-rule/60 bg-parchment/40 p-3 shadow-inner">
        <div className="flex items-center justify-between">
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            Scenario Playlists
          </span>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="rounded border border-brass-deep/45 bg-brass/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep transition-all hover:bg-brass hover:text-parchment"
          >
            + Add Scenario
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSavePlaylist} className="mt-2 space-y-2 rounded border border-rule/50 bg-parchment p-2.5 shadow-sm">
            <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
              Add Custom Scenario
            </div>
            <div className="space-y-1">
              <input
                type="text"
                required
                placeholder="Scenario Name (e.g. Boss Battle)"
                value={newScenarioName}
                onChange={(e) => setNewScenarioName(e.target.value)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[11px] text-ink focus:border-crimson focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="YouTube Playlist or Video URL"
                value={newScenarioUrl}
                onChange={(e) => setNewScenarioUrl(e.target.value)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[11px] text-ink focus:border-crimson focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded border border-rule px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-ink-soft transition-all hover:bg-parchment-deep"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded border border-crimson/50 bg-crimson/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-crimson transition-all hover:bg-crimson hover:text-parchment"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 gap-2">
          {activePlaylists.map((pl) => {
            const isActive = playlistUrl === pl.url;
            return (
              <div
                key={pl.id}
                className={`group relative flex items-center justify-between rounded border p-2 font-serif text-xs transition-all ${
                  isActive
                    ? 'border-crimson/50 bg-crimson/5 font-medium text-crimson shadow-sm'
                    : 'border-rule bg-parchment/65 text-ink-soft hover:bg-parchment'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (onChangePlaylist) onChangePlaylist(pl.url);
                  }}
                  className="flex-1 truncate pr-5 text-left font-serif"
                  title={pl.name}
                >
                  {pl.name}
                </button>
                {!['tavern', 'combat', 'dungeon', 'creepy'].includes(pl.id) && (
                  <button
                    type="button"
                    onClick={() => handleDeletePlaylist(pl.id)}
                    className="absolute right-1 text-ink-mute opacity-0 transition-opacity hover:text-crimson group-hover:opacity-100"
                    title="Delete scenario"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (readOnly) {
    if (!playlistId && !videoId) {
      return (
        <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-rule/70 bg-parchment-soft px-4 py-2.5 font-serif text-xs italic text-ink-mute shadow-sm">
          No session music is playing.
        </div>
      );
    }

    let embedUrl = '';
    if (playlistId) {
      if (videoId) {
        embedUrl = `https://www.youtube.com/embed/${videoId}?list=${playlistId}&enablejsapi=1`;
      } else {
        embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1`;
      }
    } else if (videoId) {
      embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    }

    // Browser autoplay policy blocks audio playback without a user gesture.
    // When the GM is playing but the local YT iframe couldn't auto-start, we
    // surface a tap-to-play button so the click counts as the required gesture.
    const autoplayBlocked = isApiReady && !!isPlayingProp && !isPlaying && playerState !== 'buffering';

    return (
      <div className="flex flex-row items-center justify-between gap-4 overflow-hidden rounded-lg border border-rule/70 bg-parchment-soft px-4 py-2.5 text-xs shadow-sm">
        {/* Left Side: Status / Music Icon / Small Label */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex flex-shrink-0 items-center justify-center">
            {autoplayBlocked ? (
              <button
                type="button"
                onClick={togglePlay}
                className="flex size-6 items-center justify-center rounded-full bg-crimson text-parchment shadow-sm transition-all hover:bg-wine active:scale-95"
                title="Your browser blocked autoplay — tap to start music"
                aria-label="Start music"
              >
                <Play size={11} fill="currentColor" className="ml-0.5" />
              </button>
            ) : (
              <>
                <Music className={`${isPlaying ? 'animate-pulse text-crimson' : 'text-ink-mute'}`} size={16} />
                {isPlaying && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-crimson opacity-75"></span>
                    <span className="relative inline-flex size-2 rounded-full bg-crimson"></span>
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-ink">
              Live Music
            </span>
            <span className="size-1.5 rounded-full bg-rule/70" />
            <span className={`truncate font-serif text-xs italic text-ink-soft`}>
              {playerState === 'buffering'
                ? 'Buffering...'
                : isPlaying
                  ? 'Playing'
                  : autoplayBlocked
                    ? 'Tap ▶ to play'
                    : 'Paused'}
            </span>
          </div>
        </div>

        {/* Right Side: Volume Controls */}
        <div className="flex w-32 flex-shrink-0 items-center justify-end gap-2.5 sm:w-44">
          <button
            type="button"
            onClick={toggleMute}
            className="flex-shrink-0 p-1 text-ink-mute transition-colors hover:text-crimson focus:outline-none"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-rule/50 accent-crimson focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Bulletproof hidden off-screen container */}
        <div className="absolute overflow-hidden" style={{ width: '1px', height: '1px', opacity: 0.01, left: '-9999px', top: '-9999px' }}>
          <div id={iframeId} />
        </div>
      </div>
    );
  }

  if (playlistId || videoId) {
    let embedUrl = '';
    if (playlistId) {
      if (videoId) {
        embedUrl = `https://www.youtube.com/embed/${videoId}?list=${playlistId}&enablejsapi=1`;
      } else {
        embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1`;
      }
    } else if (videoId) {
      embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    }

    let externalUrl = '';
    if (playlistUrl.startsWith('http')) {
      externalUrl = playlistUrl;
    } else {
      if (playlistId) {
        externalUrl = `https://music.youtube.com/playlist?list=${playlistId}`;
      } else if (videoId) {
        externalUrl = `https://music.youtube.com/watch?v=${videoId}`;
      }
    }
    const ytNormalUrl = externalUrl.replace('music.youtube.com', 'www.youtube.com');

    // --- Unified Audio-Only Premium Player ---
    return (
      <div className="space-y-4">
        <style>{`
          @keyframes yt-soundwave {
            0%, 100% { height: 4px; }
            50% { height: 24px; }
          }
          .yt-wave-bar {
            width: 3px;
            border-radius: 9999px;
            background-color: #b1201e;
            height: 4px;
          }
          .yt-wave-bar.animating {
            animation: yt-soundwave 1.2s ease-in-out infinite;
          }
        `}</style>

        <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-lg border border-rule/70 bg-parchment/65 p-4 shadow-inner backdrop-blur-md sm:flex-row">
          {/* Spinning Vinyl Record Visual */}
          <div className="relative flex size-24 flex-shrink-0 items-center justify-center sm:size-28">
            <div
              className={`relative flex size-20 items-center justify-center overflow-hidden rounded-full border-2 border-neutral-700 bg-neutral-900 shadow-lg transition-transform duration-300 sm:size-24 ${
                isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''
              }`}
              style={{
                backgroundImage: 'radial-gradient(circle, #333 10%, #111 30%, #222 40%, #111 60%, #333 70%, #111 80%, #000 100%)',
                animationPlayState: isPlaying ? 'running' : 'paused'
              }}
            >
              {/* Concentric Grooves */}
              <div className="absolute inset-2 rounded-full border border-neutral-800 opacity-60" />
              <div className="absolute inset-4 rounded-full border border-neutral-800 opacity-40" />
              <div className="absolute inset-6 rounded-full border border-neutral-800 opacity-30" />
              <div className="absolute inset-8 rounded-full border border-neutral-800 opacity-20" />

              {/* Vinyl Label */}
              <div className="relative flex size-8 items-center justify-center rounded-full border border-brass-deep/45 bg-brass/30 shadow-inner">
                <div className="flex size-2.5 items-center justify-center rounded-full border border-brass/50 bg-parchment-soft">
                  <div className="size-1 rounded-full bg-neutral-950" />
                </div>
              </div>
            </div>

            {/* Audio tone arm / needle overlay */}
            <div className={`pointer-events-none absolute right-2 top-1 h-10 w-7 origin-[20%_10%] transition-transform duration-500 ${
              isPlaying ? 'rotate-12' : 'rotate-0'
            }`}>
              <svg viewBox="0 0 30 40" fill="none" className="size-full text-brass-deep drop-shadow-sm">
                <path d="M 5 5 Q 15 5 15 15 L 20 30 L 25 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="5" cy="5" r="3.5" fill="currentColor" />
                <rect x="22" y="28" width="5" height="6" rx="1.5" fill="#444" />
              </svg>
            </div>
          </div>

          {/* Custom Control Layout */}
          <div className="w-full flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-sm font-semibold tracking-wide text-ink">
                  Campaign Atmosphere
                </h3>
                <p className="truncate font-serif text-[11px] italic text-ink-soft">
                  Live Broadcast from GM
                </p>
              </div>

              {/* Pulse Glow Light */}
              <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-rule/50 bg-parchment px-2 py-0.5 shadow-sm">
                <span className="relative flex size-2">
                  <span className={`absolute inline-flex size-full animate-ping rounded-full bg-crimson opacity-75 ${isPlaying ? 'running' : 'paused'}`}></span>
                  <span className="relative inline-flex size-2 rounded-full bg-crimson"></span>
                </span>
                <span className="font-display text-[9px] font-semibold uppercase tracking-wider text-ink-mute">
                  {playerState === 'buffering' ? 'Buffering' : isPlaying ? 'Live' : 'Paused'}
                </span>
              </div>
            </div>

            {/* sound wave visualizer */}
            <div className="flex h-7 items-end gap-1 rounded border border-rule/30 bg-parchment-soft/40 px-1 pt-1 shadow-inner">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => {
                const delay = `${0.08 * i}s`;
                const duration = `${0.6 + Math.random() * 0.7}s`;
                return (
                  <div
                    key={i}
                    className={`yt-wave-bar ${isPlaying ? 'animating' : ''}`}
                    style={{
                      animationDelay: isPlaying ? delay : '0s',
                      animationDuration: isPlaying ? duration : '0s'
                    }}
                  />
                );
              })}
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Skip Back (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => ytPlayer?.previousVideo()}
                    disabled={!isApiReady || !ytPlayer}
                    className="flex size-8 items-center justify-center rounded-full border border-rule bg-parchment text-brass-deep transition-all hover:bg-parchment-deep disabled:opacity-50"
                    aria-label="Previous song"
                  >
                    <SkipBack size={14} fill="currentColor" />
                  </button>
                )}

                {/* Play/Pause Button (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!isApiReady}
                    className="flex size-9 items-center justify-center rounded-full bg-crimson text-parchment shadow-md transition-all hover:scale-105 hover:bg-wine active:scale-95 disabled:opacity-50"
                    aria-label={isPlaying ? 'Pause music' : 'Play music'}
                  >
                    {!isApiReady ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : isPlaying ? (
                      <Pause size={16} fill="currentColor" />
                    ) : (
                      <Play size={16} className="ml-0.5" fill="currentColor" />
                    )}
                  </button>
                )}

                {/* Skip Forward (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => ytPlayer?.nextVideo()}
                    disabled={!isApiReady || !ytPlayer}
                    className="flex size-8 items-center justify-center rounded-full border border-rule bg-parchment text-brass-deep transition-all hover:bg-parchment-deep disabled:opacity-50"
                    aria-label="Next song"
                  >
                    <SkipForward size={14} fill="currentColor" />
                  </button>
                )}

                {/* Play on YouTube External Links (GM Only) */}
                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded border border-rule bg-parchment px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors hover:bg-parchment-deep"
                    >
                      <ExternalLink size={10} /> YouTube Music
                    </a>
                    <a
                      href={ytNormalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded border border-rule bg-parchment px-2 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors hover:bg-parchment-deep"
                    >
                      <ExternalLink size={10} /> standard YouTube
                    </a>
                  </div>
                )}

                {/* Disconnect Playlist (GM Only) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="rounded border border-crimson/30 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-crimson transition-colors hover:border-wine/50 hover:text-wine"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Volume Controls */}
              <div className="flex w-32 flex-shrink-0 items-center justify-end gap-2.5 sm:w-44">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex-shrink-0 p-1 text-ink-mute transition-colors hover:text-crimson focus:outline-none"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-rule/50 accent-crimson focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Scenarios / Multiple Playlists List */}
        {renderScenarios()}

        {/* Bulletproof hidden off-screen container */}
        <div className="absolute overflow-hidden" style={{ width: '1px', height: '1px', opacity: 0.01, left: '-9999px', top: '-9999px' }}>
          <div id={iframeId} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleConnect} className="space-y-2">
        <p className="font-serif text-xs italic text-ink-mute">
          Enter a YouTube playlist or video link to play background ambiance or battle tracks during play.
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => {
              setInputUrl(e.target.value);
              if (error) setError('');
            }}
            placeholder="Paste YouTube playlist URL, video, or ID..."
            className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputUrl.trim()}
            className="rounded border border-brass-deep/60 bg-brass/10 px-3 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
          >
            Connect
          </button>
        </div>
        {error && <p className="px-1 font-serif text-[10px] italic text-crimson">{error}</p>}
      </form>

      {/* Scenarios / Multiple Playlists List */}
      {renderScenarios()}
    </div>
  );
}
