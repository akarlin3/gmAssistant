'use client';

import { useState } from 'react';
import { Check, X, Pencil, Sparkles } from 'lucide-react';
import type { ToolCallRecord } from '@/lib/assistant/types';
import type { LooseRecord } from './types';

export function ProposalCard({
  call,
  onApprove,
  onReject,
  disabled,
}: {
  call: ToolCallRecord;
  onApprove: (toolId: string, input: LooseRecord) => void;
  onReject: (toolId: string, reason: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => JSON.stringify(call.input, null, 2));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const resolved = call.status === 'executed' || call.status === 'rejected';

  const approve = () => {
    let input = call.input as LooseRecord;
    if (editing) {
      try {
        input = JSON.parse(draft);
        setParseError(null);
      } catch {
        setParseError('Invalid JSON.');
        return;
      }
    }
    onApprove(call.id, input);
  };

  return (
    <div
      data-proposal
      data-tool={call.name}
      data-status={call.status}
      className={`rounded-lg border px-3 py-2 ${
        call.status === 'rejected'
          ? 'border-crimson/40 bg-crimson/5'
          : call.status === 'executed'
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-brass-deep/40 bg-brass/5'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
          <Sparkles size={12} /> Proposal · {call.name}
        </span>
        {call.status === 'executed' && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <Check size={12} /> Approved
          </span>
        )}
        {call.status === 'rejected' && (
          <span className="flex items-center gap-1 text-[11px] text-crimson">
            <X size={12} /> Rejected
          </span>
        )}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(12, draft.split('\n').length + 1)}
          className="w-full rounded-md border border-parchment-deep bg-parchment p-2 font-mono text-[11px] outline-none focus:border-wine"
        />
      ) : (
        <dl className="space-y-0.5 text-xs text-ink-soft">
          {Object.entries(call.input).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 font-display uppercase tracking-wide text-ink-mute">{k}</dt>
              <dd className="min-w-0 break-words">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {call.rejectionReason && (
        <p className="mt-1 text-[11px] italic text-crimson">Reason: {call.rejectionReason}</p>
      )}
      {parseError && <p className="mt-1 text-[11px] text-crimson">{parseError}</p>}

      {!resolved && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {rejecting ? (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why reject? (optional)"
                className="flex-1 rounded-md border border-parchment-deep bg-parchment px-2 py-1 text-xs outline-none focus:border-wine"
              />
              <button
                onClick={() => onReject(call.id, reason.trim() || 'Not a fit right now.')}
                disabled={disabled}
                className="rounded-md bg-crimson px-2.5 py-1 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson/90 disabled:opacity-50"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => setRejecting(false)}
                className="rounded-md border border-parchment-deep px-2 py-1 text-xs text-ink-mute"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={approve}
                disabled={disabled}
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={12} /> Approve
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={disabled}
                className="flex items-center gap-1 rounded-md border border-crimson/50 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10 disabled:opacity-50"
              >
                <X size={12} /> Reject
              </button>
              <button
                onClick={() => setEditing((e) => !e)}
                disabled={disabled}
                className="flex items-center gap-1 rounded-md border border-parchment-deep px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-parchment-deep/40 disabled:opacity-50"
              >
                <Pencil size={12} /> {editing ? 'Done Editing' : 'Edit'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
