'use client';

import React from 'react';
import PlayerModePanel from '../PlayerModePanel';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { type CampaignEditorModel } from './useCampaignEditor';
import { PitchPhase } from './planPrepView/PitchPhase';
import { WorldbuildPhase } from './planPrepView/WorldbuildPhase';
import { PartyPhase } from './planPrepView/PartyPhase';
import { SessionPrepPhase } from './planPrepView/SessionPrepPhase';
import { ClocksPhase } from './planPrepView/ClocksPhase';
import { ArcPhase } from './planPrepView/ArcPhase';
import { EndingPhase } from './planPrepView/EndingPhase';

export function PlanPrepView({ ed }: { ed: CampaignEditorModel }) {
  const {
    campaign,
    completedCount,
    confirmModal,
    get,
    jumpToNextUp,
    mode,
    name,
    nextUp,
    setVal,
    state,
    subview,
  } = ed;
  return (
    <>
      {mode === 'prep' && subview === 'flow' && (
        nextUp ? (
          <div className="flex items-center gap-3 rounded border border-brass/40 bg-brass/5 p-3 shadow-card">
            <div className="flex-shrink-0 font-display text-[10px] uppercase tracking-wider text-brass-deep">
              Next Up
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm text-ink">{nextUp.label}</div>
              <div className="font-serif text-xs italic text-ink-soft">
                {nextUp.current} of {nextUp.target} — {nextUp.target - nextUp.current} to go
              </div>
            </div>
            <button
              onClick={jumpToNextUp}
              className="flex-shrink-0 rounded border border-brass-deep/60 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment"
            >
              Jump To
            </button>
          </div>
        ) : completedCount > 0 ? (
          <div className="rounded border border-moss/40 bg-moss/5 p-3 text-center font-serif text-sm italic text-moss">
            All prep targets met. Ready to run.
          </div>
        ) : null
      )}

      {mode === 'plan' && subview === 'pitch' && (
        <PitchPhase ed={ed} />
      )}

      {mode === 'plan' && subview === 'worldbuild' && (
        <WorldbuildPhase ed={ed} />
      )}

      {mode === 'plan' && subview === 'party' && (
        <PartyPhase ed={ed} />
      )}

      {mode === 'prep' && subview === 'flow' && (
        <SessionPrepPhase ed={ed} />
      )}

      {mode === 'organize' && subview === 'players' && state.player && (
        <PlayerModePanel
          campaignId={campaign.id}
          campaignName={name}
          data={state}
          config={state.player as PlayerConfig}
          onConfigChange={(cfg) => setVal('player', cfg)}
          confirm={confirmModal}
          playerLog={get('playerLog', []) as PlayerLogEntry[]}
          onPlayerLogChange={(entries) => setVal('playerLog', entries)}
        />
      )}

      {mode === 'prep' && subview === 'clocks' && (
        <ClocksPhase ed={ed} />
      )}

      {mode === 'prep' && subview === 'arc' && (
        <ArcPhase ed={ed} />
      )}

      {mode === 'prep' && subview === 'ending' && (
        <EndingPhase ed={ed} />
      )}
    </>
  );
}
