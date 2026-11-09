'use client';

import React from 'react';
import { Eye, CheckSquare, BookOpen, MessageSquare, Lock } from 'lucide-react';
import type { PlayerCharacter } from '@/lib/pc/types';

export default function PlayerSharedQuestsNotesPanel({
  pcs,
  compact = false,
}: {
  pcs: PlayerCharacter[];
  compact?: boolean;
}) {
  const pcsWithShared = pcs
    .map((pc) => {
      const quests = (pc.sharedQuests ?? []).filter((q) => q.sharedWithGm === true);
      const annotations = (pc.sharedAnnotations ?? []).filter((a) => a.sharedWithGm === true);
      const journal = (pc.sharedJournal ?? []).filter((j) => j.sharedWithGm === true);
      return {
        pc,
        quests,
        annotations,
        journal,
        total: quests.length + annotations.length + journal.length,
      };
    });

  const totalSharedAcrossParty = pcsWithShared.reduce((sum, item) => sum + item.total, 0);

  return (
    <section className="space-y-3 rounded-lg border border-gold/40 bg-parchment-soft p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-gold-deep" />
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-ink">
            Player-Shared Quests &amp; Notes
          </h4>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-rule bg-parchment px-2 py-0.5 font-mono text-[10px] text-ink-soft">
          <Lock size={10} className="text-wax" /> Opt-In Only ({totalSharedAcrossParty} shared)
        </span>
      </div>

      {totalSharedAcrossParty === 0 ? (
        <p className="font-serif text-xs italic text-ink-faint">
          No quests, lore annotations, or journal entries have been shared with the GM yet. Player notes remain 100% local and private on the player&apos;s device until they toggle &ldquo;👁️ Share with GM&rdquo;.
        </p>
      ) : (
        <div className="space-y-3">
          {pcsWithShared
            .filter((item) => item.total > 0)
            .map(({ pc, quests, annotations, journal }) => (
              <div
                key={pc.id}
                className="space-y-2.5 rounded border border-rule bg-parchment p-3"
              >
                {pcs.length > 1 && (
                  <div className="font-display text-xs font-semibold text-wax">
                    {pc.name || 'Unnamed PC'} {pc.player ? `(${pc.player})` : ''}
                  </div>
                )}

                {/* Shared Quests */}
                {quests.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brass-deep">
                      <CheckSquare size={11} /> Shared Quests &amp; Rumors ({quests.length})
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {quests.map((q) => (
                        <div
                          key={q.id}
                          className="rounded border border-rule/80 bg-parchment-soft px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-serif font-semibold text-ink">{q.title}</span>
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                                q.status === 'completed'
                                  ? 'border-forest/40 bg-forest/10 text-forest'
                                  : q.status === 'failed'
                                    ? 'border-wax/40 bg-wax/10 text-wax'
                                    : 'border-gold/40 bg-gold/15 text-gold-deep'
                              }`}
                            >
                              {q.status}
                            </span>
                          </div>
                          {q.notes && (
                            <p className="mt-1 whitespace-pre-wrap font-serif text-[11px] text-ink-soft">
                              {q.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shared Lore Annotations */}
                {annotations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brass-deep">
                      <MessageSquare size={11} /> Shared Lore Annotations ({annotations.length})
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {annotations.map((a) => (
                        <div
                          key={a.id}
                          className="rounded border border-rule/80 bg-parchment-soft px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-serif font-semibold text-ink">
                              {a.entityName || a.entityId}
                            </span>
                            {a.attitudeTag && (
                              <span className="rounded-full border border-rule bg-parchment px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-soft">
                                {a.attitudeTag}
                              </span>
                            )}
                          </div>
                          {(a.sharedNotes || a.privateNotes) && (
                            <p className="mt-1 whitespace-pre-wrap font-serif text-[11px] text-ink-soft">
                              {a.sharedNotes || a.privateNotes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shared Session Journal */}
                {journal.length > 0 && !compact && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brass-deep">
                      <BookOpen size={11} /> Shared Session Journal ({journal.length})
                    </div>
                    <div className="space-y-1.5">
                      {journal.map((j) => (
                        <div
                          key={j.id}
                          className="rounded border border-rule/80 bg-parchment-soft px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-serif font-semibold text-ink">{j.title}</span>
                            <span className="font-mono text-[9px] text-ink-faint">
                              Session {j.sessionNumber} · {j.date}
                            </span>
                          </div>
                          {j.content && (
                            <p className="mt-1 whitespace-pre-wrap font-serif text-[11px] text-ink-soft">
                              {j.content}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
