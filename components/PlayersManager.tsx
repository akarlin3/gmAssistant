import React, { useState } from 'react';
import { type Campaign, approvePlayer, rejectPlayer } from '@/lib/firebase/campaigns';
import { Users, Check, X, Copy, CheckCircle2 } from 'lucide-react';

export default function PlayersManager({ campaign }: { campaign: Campaign }) {
  const [copied, setCopied] = useState(false);
  const pendingPlayers = campaign.pendingPlayers || [];
  const playerIds = campaign.playerIds || [];

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const link = `${window.location.origin}/invite/${campaign.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = async (user: { uid: string; email: string }) => {
    try {
      await approvePlayer(campaign.id, user);
    } catch (e) {
      console.error('Failed to approve player', e);
    }
  };

  const handleReject = async (user: { uid: string; email: string }) => {
    try {
      await rejectPlayer(campaign.id, user);
    } catch (e) {
      console.error('Failed to reject player', e);
    }
  };

  return (
    <div className="relative group inline-block">
      <button className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-parchment-deep">
        <Users size={14} />
        Players ({playerIds.length})
        {pendingPlayers.length > 0 && (
          <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-crimson text-[10px] text-parchment">
            {pendingPlayers.length}
          </span>
        )}
      </button>

      <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-rule bg-parchment shadow-xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
        <div className="p-3 border-b border-rule bg-parchment-soft rounded-t-lg">
          <div className="font-display text-sm tracking-wide text-ink mb-2">Invite Link</div>
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-between px-3 py-2 bg-parchment border border-rule rounded text-xs text-ink-soft hover:border-brass hover:text-brass transition-colors"
          >
            <span className="truncate flex-1 text-left">.../invite/{campaign.id.slice(0, 8)}</span>
            {copied ? <CheckCircle2 size={14} className="text-moss ml-2" /> : <Copy size={14} className="ml-2" />}
          </button>
        </div>

        {pendingPlayers.length > 0 && (
          <div className="p-3 border-b border-rule">
            <div className="font-display text-xs tracking-wide text-crimson uppercase mb-2">Pending Requests</div>
            <div className="space-y-2">
              {pendingPlayers.map((user) => (
                <div key={user.uid} className="flex items-center justify-between text-sm">
                  <span className="text-ink truncate max-w-[120px]" title={user.email}>{user.email}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleApprove(user)}
                      className="p-1 text-moss hover:bg-moss/10 rounded"
                      title="Approve"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => handleReject(user)}
                      className="p-1 text-crimson hover:bg-crimson/10 rounded"
                      title="Reject"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 text-xs text-ink-mute italic text-center">
          {playerIds.length} player{playerIds.length === 1 ? '' : 's'} in campaign.
        </div>
      </div>
    </div>
  );
}
