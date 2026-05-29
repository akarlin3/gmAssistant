'use client';

// Extracted verbatim from RunSessionView.tsx. All effects, refs, dependency
// arrays, timings (15s publish interval, 5s drift check, 2s tolerance, 2s
// ENDED recovery delay, 500ms init delay), and the YT IFrame sync logic are
// preserved exactly.
import { useState } from 'react';
import { DEFAULT_SCENARIOS, parseYoutubeUrl } from './helpers';
import { useYouTubePlayer } from './musicPlayer/useYouTubePlayer';
import { PlayerReadOnlyView } from './musicPlayer/PlayerReadOnlyView';
import { ScenarioPlaylists } from './musicPlayer/ScenarioPlaylists';
import { GMActivePlayer } from './musicPlayer/GMActivePlayer';
import type { SyncAnchor } from './musicPlayer/types';

export type { SyncAnchor } from './musicPlayer/types';

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

  const {
    iframeId,
    isPlaying,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    playerState,
    ytPlayer,
    isApiReady,
    volumeRef,
    isMutedRef,
  } = useYouTubePlayer({
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
  });

  // Playlists scenario management
  const activePlaylists = playlists && playlists.length > 0 ? playlists : DEFAULT_SCENARIOS;

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
      onChangePlaying?.(false);
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
      if (nextMuted) { ytPlayer.mute(); } else { ytPlayer.unMute(); }
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
      if (nextVolume > 0 && isMutedRef.current) {
        ytPlayer.unMute();
        setIsMuted(false);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(mutedKey, 'false');
        }
      }
    }
  };

  // Read-only (player) mode: no content
  if (readOnly) {
    if (!playlistId && !videoId) {
      return (
        <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-rule/70 bg-parchment-soft px-4 py-2.5 font-serif text-xs italic text-ink-mute shadow-sm">
          No session music is playing.
        </div>
      );
    }

    return (
      <PlayerReadOnlyView
        iframeId={iframeId}
        isPlaying={isPlaying}
        isMuted={isMuted}
        volume={volume}
        playerState={playerState}
        isApiReady={isApiReady}
        isPlayingProp={isPlayingProp}
        togglePlay={togglePlay}
        toggleMute={toggleMute}
        handleVolumeChange={handleVolumeChange}
      />
    );
  }

  // GM mode: active player (playlist/video connected)
  if (playlistId || videoId) {
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

    return (
      <GMActivePlayer
        iframeId={iframeId}
        isPlaying={isPlaying}
        isMuted={isMuted}
        volume={volume}
        playerState={playerState}
        isApiReady={isApiReady}
        ytPlayer={ytPlayer}
        externalUrl={externalUrl}
        ytNormalUrl={ytNormalUrl}
        togglePlay={togglePlay}
        toggleMute={toggleMute}
        handleVolumeChange={handleVolumeChange}
        handleDisconnect={handleDisconnect}
        scenariosSlot={
          <ScenarioPlaylists
            activePlaylists={activePlaylists}
            playlistUrl={playlistUrl}
            onChangePlaylist={onChangePlaylist}
            onChangePlaylists={onChangePlaylists}
          />
        }
      />
    );
  }

  // GM mode: no playlist connected yet — show URL input form
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
      <ScenarioPlaylists
        activePlaylists={activePlaylists}
        playlistUrl={playlistUrl}
        onChangePlaylist={onChangePlaylist}
        onChangePlaylists={onChangePlaylists}
      />
    </div>
  );
}
