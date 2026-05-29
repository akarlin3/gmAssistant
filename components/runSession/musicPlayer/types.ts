export type SyncAnchor = { positionSec: number; anchorWallTimeMs: number; playlistIndex: number };

export type Playlist = { id: string; name: string; url: string };

export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'unknown';
