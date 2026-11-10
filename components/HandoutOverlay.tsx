'use client';

import React, { useEffect, useState } from 'react';
import type {
  HandoutCard,
  HandoutCardCategory,
  ProjectedHandoutCard,
} from '@/lib/playerMode/types';

export interface HandoutOverlayProps {
  role: 'gm' | 'player';
  /** Full or projected handouts gallery. */
  handouts?: Array<HandoutCard | ProjectedHandoutCard>;
  /** Currently flashed handout on `/player` screens. */
  activeFlash?: HandoutCard | ProjectedHandoutCard | null;
  /** GM callback to flash a new or existing handout to connected `/player` screens and archive it in the gallery. */
  onFlashHandout?: (handout: HandoutCard) => void;
  /** GM callback to clear the active flash modal across connected `/player` screens. */
  onClearActiveFlash?: () => void;
}

export function HandoutOverlay({
  role,
  handouts = [],
  activeFlash = null,
  onFlashHandout,
  onClearActiveFlash,
}: HandoutOverlayProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dismissedFlashKey, setDismissedFlashKey] = useState<string | null>(null);
  const [selectedGalleryCard, setSelectedGalleryCard] = useState<
    HandoutCard | ProjectedHandoutCard | null
  >(null);

  // GM new handout composer state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HandoutCardCategory>('letter');
  const [style, setStyle] = useState<'parchment' | 'slate'>('parchment');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const flashKey = activeFlash ? `${activeFlash.id}_${activeFlash.flashedAt ?? 0}` : null;
  const showLiveFlashModal = Boolean(activeFlash && flashKey && dismissedFlashKey !== flashKey);
  const modalCard = showLiveFlashModal ? activeFlash : selectedGalleryCard;

  useEffect(() => {
    if (flashKey && flashKey !== dismissedFlashKey) {
      setSelectedGalleryCard(null);
    }
  }, [flashKey, dismissedFlashKey]);

  const handleCreateAndFlash = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !onFlashHandout) return;
    const now = Date.now();
    const card: HandoutCard = {
      id: `handout_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      category,
      style,
      content: content.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      flashedAt: now,
      activeFlash: true,
      visibility: { mode: 'party' },
    };
    onFlashHandout(card);
    setTitle('');
    setContent('');
    setImageUrl('');
  };

  const handleDismissModal = () => {
    if (showLiveFlashModal && flashKey) {
      setDismissedFlashKey(flashKey);
      if (role === 'gm' && onClearActiveFlash) {
        onClearActiveFlash();
      }
    }
    setSelectedGalleryCard(null);
  };

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
            drawerOpen
              ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
              : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-amber-500/40'
          }`}
        >
          <span>📜 Handouts ({handouts.length})</span>
        </button>
      </div>

      {/* Handouts Gallery & GM Flash Composer Drawer */}
      {drawerOpen && (
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-slate-950/95 p-3.5 text-slate-100 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                📜 Party Handouts Gallery &amp; Live Flash
              </h4>
              <p className="text-[11px] text-slate-400">
                {role === 'gm'
                  ? 'Flash a parchment letter, riddle, image, or magic item full-screen onto connected /player screens.'
                  : 'Archived letters, riddles, maps, and magic items revealed by the GM.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Gallery Cards */}
          {handouts.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">No handouts flashed yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {handouts.map((h) => (
                <div
                  key={h.id}
                  className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-amber-200 truncate">{h.title}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                        {h.category}
                      </span>
                    </div>
                    {h.content && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{h.content}</p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedGalleryCard(h)}
                      className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                    >
                      👁️ View Fullscreen
                    </button>
                    {role === 'gm' && onFlashHandout && (
                      <button
                        type="button"
                        onClick={() =>
                          onFlashHandout({
                            ...(h as HandoutCard),
                            flashedAt: Date.now(),
                            activeFlash: true,
                            visibility: { mode: 'party' },
                          })
                        }
                        className="rounded bg-amber-500/20 px-2 py-1 text-[11px] font-medium text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
                      >
                        ⚡ Flash to Party
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* GM Composer to Flash a New Handout */}
          {role === 'gm' && onFlashHandout && (
            <form
              onSubmit={handleCreateAndFlash}
              className="space-y-2 border-t border-slate-800 pt-2.5"
            >
              <div className="text-xs font-semibold text-amber-300">
                ⚡ Flash New Handout to Party
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Handout title (e.g. Sealed Royal Decree)"
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as HandoutCardCategory)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="letter">📜 Letter / Note</option>
                  <option value="riddle">🧩 Riddle / Prophecy</option>
                  <option value="magic_item">🗡️ Magic Item Card</option>
                  <option value="image">🖼️ Artwork / Map</option>
                  <option value="lore">📖 Lore Fragment</option>
                </select>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as 'parchment' | 'slate')}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="parchment">📜 Dramatic Parchment</option>
                  <option value="slate">🪨 Obsidian Slate</option>
                </select>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={2}
                placeholder="Inscription, riddle text, or item lore…"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-slate-100"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Optional image URL or data URI…"
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500/25 border border-amber-500/50 px-3.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/35"
                >
                  ⚡ Flash Handout to Party
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Full-Screen Dramatic Parchment / Slate Overlay Modal */}
      {modalCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={modalCard.title}
        >
          <div
            className={`relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 p-6 shadow-2xl ${
              modalCard.style === 'slate'
                ? 'border-sky-500/40 bg-slate-950 text-slate-100'
                : 'border-amber-700/60 bg-gradient-to-b from-amber-100 via-amber-50 to-orange-100 text-amber-950'
            }`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-current/20 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest opacity-75">
                  {(modalCard.category || (modalCard as HandoutCard).kind || 'lore').replace('_', ' ')} • Party Handout
                </span>
                <h2 className="mt-0.5 font-serif text-2xl font-bold">{modalCard.title}</h2>
                {modalCard.subtitle && (
                  <p className="text-xs italic opacity-80">{modalCard.subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDismissModal}
                className="rounded-lg border border-current/30 px-3 py-1 text-xs font-semibold hover:opacity-80"
              >
                ✕ Dismiss (Archived in Handouts)
              </button>
            </div>

            {modalCard.imageUrl && (
              <div className="my-4 overflow-hidden rounded-xl border border-current/20">
                <img
                  src={modalCard.imageUrl}
                  alt={modalCard.title}
                  className="max-h-[420px] w-full object-contain bg-black/20"
                />
              </div>
            )}

            {(modalCard.content || (modalCard as HandoutCard).body) && (
              <div className="mt-4 whitespace-pre-wrap font-serif text-base leading-relaxed">
                {modalCard.content || (modalCard as HandoutCard).body}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default HandoutOverlay;
