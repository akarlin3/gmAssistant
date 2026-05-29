'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import {
  MAPS_CAP, makeMap, type CampaignMap, type MapType,
} from '@/lib/maps/types';
import { uploadMapImage, deleteMapImage, validateImageFile } from '@/lib/maps/storage';
import { uid } from './helpers';
import { Modal, ModalActions } from './ui';

export function MapList({
  maps, onOpen, onCreate, onDelete,
}: {
  maps: CampaignMap[];
  onOpen: (id: string) => void;
  onCreate: (m: CampaignMap) => void;
  onDelete: (m: CampaignMap) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const atCap = maps.length >= MAPS_CAP;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wider text-ink">Maps</h2>
          <p className="font-serif text-sm italic text-ink-soft">
            Upload or generate maps, drop markers tied to your NPCs and locations, and share layers with players.
          </p>
        </div>
        <button
          type="button"
          disabled={atCap}
          onClick={() => setShowNew(true)}
          title={atCap ? `Map limit reached (${MAPS_CAP})` : 'Create a new map'}
          className="flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} /> New Map
        </button>
      </div>

      {atCap && (
        <p className="rounded border border-brass/40 bg-brass/5 px-3 py-2 font-serif text-xs italic text-brass-deep">
          You&apos;ve reached the {MAPS_CAP}-map limit for this campaign. Delete one to add another.
        </p>
      )}

      {maps.length === 0 ? (
        <div className="rounded border border-dashed border-rule p-8 text-center font-serif text-sm italic text-ink-soft">
          No maps yet. Create your first map to start placing markers.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {maps.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded border border-rule bg-parchment-deep">
              <button
                type="button"
                onClick={() => onOpen(m.id)}
                className="block w-full text-left"
              >
                <div className="flex aspect-video items-center justify-center bg-zinc-900">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt={m.name} className="size-full object-cover" />
                  ) : (
                    <ImageIcon size={28} className="text-zinc-600" />
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate font-display text-xs uppercase tracking-wider text-ink">{m.name}</div>
                  <div className="font-serif text-[11px] capitalize italic text-ink-soft">
                    {m.type} · {m.markers.length} marker{m.markers.length === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(m)}
                title="Delete map"
                className="absolute right-1.5 top-1.5 rounded bg-ink/60 p-1 text-parchment opacity-0 transition-opacity hover:bg-crimson group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewMapModal onClose={() => setShowNew(false)} onCreate={(m) => { onCreate(m); setShowNew(false); }} />}
    </div>
  );
}

function NewMapModal({ onClose, onCreate }: { onClose: () => void; onCreate: (m: CampaignMap) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MapType>('region');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const blankPointcrawl = type === 'pointcrawl' && !file;

  async function handleCreate() {
    setError(null);
    if (file) {
      const v = validateImageFile(file);
      if (v) { setError(v); return; }
    } else if (type !== 'pointcrawl') {
      setError('Upload an image, or choose Pointcrawl for a blank canvas.');
      return;
    }
    setBusy(true);
    try {
      const base = makeMap({ name, type });
      if (file) {
        const u = await uploadMapImage(uid(), base.id, file);
        base.imageUrl = u.url;
        base.imageStoragePath = u.path;
        base.width = u.width;
        base.height = u.height;
      }
      onCreate(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setBusy(false);
    }
  }

  return (
    <Modal title="New Map" onClose={onClose}>
      <label className="block space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">Name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Wells Region"
          className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">Type</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as MapType)}
          className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        >
          <option value="region">Region</option>
          <option value="encounter">Encounter</option>
          <option value="dungeon">Dungeon</option>
          <option value="pointcrawl">Pointcrawl</option>
        </select>
      </label>
      <div className="space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">
          Image {type === 'pointcrawl' && <span className="normal-case text-ink-mute">(optional — blank canvas if omitted)</span>}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
          className="block w-full font-serif text-xs text-ink-soft file:mr-2 file:rounded file:border-0 file:bg-brass/15 file:px-2 file:py-1 file:font-display file:text-xs file:uppercase file:tracking-wider file:text-brass-deep"
        />
        {file && <p className="font-serif text-[11px] italic text-ink-soft">{file.name}</p>}
        {blankPointcrawl && <p className="font-serif text-[11px] italic text-ink-mute">Will create a blank pointcrawl whiteboard.</p>}
      </div>
      {error && <p className="font-serif text-xs italic text-crimson">{error}</p>}
      <ModalActions>
        <button type="button" onClick={onClose} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">Cancel</button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </ModalActions>
    </Modal>
  );
}
