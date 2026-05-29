// Extracted verbatim from RunSessionView.tsx.
import { Check, Eye, Loader2, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { LockedInline } from '@/components/LockedFeature';
import { useAuth } from '@/lib/firebase/auth-context';
import { describeScene } from '@/lib/generators/describe-scene';
import type { CampaignContext } from '@/lib/generators/types';
import { PinToggle } from './sections';

export function SceneRow({
  text, used, pinned, description, onToggleUsed, onTogglePin, onDescribed, onClearDescription, campaignContext, shared, onShare,
}: {
  text: string;
  used: boolean;
  pinned: boolean;
  description: string;
  onToggleUsed: () => void;
  onTogglePin: () => void;
  onDescribed: (d: string) => void;
  onClearDescription: () => void;
  campaignContext?: CampaignContext;
  shared: boolean;
  onShare: () => void;
}) {
  const { isPro } = useAuth();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const runDescribe = async () => {
    if (!isPro || loading) return;
    setErr('');
    setLoading(true);
    try {
      const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await describeScene(text, idToken, campaignContext);
      onDescribed(res.description);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Description failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className={`rounded border ${used ? 'border-brass/60 bg-brass/10' : 'border-rule bg-parchment'}`}>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <button
          onClick={onToggleUsed}
          className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm border ${used ? 'border-brass-deep bg-brass text-parchment' : 'border-ink-mute bg-parchment'}`}
          title={used ? 'Unmark used' : 'Mark used this session'}
        >
          {used && <Check size={10} strokeWidth={3} />}
        </button>
        <span className={`flex-1 font-serif text-sm ${used ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>{text}</span>
        {isPro ? (
          <button
            onClick={runDescribe}
            disabled={loading}
            className="flex flex-shrink-0 items-center gap-1 rounded border border-brass-deep/50 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment disabled:opacity-50"
            title="Generate a short read-aloud description"
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
            {loading ? 'Describing…' : 'Describe'}
          </button>
        ) : (
          <LockedInline label="Describe" />
        )}
        <PinToggle pinned={pinned} onClick={onTogglePin} />
      </div>
      {err && <p className="px-2 pb-1 text-[10px] italic text-crimson">{err}</p>}
      {description && (
        <div className="border-t border-rule/60 bg-parchment-soft px-2 py-1.5">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">Read-aloud</span>
            <div className="flex gap-2">
              <button
                onClick={onShare}
                disabled={shared}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider transition-colors ${
                  shared
                    ? 'cursor-default bg-moss/10 font-semibold text-moss'
                    : 'bg-brass/20 font-semibold text-brass-deep hover:bg-brass hover:text-parchment'
                }`}
                title={shared ? 'Shared with Players' : 'Share with Players'}
              >
                <Eye size={10} />
                {shared ? 'Shared' : 'Share'}
              </button>
              <button
                onClick={onClearDescription}
                className="text-ink-mute hover:text-crimson"
                title="Clear description"
              >
                <X size={10} />
              </button>
            </div>
          </div>
          <p className="whitespace-pre-wrap font-serif text-[12px] italic text-ink-soft">{description}</p>
        </div>
      )}
    </li>
  );
}
