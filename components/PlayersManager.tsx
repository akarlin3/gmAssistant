import React, { useState, useRef, useEffect } from 'react';
import { type Campaign, approvePlayer, rejectPlayer, removePlayer } from '@/lib/firebase/campaigns';
import { Users, Check, X, Copy, CheckCircle2, Trash2 } from 'lucide-react';

export default function PlayersManager({ campaign }: { campaign: Campaign }) {
  const [copied, setCopied] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const pendingPlayers = campaign.pendingPlayers || [];
  const playerIds = campaign.playerIds || [];

  const updateAlignment = () => {
    if (!containerRef.current || typeof window === 'undefined') return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceToRight = window.innerWidth - rect.left;
    // The popup width is w-72 (288px). We use 300px to allow for scrollbars and padding.
    setAlignRight(spaceToRight < 300);
  };

  useEffect(() => {
    updateAlignment();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateAlignment);
      return () => window.removeEventListener('resize', updateAlignment);
    }
  }, []);

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const link = `${window.location.origin}/invite/${campaign.id}?name=${encodeURIComponent(campaign.name)}`;
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

  const handleRemove = async (uid: string) => {
    const email = campaign.playerEmails?.[uid] || uid;
    if (typeof window !== 'undefined' && window.confirm(`Are you sure you want to remove ${email} from this campaign?`)) {
      try {
        await removePlayer(campaign.id, uid);
      } catch (e) {
        console.error('Failed to remove player', e);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={updateAlignment}
      className="group relative inline-block"
    >
      <button className="flex items-center gap-1.5 rounded border border-moss/40 bg-moss/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-moss shadow-sm transition-colors hover:bg-moss hover:text-parchment">
        <Users size={14} />
        {playerIds.length === 0 ? 'Invite players' : `Players (${playerIds.length})`}
        {pendingPlayers.length > 0 && (
          <span className="ml-1 flex size-4 animate-pulse items-center justify-center rounded-full bg-crimson text-[10px] text-parchment shadow-sm">
            {pendingPlayers.length}
          </span>
        )}
      </button>

      <div className={`absolute ${alignRight ? 'right-0' : 'left-0'} invisible top-full z-50 mt-2 w-72 rounded-lg border border-rule bg-parchment opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100`}>
        <div className="rounded-t-lg border-b border-rule bg-parchment-soft p-3">
          <div className="mb-2 font-display text-sm tracking-wide text-ink">Invite Link</div>
          <button
            onClick={handleCopyLink}
            className="flex w-full items-center justify-between rounded border border-rule bg-parchment px-3 py-2 text-xs text-ink-soft transition-colors hover:border-brass hover:text-brass"
          >
            <span className="flex-1 truncate text-left">.../invite/{campaign.id.slice(0, 8)}</span>
            {copied ? <CheckCircle2 size={14} className="ml-2 text-moss" /> : <Copy size={14} className="ml-2" />}
          </button>
        </div>

        {pendingPlayers.length > 0 && (
          <div className="border-b border-rule p-3">
            <div className="mb-2 font-display text-xs uppercase tracking-wide text-crimson">Pending Requests</div>
            <div className="space-y-2">
              {pendingPlayers.map((user) => (
                <div key={user.uid} className="flex items-center justify-between text-sm">
                  <span className="max-w-[120px] truncate text-ink" title={user.email}>{user.email}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleApprove(user)}
                      className="rounded p-1 text-moss hover:bg-moss/10"
                      title="Approve"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => handleReject(user)}
                      className="rounded p-1 text-crimson hover:bg-crimson/10"
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

        {playerIds.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-b border-rule p-3">
            <div className="mb-2 font-display text-xs uppercase tracking-wide text-ink-soft">Approved Players</div>
            <div className="space-y-2">
              {playerIds.map((uid) => {
                const email = campaign.playerEmails?.[uid] || `User (${uid.slice(0, 8)})`;
                return (
                  <div key={uid} className="flex items-center justify-between text-sm">
                    <span className="max-w-[190px] truncate text-ink" title={email}>
                      {email}
                    </span>
                    <button
                      onClick={() => handleRemove(uid)}
                      className="rounded p-1 text-crimson transition-colors hover:bg-crimson/10"
                      title="Remove player"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="p-3 text-center text-xs italic text-ink-mute">
          {playerIds.length} player{playerIds.length === 1 ? '' : 's'} in campaign.
        </div>
      </div>
    </div>
  );
}
