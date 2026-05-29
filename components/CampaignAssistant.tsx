'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Wand2, Loader2, Bot } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  ASSISTANT_CONVERSATIONS_KEY,
  capConversations,
  estimateConversationTokens,
  isWriteTool,
  makeAssistantId,
  type AssistantConversation,
  type AssistantMessage,
  type PersonaId,
  type ToolCallRecord,
  type WriteToolName,
} from '@/lib/assistant/types';
import { buildCampaignSnapshot } from '@/lib/assistant/context';
import { applyWriteTool } from '@/lib/assistant/apply-write';
import { PERSONA_META, DEFAULT_PERSONA } from '@/lib/assistant/personas';
import { PREP_SESSION_SEED_PROMPT } from '@/lib/assistant/prompt';
import { EmptyState } from './campaignAssistant/EmptyState';
import { MessageBubble } from './campaignAssistant/MessageBubble';
import { ConversationSidebar } from './campaignAssistant/ConversationSidebar';
import { readTurnStream } from './campaignAssistant/stream';
import { applyProposalDecision, collectWriteResults } from './campaignAssistant/proposals';
import type {
  DonePayload,
  LooseRecord,
  Props,
  ProposalDecision,
  TurnEvent,
} from './campaignAssistant/types';

async function getIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

function newConversation(): AssistantConversation {
  const now = Date.now();
  return {
    id: makeAssistantId('conv'),
    title: 'New Conversation',
    startedAt: now,
    lastActiveAt: now,
    messages: [],
    status: 'active',
    persona: DEFAULT_PERSONA,
    apiMessages: [],
  };
}

export default function CampaignAssistant({ data, campaignName, setData }: Props) {
  const conversations = useMemo(
    () =>
      Array.isArray(data[ASSISTANT_CONVERSATIONS_KEY])
        ? (data[ASSISTANT_CONVERSATIONS_KEY] as AssistantConversation[])
        : [],
    [data],
  );

  // dataRef mirrors the latest `data` prop so a sequence of synchronous updates
  // (e.g. approve-batch then a follow-up turn) compose without stale reads.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const writeData = useCallback(
    (patch: LooseRecord) => {
      const next = { ...dataRef.current, ...patch };
      dataRef.current = next;
      setData(next);
    },
    [setData],
  );

  const setConversations = useCallback(
    (updater: (prev: AssistantConversation[]) => AssistantConversation[]) => {
      const prev = Array.isArray(dataRef.current[ASSISTANT_CONVERSATIONS_KEY])
        ? (dataRef.current[ASSISTANT_CONVERSATIONS_KEY] as AssistantConversation[])
        : [];
      writeData({ [ASSISTANT_CONVERSATIONS_KEY]: updater(prev) });
    },
    [writeData],
  );

  const patchConversation = useCallback(
    (id: string, patch: (c: AssistantConversation) => AssistantConversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? patch(c) : c)));
    },
    [setConversations],
  );

  const [activeId, setActiveId] = useState<string | null>(
    () => conversations.find((c) => c.status === 'active')?.id ?? null,
  );
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.messages.length, streamText]);

  // ---- Conversation management --------------------------------------------

  const startConversation = () => {
    const conv = newConversation();
    setConversations((prev) => capConversations([conv, ...prev]));
    setActiveId(conv.id);
    setError(null);
    setStreamText('');
  };

  const archiveConversation = (id: string) =>
    patchConversation(id, (c) => ({ ...c, status: 'archived' }));
  const restoreConversation = (id: string) =>
    patchConversation(id, (c) => ({ ...c, status: 'active', lastActiveAt: Date.now() }));
  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const setPersona = (id: string, persona: PersonaId) =>
    patchConversation(id, (c) => ({ ...c, persona }));

  const selectConversation = (id: string) => {
    setActiveId(id);
    setError(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => (showArchived ? c.status === 'archived' : c.status === 'active'))
      .filter((c) => {
        if (!q) return true;
        if (c.title.toLowerCase().includes(q)) return true;
        return c.messages.some((m) => m.content.toLowerCase().includes(q));
      })
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }, [conversations, query, showArchived]);

  // ---- Turn runner ---------------------------------------------------------

  const runTurn = useCallback(
    async (convId: string, event: TurnEvent) => {
      const conv = (
        dataRef.current[ASSISTANT_CONVERSATIONS_KEY] as AssistantConversation[] | undefined
      )?.find((c) => c.id === convId);
      if (!conv) return;

      setError(null);
      setStreamText('');
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const idToken = await getIdToken();
        const snapshot = buildCampaignSnapshot(dataRef.current, campaignName);
        const res = await fetch('/api/assistant/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            campaign: snapshot,
            apiMessages: conv.apiMessages ?? [],
            event,
            persona: conv.persona ?? DEFAULT_PERSONA,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setError(body.error || `HTTP ${res.status}`);
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError('No response stream.');
          setStreaming(false);
          return;
        }

        let accumulated = '';
        let done: DonePayload | null = null;

        await readTurnStream(reader, (frame) => {
          if (frame.kind === 'chunk') {
            accumulated += frame.text;
            setStreamText(accumulated);
          } else if (frame.kind === 'done') {
            done = frame.payload;
          } else if (frame.kind === 'error') {
            setError(frame.error);
          }
        });

        if (done) {
          const payload: DonePayload = done;
          const readCalls: ToolCallRecord[] = (payload.readCalls ?? []).map((r) => ({
            id: r.id,
            name: r.name as ToolCallRecord['name'],
            input: r.input,
            output: r.output,
            status: 'executed',
          }));
          const proposals: ToolCallRecord[] = (payload.proposals ?? []).map((p) => ({
            id: p.id,
            name: p.name as WriteToolName,
            input: p.input,
            status: 'pending',
          }));
          const assistantMsg: AssistantMessage = {
            id: makeAssistantId('msg'),
            role: 'assistant',
            content: payload.assistantText || '',
            toolCalls: [...readCalls, ...proposals],
            timestamp: Date.now(),
          };
          patchConversation(convId, (c) => {
            const updated: AssistantConversation = {
              ...c,
              messages: [...c.messages, assistantMsg],
              apiMessages: payload.apiMessages,
              lastActiveAt: Date.now(),
            };
            return { ...updated, tokensEstimate: estimateConversationTokens(updated) };
          });
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setStreaming(false);
        setStreamText('');
        abortRef.current = null;
      }
    },
    [campaignName, patchConversation],
  );

  const maybeAutoTitle = useCallback(
    async (convId: string, firstMessage: string) => {
      try {
        const idToken = await getIdToken();
        const res = await fetch('/api/assistant/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ message: firstMessage }),
        });
        if (!res.ok) return;
        const { title } = (await res.json()) as { title?: string };
        if (title) patchConversation(convId, (c) => ({ ...c, title }));
      } catch {
        // non-fatal
      }
    },
    [patchConversation],
  );

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    let convId = activeId;
    if (!convId) {
      const conv = newConversation();
      setConversations((prev) => capConversations([conv, ...prev]));
      setActiveId(conv.id);
      convId = conv.id;
    }
    const isFirst =
      ((dataRef.current[ASSISTANT_CONVERSATIONS_KEY] as AssistantConversation[] | undefined)?.find(
        (c) => c.id === convId,
      )?.messages.length ?? 0) === 0;

    const userMsg: AssistantMessage = {
      id: makeAssistantId('msg'),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    patchConversation(convId!, (c) => ({
      ...c,
      messages: [...c.messages, userMsg],
      lastActiveAt: Date.now(),
    }));
    setInput('');
    if (isFirst) void maybeAutoTitle(convId!, trimmed);
    await runTurn(convId!, { type: 'user', text: trimmed });
  };

  // ---- Proposal resolution -------------------------------------------------

  // Resolve a single proposal in the most-recent assistant message. When no
  // pending writes remain, fire the tool_results turn so the model reacts.
  const resolveProposal = (convId: string, toolId: string, decision: ProposalDecision) => {
    let summaryOut: string | undefined;
    if (decision.status === 'approved') {
      const conv = conversations.find((c) => c.id === convId);
      const msg = conv?.messages[conv.messages.length - 1];
      const tc = msg?.toolCalls?.find((t) => t.id === toolId);
      if (tc && isWriteTool(tc.name)) {
        const input = decision.input ?? (tc.input as LooseRecord);
        const result = applyWriteTool(dataRef.current, tc.name as WriteToolName, input);
        writeData(result.data);
        summaryOut = result.summary;
      }
    }

    setConversations((prev) => applyProposalDecision(prev, convId, toolId, decision, summaryOut));
  };

  // Tracks assistant messages whose write decisions have already been sent back
  // to the model, so the auto-submit effect fires exactly once per turn.
  const submittedRef = useRef<Set<string>>(new Set());

  // After each resolution, check whether the last assistant turn's writes are
  // fully resolved; if so, send the batch of decisions back to the model.
  useEffect(() => {
    if (!active || streaming) return;
    const last = active.messages[active.messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (submittedRef.current.has(last.id)) return;
    const results = collectWriteResults(last);
    if (!results) return;

    submittedRef.current.add(last.id);
    void runTurn(active.id, { type: 'tool_results', results });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.messages, streaming]);

  const prepSession = () => void send(PREP_SESSION_SEED_PROMPT);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="flex h-[70vh] gap-3 text-ink">
      <ConversationSidebar
        conversations={filtered}
        activeId={activeId}
        query={query}
        showArchived={showArchived}
        onQueryChange={setQuery}
        onToggleArchived={() => setShowArchived((s) => !s)}
        onStart={startConversation}
        onSelect={selectConversation}
        onArchive={archiveConversation}
        onRestore={restoreConversation}
        onDelete={deleteConversation}
      />

      {/* Main pane */}
      <section className="flex flex-1 flex-col rounded-lg border border-parchment-deep bg-parchment/40">
        {!active ? (
          <EmptyState onStart={startConversation} onPrep={prepSession} />
        ) : (
          <>
            <header className="flex items-center justify-between gap-2 border-b border-parchment-deep p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Bot size={15} className="shrink-0 text-wine" />
                <h3 className="truncate font-display text-sm">{active.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-mute" title="Rough token estimate">
                  ~{(active.tokensEstimate ?? estimateConversationTokens(active)).toLocaleString()}{' '}
                  tok
                </span>
                <select
                  value={active.persona ?? DEFAULT_PERSONA}
                  onChange={(e) => setPersona(active.id, e.target.value as PersonaId)}
                  className="rounded-md border border-parchment-deep bg-parchment px-1.5 py-1 text-[11px]"
                  title="Assistant persona"
                >
                  {PERSONA_META.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
              {active.messages.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-xs italic text-ink-mute">
                    Ask about your campaign, or let me prep your next session.
                  </p>
                  <button
                    onClick={prepSession}
                    className="flex items-center gap-1.5 rounded-md bg-wine/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-wine hover:bg-wine/20"
                  >
                    <Wand2 size={13} /> Prep My Next Session
                  </button>
                </div>
              )}

              {active.messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  complete={!(streaming && i === active.messages.length - 1)}
                  onApprove={(toolId, input) =>
                    resolveProposal(active.id, toolId, { status: 'approved', input })
                  }
                  onReject={(toolId, reason) =>
                    resolveProposal(active.id, toolId, {
                      status: 'rejected',
                      rejectionReason: reason,
                    })
                  }
                  disabled={streaming}
                />
              ))}

              {streaming && (
                <div className="flex items-start gap-2">
                  <Bot size={15} className="mt-0.5 shrink-0 text-wine" />
                  <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink-soft">
                    {streamText || (
                      <span className="flex items-center gap-1.5 text-ink-mute">
                        <Loader2 size={13} className="animate-spin" /> Thinking…
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mx-3 mb-2 rounded-md border border-crimson/40 bg-crimson/10 px-3 py-2 text-xs text-crimson">
                {error}
              </div>
            )}

            <div className="border-t border-parchment-deep p-2.5">
              <div className="mb-2 flex gap-1.5">
                <button
                  onClick={prepSession}
                  disabled={streaming}
                  className="flex items-center gap-1 rounded-md border border-parchment-deep px-2 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep hover:bg-parchment-deep/40 disabled:opacity-50"
                >
                  <Wand2 size={11} /> Prep My Next Session
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  data-assistant-input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask the assistant…"
                  className="flex-1 resize-none rounded-md border border-parchment-deep bg-parchment px-2.5 py-2 text-sm outline-none focus:border-wine"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-wine px-3 py-2 font-display text-sm uppercase tracking-wider text-parchment hover:bg-wine/90 disabled:opacity-50"
                >
                  {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{' '}
                  Send
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
