'use client';

import { Dice5, Sparkles, Swords, Music } from 'lucide-react';
import InitiativePanel from '../../InitiativePanel';
import { MusicPlayer } from '../MusicPlayer';
import { PanelShell } from '../sections';
import { QuickDice, QuickInspire } from '../widgets';
import { makeEvent } from '@/lib/sessionEvents';
import type { InitiativeState } from '@/lib/initiative';
import type { HomebrewMonster } from '../../MonstersTab';
import type { CampaignContext } from '@/lib/generators/types';
import type { ChangeEvent } from '@/lib/sessionEvents';
import type { Get, SetVal } from '../types';
import type { SessionSyncAnchor } from './types';

type Props = {
  get: Get;
  setVal: SetVal;
  party: any[];
  campaignContext?: CampaignContext;
  initiativeOpen: boolean;
  setInitiativeOpen: (v: boolean) => void;
  musicOpen: boolean;
  setMusicOpen: (v: boolean) => void;
  homebrewMonsters: HomebrewMonster[];
  sessionPlaylistAnchor?: SessionSyncAnchor | null;
  setSessionPlaylistAnchor?: (next: SessionSyncAnchor | null) => void;
  pushEvent: (e: ChangeEvent) => void;
};

export function ToolsPanel({
  get,
  setVal,
  party,
  campaignContext,
  initiativeOpen,
  setInitiativeOpen,
  musicOpen,
  setMusicOpen,
  sessionPlaylistAnchor,
  setSessionPlaylistAnchor,
  pushEvent,
}: Props) {
  return (
    <>
      <PanelShell title="Initiative" icon={Swords} open={initiativeOpen} onToggle={() => setInitiativeOpen(!initiativeOpen)}>
        {initiativeOpen ? (
          <InitiativePanel
            variant="inline"
            state={(get('__initiative', null) as InitiativeState | null)}
            onChange={(next) => setVal('__initiative', next)}
            monsters={get('homebrewMonsters', []) as HomebrewMonster[]}
            pcs={party}
            onClose={() => setInitiativeOpen(false)}
            onEnded={(summary) => {
              pushEvent(makeEvent('other', summary));
            }}
          />
        ) : (
          <p className="px-1 font-serif text-xs italic text-ink-mute">Tap to expand and track turns, HP, conditions.</p>
        )}
      </PanelShell>

      <PanelShell title="Session Music" icon={Music} open={musicOpen} onToggle={() => setMusicOpen(!musicOpen)}>
        <MusicPlayer
          playlistUrl={(get('__sessionPlaylist', '') as string)}
          onChangePlaylist={(next) => {
            setVal('__sessionPlaylist', next);
            setVal('__sessionPlaylistIndex', 0);
            setSessionPlaylistAnchor?.(null);
          }}
          isPlayingProp={!!get('__sessionPlaylistPlaying', false)}
          onChangePlaying={(next) => setVal('__sessionPlaylistPlaying', next)}
          playlists={(get('__sessionPlaylists', []) as Array<{ id: string; name: string; url: string }>)}
          onChangePlaylists={(next) => setVal('__sessionPlaylists', next)}
          playlistIndexProp={(get('__sessionPlaylistIndex', 0) as number)}
          onChangePlaylistIndex={(next) => setVal('__sessionPlaylistIndex', next)}
          onPublishSyncAnchor={setSessionPlaylistAnchor}
        />
      </PanelShell>

      <PanelShell title="Quick Dice" icon={Dice5} open={true} onToggle={() => {}}>
        <QuickDice />
      </PanelShell>

      <PanelShell title="Quick Inspire" icon={Sparkles} open={true} onToggle={() => {}}>
        <QuickInspire campaignContext={campaignContext} />
      </PanelShell>
    </>
  );
}
