'use client';

import { useMemo, useState } from 'react';
import { useContext } from 'react';
import {
  Play,
  MessageSquare,
  Download,
  MapPin,
  Users,
  Trash2,
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import {
  capScenes,
  makeSceneId,
  type SceneEntry,
  type SceneTurn,
  type SceneTurnResponse,
} from '@/lib/scene/types';
import { resolveMentions } from '@/lib/scene/mentions';
import { resolveCheck } from '@/lib/scene/roll';
import { sceneToMarkdown } from '@/lib/scene/export';
import { normalizePcs } from '@/lib/pc/factory';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';
import { asArray, str, getIdToken } from './sceneMode/helpers';
import { summarizeTurns as apiSummarizeTurns, checkVoice } from './sceneMode/api';
import { useSceneTurn } from './sceneMode/useSceneTurn';
import SceneRunner from './sceneMode/SceneRunner';

type Props = {
  data: Record<string, unknown>;
  scenes: SceneEntry[];
  onScenesChange: (next: SceneEntry[]) => void;
  // Reveal mentioned NPCs to players through the Player Mode pipe.
  onReveal: (npcIds: string[]) => void;
  // Parent appends a session-log entry built from the ended scene.
  onSceneEnded: (scene: SceneEntry) => void;
};

export default function SceneModePanel({
  data,
  scenes,
  onScenesChange,
  onReveal,
  onSceneEnded,
}: Props) {
  const playMode = useContext(CampaignPlayModeContext);
  const confirm = useConfirm();
  const npcs = useMemo(() => asArray(data.npcs), [data.npcs]);
  const locations = useMemo(() => asArray(data.locations), [data.locations]);
  const party = useMemo(() => normalizePcs(data.pcs), [data.pcs]);

  const npcName = (id: string) => str(npcs.find((n) => str(n.id) === id)?.name) || 'Unknown NPC';
  const locationName = (id: string) =>
    str(locations.find((l) => str(l.id) === id)?.name) || 'Unknown Location';

  const [activeId, setActiveId] = useState<string | null>(
    () => scenes.find((s) => s.status === 'active')?.id ?? null,
  );

  // Picker draft
  const [draftLocationId, setDraftLocationId] = useState('');
  const [draftNpcIds, setDraftNpcIds] = useState<string[]>([]);
  const [draftPartyState, setDraftPartyState] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeScene = scenes.find((s) => s.id === activeId) ?? null;

  const patchScene = (id: string, patch: (s: SceneEntry) => SceneEntry) => {
    onScenesChange(scenes.map((s) => (s.id === id ? patch(s) : s)));
  };

  // ---- Mentions + voice check ---------------------------------------------

  const revealMentions = (response: SceneTurnResponse) => {
    const mentionNpcs = npcs
      .map((n) => ({ id: str(n.id), name: str(n.name) }))
      .filter((n) => n.id && n.name);
    const text = [response.sensory, ...response.dialogue.map((d) => d.line)].join('\n');
    const { resolvedIds } = resolveMentions(text, mentionNpcs);
    // NPCs who actually spoke are revealed too — they're clearly "on screen".
    const speakers = response.dialogue.map((d) => d.npcId);
    const all = [...new Set([...resolvedIds, ...speakers])].filter(Boolean);
    if (all.length > 0) onReveal(all);
  };

  const runVoiceCheck = async (sceneId: string, turn: SceneTurn) => {
    try {
      const idToken = await getIdToken();
      const warnings: { npcId: string; reason: string }[] = [];
      for (const line of turn.response.dialogue) {
        const npc = npcs.find((n) => str(n.id) === line.npcId);
        if (!npc) continue;
        const traits = str(npc.traits) || str(npc.archetype);
        const voice = str(npc.voice);
        if (!traits && !voice) continue;
        const verdict = await checkVoice(idToken, { traits, voice, line: line.line });
        if (typeof verdict === 'string' && verdict.startsWith('WARN:')) {
          warnings.push({ npcId: line.npcId, reason: verdict.slice(5).trim() });
        }
      }
      if (warnings.length > 0) {
        patchScene(sceneId, (s) => ({
          ...s,
          turns: s.turns.map((t) => (t.id === turn.id ? { ...t, voiceWarnings: warnings } : t)),
        }));
      }
    } catch {
      // Voice check is advisory; ignore failures.
    }
  };

  // ---- Turn runner (state + streaming) ------------------------------------

  const turnRunner = useSceneTurn({
    activeScene,
    locations,
    npcs,
    onTurnRecorded: (sceneId, turn) =>
      patchScene(sceneId, (s) => ({ ...s, turns: [...s.turns, turn] })),
    onTurnComplete: (sceneId, turn, response) => {
      revealMentions(response);
      void runVoiceCheck(sceneId, turn);
    },
  });

  // ---- Start / Resume / End ------------------------------------------------

  const startScene = () => {
    if (!draftLocationId || draftNpcIds.length === 0) return;
    const entry: SceneEntry = {
      id: makeSceneId(),
      startedAt: Date.now(),
      locationId: draftLocationId,
      presentNpcIds: draftNpcIds,
      partyState: draftPartyState.trim(),
      turns: [],
      status: 'active',
    };
    onScenesChange(capScenes([entry, ...scenes]));
    setActiveId(entry.id);
    setPickerOpen(false);
    setDraftLocationId('');
    setDraftNpcIds([]);
    setDraftPartyState('');
  };

  const endScene = async (scene: SceneEntry) => {
    let summary = '';
    try {
      if (scene.turns.length > 0) {
        const idToken = await getIdToken();
        summary = (await apiSummarizeTurns(idToken, scene.turns)).trim();
      }
    } catch {
      // Non-fatal: end the scene even if the summary call fails.
    }
    const ended: SceneEntry = {
      ...scene,
      status: 'ended',
      endedAt: Date.now(),
      summary,
      savedToLog: playMode === 'solo',
    };
    patchScene(scene.id, () => ended);
    if (activeId === scene.id) setActiveId(null);

    if (playMode === 'solo') {
      onSceneEnded(ended);
    }
  };

  // ---- Roll + outcome ------------------------------------------------------

  const applyRoll = (sceneId: string, turnId: string, modifier: number, dc: number) => {
    const resolved = resolveCheck(modifier, dc);
    patchScene(sceneId, (s) => ({
      ...s,
      turns: s.turns.map((t) =>
        t.id === turnId
          ? {
              ...t,
              rolled: { expr: resolved.expr, result: resolved.result, success: resolved.success },
            }
          : t,
      ),
    }));
  };

  const setOutcome = (sceneId: string, turnId: string, outcome: string) => {
    patchScene(sceneId, (s) => ({
      ...s,
      turns: s.turns.map((t) => (t.id === turnId ? { ...t, outcome } : t)),
    }));
  };

  const exportScene = (scene: SceneEntry) => {
    const md = sceneToMarkdown(scene, { locationName, npcName });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scene-${locationName(scene.locationId).replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteScene = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Scene?',
      message: 'This will permanently delete this past scene from the history. This action cannot be undone.',
      confirmText: 'Delete',
      isDestructive: true,
    });
    if (ok) {
      onScenesChange(scenes.filter((s) => s.id !== id));
      if (activeId === id) setActiveId(null);
    }
  };

  // ---- Render --------------------------------------------------------------

  if (activeScene) {
    return (
      <SceneRunner
        scene={activeScene}
        party={party}
        npcName={npcName}
        locationName={locationName}
        pcAction={turnRunner.pcAction}
        setPcAction={turnRunner.setPcAction}
        streaming={turnRunner.streaming}
        streamText={turnRunner.streamText}
        error={turnRunner.error}
        onSend={turnRunner.sendTurn}
        onCancel={turnRunner.cancel}
        onApplyRoll={applyRoll}
        onSetOutcome={setOutcome}
        onEnd={() => endScene(activeScene)}
        onExport={() => exportScene(activeScene)}
        onBack={() => setActiveId(null)}
      />
    );
  }

  const activeScenes = scenes.filter((s) => s.status === 'active');
  const endedScenes = scenes.filter((s) => s.status === 'ended');

  return (
    <div className="space-y-3 text-sm">
      <p className="font-serif text-xs italic text-ink-soft">
        {playMode === 'solo'
          ? 'Run the scene live. NPCs respond in voice; you control the PC.'
          : 'Test how an NPC encounter might unfold before running it at the table.'}
      </p>

      {!pickerOpen ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded border border-brass-deep/60 bg-brass/15 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:bg-brass hover:text-parchment"
        >
          <Play size={12} /> {playMode === 'solo' ? 'Begin Scene' : 'Rehearse Scene'}
        </button>
      ) : (
        <div className="space-y-3 rounded border border-rule bg-parchment p-3 shadow-card">
          <div className="font-display text-sm uppercase tracking-wider text-brass-deep">
            New Scene
          </div>

          <label className="block">
            <span className="mb-1 flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-soft">
              <MapPin size={11} /> Location
            </span>
            <select
              name="locationId"
              value={draftLocationId}
              onChange={(e) => setDraftLocationId(e.target.value)}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            >
              <option value="">Select a location…</option>
              {locations.map((l) => (
                <option key={str(l.id)} value={str(l.id)}>
                  {str(l.name) || '(unnamed location)'}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-soft">
              <Users size={11} /> NPCs Present
            </span>
            {npcs.length === 0 ? (
              <p className="font-serif text-xs italic text-ink-mute">
                No NPCs in this campaign yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {npcs.map((n) => {
                  const id = str(n.id);
                  const checked = draftNpcIds.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 font-serif text-xs ${
                        checked
                          ? 'border-crimson bg-crimson/10 text-crimson'
                          : 'border-rule bg-parchment-soft text-ink-soft'
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={str(n.name)}
                        checked={checked}
                        onChange={(e) =>
                          setDraftNpcIds((prev) =>
                            e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                          )
                        }
                        className="accent-crimson"
                      />
                      {str(n.name) || '(unnamed NPC)'}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block font-display text-xs uppercase tracking-wider text-ink-soft">
              Party State
            </span>
            <textarea
              name="partyState"
              value={draftPartyState}
              onChange={(e) => setDraftPartyState(e.target.value)}
              rows={2}
              placeholder="e.g. just arrived from the cliffs, low on supplies, wary"
              className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={startScene}
              disabled={!draftLocationId || draftNpcIds.length === 0}
              className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment transition-colors hover:bg-crimson-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={12} /> {playMode === 'solo' ? 'Begin' : 'Rehearse'}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeScenes.length > 0 && (
        <div className="space-y-2">
          <div className="font-display text-xs uppercase tracking-wider text-brass-deep">
            Active Scenes
          </div>
          {activeScenes.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded border border-rule bg-parchment p-2.5 shadow-card"
            >
              <MessageSquare size={14} className="text-crimson" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm text-ink">
                  {locationName(s.locationId)}
                </div>
                <div className="truncate font-serif text-xs italic text-ink-mute">
                  {s.presentNpcIds.map(npcName).join(', ')} · {s.turns.length} turn
                  {s.turns.length === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(s.id)}
                className="rounded border border-brass-deep/50 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => endScene(s)}
                className="rounded border border-crimson/50 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
              >
                End
              </button>
            </div>
          ))}
        </div>
      )}

      {endedScenes.length > 0 && (
        <div className="space-y-2">
          <div className="font-display text-xs uppercase tracking-wider text-ink-mute">
            Past Scenes
          </div>
          {endedScenes.map((s) => (
            <div
              key={s.id}
              className="space-y-1 rounded border border-rule bg-parchment-soft p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-display text-sm text-ink">
                  {locationName(s.locationId)}
                </span>
                <span className="font-serif text-[10px] italic text-ink-mute">
                  {s.turns.length} turn{s.turns.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => exportScene(s)}
                  className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-ink-mute hover:text-brass-deep"
                >
                  <Download size={10} /> Export
                </button>
                <button
                  type="button"
                  onClick={() => deleteScene(s.id)}
                  className="ml-1.5 flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-ink-mute transition-colors hover:text-crimson"
                >
                  <Trash2 size={10} /> Delete
                </button>
                {playMode !== 'solo' && !s.savedToLog && (
                  <button
                    type="button"
                    onClick={() => {
                      onSceneEnded(s);
                      patchScene(s.id, (prev) => ({ ...prev, savedToLog: true }));
                    }}
                    className="ml-1.5 flex items-center gap-1 rounded border border-teal-500/20 bg-teal-500/5 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-teal-600 transition-all hover:text-teal-700"
                  >
                    Save to Session Log
                  </button>
                )}
                {playMode !== 'solo' && s.savedToLog && (
                  <span className="ml-1.5 font-display text-[9px] uppercase italic tracking-wider text-ink-mute">
                    Saved to Log
                  </span>
                )}
              </div>
              {s.summary && (
                <p className="font-serif text-xs leading-relaxed text-ink-soft">{s.summary}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
