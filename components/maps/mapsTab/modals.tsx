'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { newId, type PointcrawlEdge } from '@/lib/maps/types';
import { uploadGeneratedImage } from '@/lib/maps/storage';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { Modal, ModalActions, LabeledInput } from './ui';

// ─── Edge edit modal ────────────────────────────────────────────────────────

export function EdgeEditModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (label: string, days: number | undefined, hazardous: boolean) => void;
}) {
  const [label, setLabel] = useState('');
  const [days, setDays] = useState('');
  const [hazardous, setHazardous] = useState(false);
  return (
    <Modal title="Connect Nodes" onClose={onClose}>
      <LabeledInput name="edgeLabel" label="Label" value={label} placeholder="forest road" onChange={setLabel} />
      <label className="block space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Travel time (days)</span>
        <input name="travelTimeDays" type="number" min="0" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink" />
      </label>
      <label className="flex items-center gap-2 font-serif text-sm text-ink-soft">
        <input type="checkbox" checked={hazardous} onChange={(e) => setHazardous(e.target.checked)} /> Hazardous route
      </label>
      <ModalActions>
        <button type="button" onClick={onClose} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">Cancel</button>
        <button type="button" onClick={() => onSave(label.trim(), days === '' ? undefined : Math.max(0, Number(days)), hazardous)} className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine">Save Edge</button>
      </ModalActions>
    </Modal>
  );
}

// ─── AI generation modal ────────────────────────────────────────────────────

const STYLES = ['top-down', 'isometric', 'dungeon', 'forest', 'urban'] as const;

export function GenerateMapModal({
  mapId, onClose, onGenerated,
}: {
  mapId: string;
  onClose: () => void;
  onGenerated: (u: { url: string; path: string; width: number; height: number }) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<(typeof STYLES)[number]>('top-down');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    if (!prompt.trim()) { setError('Describe the map you want.'); return; }
    setBusy(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/maps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ prompt: prompt.trim(), style, mapId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      const uploaded = await uploadGeneratedImage(user.uid, mapId, json.b64);
      onGenerated(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate Map" onClose={busy ? () => {} : onClose}>
      <div className="space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Prompt</span>
        <textarea name="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="stone bridge over chasm at dawn" className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink" />
      </div>
      <label className="block space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Style</span>
        <select name="style" value={style} onChange={(e) => setStyle(e.target.value as any)} className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm capitalize text-ink">
          {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <p className="font-serif text-[11px] italic text-ink-mute">Generating replaces this map&apos;s current image. Limited to 10 generations per month.</p>
      {error && <p className="font-serif text-xs italic text-crimson">{error}</p>}
      <ModalActions>
        <button type="button" disabled={busy} onClick={onClose} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10 disabled:opacity-50">Cancel</button>
        <button type="button" disabled={busy} onClick={generate} className="flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50">
          <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
        </button>
      </ModalActions>
    </Modal>
  );
}

// ─── Build a PointcrawlEdge from pending state ──────────────────────────────

export function buildEdge(
  from: string,
  to: string,
  layerId: string,
  label: string,
  days: number | undefined,
  hazardous: boolean,
): PointcrawlEdge {
  return {
    id: newId('eg'),
    fromNodeId: from,
    toNodeId: to,
    layerId,
    ...(label ? { label } : {}),
    ...(typeof days === 'number' ? { travelTimeDays: days } : {}),
    ...(hazardous ? { hazardous: true } : {}),
  };
}
