'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  X,
  Play,
  Square,
  MessageSquare,
  Dice5,
  Download,
  AlertTriangle,
  MapPin,
  Users,
} from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  capScenes,
  makeSceneId,
  type SceneEntry,
  type SceneTurn,
  type SceneTurnResponse,
} from '@/lib/scene/types';
import { buildSceneTurnRequest } from '@/lib/scene/context';
import { resolveMentions } from '@/lib/scene/mentions';
import { rollLabel, resolveCheck } from '@/lib/scene/roll';
import { sceneToMarkdown } from '@/lib/scene/export';
import { modifierForSuggestion } from '@/lib/scene/roll-with-modifiers';
import { normalizePcs } from '@/lib/pc/factory';
import { formatMod } from '@/lib/pc/derived';
import type { PlayerCharacter } from '@/lib/pc/types';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';
import { useContext } from 'react';

type LooseRecord = Record<string, unknown>;

type Props = {
  data: Record<string, unknown>;
  scenes: SceneEntry[];
  onScenesChange: (next: SceneEntry[]) => void;
  // Reveal mentioned NPCs to players through the Player Mode pipe.
  onReveal: (npcIds: string[]) => void;
  // Parent appends a session-log entry built from the ended scene.
  onSceneEnded: (scene: SceneEntry) => void;
};

function asArray(v: unknown): LooseRecord[] {
  return Array.isArray(v) ? (v as LooseRecord[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

async function getIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

export default function SceneModePanel({
  data,
  scenes,
  onScenesChange,
  onReveal,
  onSceneEnded,
}: Props) {
  const playMode = useContext(CampaignPlayModeContext);
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

  // Turn runner
  const [pcAction, setPcAction] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeScene = scenes.find((s) => s.id === activeId) ?? null;

  const patchScene = (id: string, patch: (s: SceneEntry) => SceneEntry) => {
    onScenesChange(scenes.map((s) => (s.id === id ? patch(s) : s)));
  };

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
        const res = await fetch('/api/scene/summarize-turns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ turns: scene.turns }),
        });
        if (res.ok) {
          const json = (await res.json()) as { summary?: string };
          summary = (json.summary ?? '').trim();
        }
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

  // ---- Send a turn ---------------------------------------------------------

  const sendTurn = async () => {
    const action = pcAction.trim();
    if (!action || streaming || !activeScene) return;
    setError(null);
    setStreamText('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const scene = activeScene;

    try {
      const idToken = await getIdToken();
      const location = locations.find((l) => str(l.id) === scene.locationId) ?? {};
      const presentNpcs = npcs.filter((n) => scene.presentNpcIds.includes(str(n.id)));

      const requestBody = await buildSceneTurnRequest({
        location,
        npcs: presentNpcs,
        scene: { partyState: scene.partyState, turns: scene.turns },
        newAction: action,
        summarizeTurns: async (turns) => {
          const r = await fetch('/api/scene/summarize-turns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ turns }),
          });
          if (!r.ok) return '';
          const j = (await r.json()) as { summary?: string };
          return j.summary ?? '';
        },
      });

      const res = await fetch('/api/scene/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(errBody.error || `HTTP ${res.status}`);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response stream available.');
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let finalResponse: SceneTurnResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          if (!evt.trim()) continue;
          let eventName = 'message';
          let dataLine = '';
          for (const line of evt.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine);
            if (eventName === 'chunk' && typeof parsed.text === 'string') {
              accumulated += parsed.text;
              setStreamText(accumulated);
            } else if (eventName === 'turn' && parsed.response) {
              finalResponse = parsed.response as SceneTurnResponse;
            } else if (eventName === 'error') {
              setError(parsed.error || 'Stream error.');
            }
          } catch {
            // ignore partial-event parse failures
          }
        }
      }

      if (finalResponse) {
        const turn: SceneTurn = {
          id: makeSceneId(),
          pcAction: action,
          response: finalResponse,
          createdAt: Date.now(),
        };
        patchScene(scene.id, (s) => ({ ...s, turns: [...s.turns, turn] }));
        setPcAction('');
        setStreamText('');

        // @-mention reveals + voice check run after the turn is recorded.
        revealMentions(finalResponse);
        void runVoiceCheck(scene.id, turn);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStreaming(false);
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
        const r = await fetch('/api/scene/voice-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ traits, voice, line: line.line }),
        });
        if (!r.ok) continue;
        const { verdict } = (await r.json()) as { verdict?: string };
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

  // ---- Render --------------------------------------------------------------

  if (activeScene) {
    return (
      <SceneRunner
        scene={activeScene}
        party={party}
        npcName={npcName}
        locationName={locationName}
        pcAction={pcAction}
        setPcAction={setPcAction}
        streaming={streaming}
        streamText={streamText}
        error={error}
        onSend={sendTurn}
        onCancel={cancel}
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
                {playMode !== 'solo' && !s.savedToLog && (
                  <button
                    type="button"
                    onClick={() => {
                      onSceneEnded(s);
                      patchScene(s.id, (prev) => ({ ...prev, savedToLog: true }));
                    }}
                    className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-teal-600 hover:text-teal-700 font-semibold border border-teal-500/20 bg-teal-500/5 px-2 py-0.5 rounded transition-all ml-1.5"
                  >
                    Save to Session Log
                  </button>
                )}
                {playMode !== 'solo' && s.savedToLog && (
                  <span className="text-[9px] uppercase font-display tracking-wider text-ink-mute ml-1.5 italic">
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

// ---- Scene runner (active turn-by-turn view) -------------------------------

function SceneRunner({
  scene,
  party,
  npcName,
  locationName,
  pcAction,
  setPcAction,
  streaming,
  streamText,
  error,
  onSend,
  onCancel,
  onApplyRoll,
  onSetOutcome,
  onEnd,
  onExport,
  onBack,
}: {
  scene: SceneEntry;
  party: PlayerCharacter[];
  npcName: (id: string) => string;
  locationName: (id: string) => string;
  pcAction: string;
  setPcAction: (v: string) => void;
  streaming: boolean;
  streamText: string;
  error: string | null;
  onSend: () => void;
  onCancel: () => void;
  onApplyRoll: (sceneId: string, turnId: string, modifier: number, dc: number) => void;
  onSetOutcome: (sceneId: string, turnId: string, outcome: string) => void;
  onEnd: () => void;
  onExport: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3 text-sm" data-scene-status={scene.status}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="font-display text-xs uppercase tracking-wider text-ink-mute hover:text-ink"
        >
          ← Scenes
        </button>
        <span className="min-w-0 flex-1 truncate font-display text-sm text-ink">
          {locationName(scene.locationId)}
        </span>
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-ink-mute hover:text-brass-deep"
        >
          <Download size={10} /> Export
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="flex items-center gap-1 rounded border border-crimson/50 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
        >
          <Square size={10} /> End Scene
        </button>
      </div>

      <div className="font-serif text-xs italic text-ink-mute">
        Present: {scene.presentNpcIds.map(npcName).join(', ')}
      </div>

      <div className="space-y-3">
        {scene.turns.map((turn, i) => (
          <TurnCard
            key={turn.id}
            turn={turn}
            index={i}
            sceneId={scene.id}
            party={party}
            npcName={npcName}
            onApplyRoll={onApplyRoll}
            onSetOutcome={onSetOutcome}
          />
        ))}

        {streaming && (
          <div className="rounded border border-rule bg-parchment p-3 shadow-card">
            <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
              <Sparkles size={12} className="text-crimson" /> Narrating…
            </span>
            {streamText && (
              <pre className="mt-1.5 whitespace-pre-wrap font-serif text-xs leading-relaxed text-ink-mute">
                {streamText}
              </pre>
            )}
          </div>
        )}

        {error && (
          <div className="rounded border border-crimson/40 bg-crimson/5 p-2.5 font-serif text-xs text-crimson">
            {error}
          </div>
        )}
      </div>

      {/* Player input — amber/brass treatment per UI convention. */}
      <div className="space-y-1.5 rounded border border-brass-deep/40 bg-brass/10 p-2.5">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          What does your PC do?
        </span>
        <textarea
          name="pcAction"
          value={pcAction}
          onChange={(e) => setPcAction(e.target.value)}
          rows={2}
          placeholder="Describe your action…"
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
        />
        <button
          type="button"
          onClick={streaming ? onCancel : onSend}
          disabled={!streaming && !pcAction.trim()}
          className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-colors ${
            streaming
              ? 'border-crimson bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment'
              : 'border-crimson bg-crimson text-parchment hover:bg-crimson-deep disabled:cursor-not-allowed disabled:opacity-40'
          }`}
        >
          {streaming ? (
            <>
              <X size={12} /> Cancel
            </>
          ) : (
            <>
              <Send size={12} /> Send
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function TurnCard({
  turn,
  index,
  sceneId,
  party,
  npcName,
  onApplyRoll,
  onSetOutcome,
}: {
  turn: SceneTurn;
  index: number;
  sceneId: string;
  party: PlayerCharacter[];
  npcName: (id: string) => string;
  onApplyRoll: (sceneId: string, turnId: string, modifier: number, dc: number) => void;
  onSetOutcome: (sceneId: string, turnId: string, outcome: string) => void;
}) {
  const [modifier, setModifier] = useState(0);
  const [rollOpen, setRollOpen] = useState(false);
  const [pickPc, setPickPc] = useState(false);
  const roll = turn.response.suggestedRoll;

  // Roll the suggestion against a specific PC: resolve the ability mod +
  // proficiency bonus (when proficient in the suggested skill) and apply.
  const rollWithPc = (pc: PlayerCharacter) => {
    if (!roll) return;
    onApplyRoll(sceneId, turn.id, modifierForSuggestion(pc, roll), roll.dc);
    setRollOpen(false);
    setPickPc(false);
  };

  return (
    <div className="space-y-2" data-turn-index={index} data-status="complete">
      <div className="rounded border border-brass-deep/30 bg-brass/10 px-2.5 py-1.5 font-serif text-sm text-ink">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          PC
        </span>
        <div>{turn.pcAction}</div>
      </div>

      <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
        {turn.response.dialogue.map((d, di) => (
          <div key={di} className="font-serif text-sm leading-relaxed text-ink">
            <span className="font-display text-xs uppercase tracking-wider text-crimson">
              {npcName(d.npcId)}:
            </span>{' '}
            <span className="italic">&ldquo;{d.line}&rdquo;</span>
          </div>
        ))}
        <p className="font-serif text-sm leading-relaxed text-ink-soft">{turn.response.sensory}</p>

        {turn.voiceWarnings?.map((w, wi) => (
          <div
            key={wi}
            className="flex items-start gap-1.5 rounded border border-brass-deep/50 bg-brass/15 px-2 py-1 font-serif text-xs text-brass-deep"
          >
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              <b>{npcName(w.npcId)}</b> — {w.reason}
            </span>
          </div>
        ))}

        {roll && (
          <div className="space-y-1.5 border-t border-rule pt-2">
            {turn.rolled ? (
              <div className="font-serif text-xs text-ink-soft">
                <Dice5 size={12} className="mr-1 inline text-brass-deep" />
                {turn.rolled.expr} = <b>{turn.rolled.result}</b> vs DC {roll.dc} —{' '}
                <span className={turn.rolled.success ? 'text-moss' : 'text-crimson'}>
                  {turn.rolled.success === null ? '—' : turn.rolled.success ? 'Success' : 'Failure'}
                </span>
              </div>
            ) : rollOpen ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-serif text-xs text-ink-soft">1d20 +</span>
                  <input
                    type="number"
                    value={modifier}
                    onChange={(e) => setModifier(Number(e.target.value) || 0)}
                    className="w-14 rounded border-b border-rule bg-transparent px-1 py-0.5 text-center font-serif text-ink focus:border-crimson focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onApplyRoll(sceneId, turn.id, modifier, roll.dc);
                      setRollOpen(false);
                    }}
                    className="rounded border border-crimson bg-crimson px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-crimson-deep"
                  >
                    Roll
                  </button>
                  {party.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (party.length === 1) rollWithPc(party[0]);
                        else setPickPc((v) => !v);
                      }}
                      className="rounded border border-brass-deep/50 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
                      title="Roll using a PC's ability/skill modifier"
                    >
                      Roll With Modifiers
                    </button>
                  )}
                </div>
                {pickPc && party.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {party.map((pc) => (
                      <button
                        key={pc.id}
                        type="button"
                        onClick={() => rollWithPc(pc)}
                        className="rounded border border-rule px-2 py-0.5 font-serif text-[11px] text-ink-soft hover:bg-parchment-deep"
                      >
                        {pc.name || 'Unnamed'} ({formatMod(modifierForSuggestion(pc, roll))})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRollOpen(true)}
                className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
                title={roll.reason}
              >
                <Dice5 size={11} /> {rollLabel(roll)}
              </button>
            )}
            <p className="font-serif text-[11px] italic text-ink-mute">{roll.reason}</p>
          </div>
        )}

        <input
          type="text"
          defaultValue={turn.outcome ?? ''}
          onBlur={(e) => onSetOutcome(sceneId, turn.id, e.target.value)}
          placeholder="What actually happened? (optional)"
          className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
        />
      </div>
    </div>
  );
}
