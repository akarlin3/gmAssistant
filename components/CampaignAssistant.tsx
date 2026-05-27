'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Send,
  MessageSquare,
  Search,
  Archive,
  RotateCcw,
  Trash2,
  Check,
  X,
  Pencil,
  Wand2,
  Sparkles,
  Loader2,
  Bot,
} from 'lucide-react';
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

type LooseRecord = Record<string, unknown>;

type Props = {
  data: LooseRecord;
  campaignName: string;
  setData: (next: LooseRecord) => void;
};

type ServerProposal = { id: string; name: string; input: LooseRecord };
type ServerReadCall = { id: string; name: string; input: LooseRecord; output: unknown };
type DonePayload = {
  assistantText: string;
  readCalls: ServerReadCall[];
  proposals: ServerProposal[];
  apiMessages: unknown[];
};

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
    async (
      convId: string,
      event:
        | { type: 'user'; text: string }
        | {
            type: 'tool_results';
            results: Array<{
              toolUseId: string;
              ok: boolean;
              output?: unknown;
              rejectionReason?: string;
            }>;
          },
    ) => {
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

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        let done: DonePayload | null = null;

        while (true) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const evt of events) {
            if (!evt.trim()) continue;
            let name = 'message';
            let dataLine = '';
            for (const line of evt.split('\n')) {
              if (line.startsWith('event: ')) name = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
            }
            if (!dataLine) continue;
            try {
              const parsed = JSON.parse(dataLine);
              if (name === 'chunk' && typeof parsed.text === 'string') {
                accumulated += parsed.text;
                setStreamText(accumulated);
              } else if (name === 'done') {
                done = parsed as DonePayload;
              } else if (name === 'error') {
                setError(parsed.error || 'Stream error.');
              }
            } catch {
              // ignore partial-frame parse errors
            }
          }
        }

        if (done) {
          const readCalls: ToolCallRecord[] = (done.readCalls ?? []).map((r) => ({
            id: r.id,
            name: r.name as ToolCallRecord['name'],
            input: r.input,
            output: r.output,
            status: 'executed',
          }));
          const proposals: ToolCallRecord[] = (done.proposals ?? []).map((p) => ({
            id: p.id,
            name: p.name as WriteToolName,
            input: p.input,
            status: 'pending',
          }));
          const assistantMsg: AssistantMessage = {
            id: makeAssistantId('msg'),
            role: 'assistant',
            content: done.assistantText || '',
            toolCalls: [...readCalls, ...proposals],
            timestamp: Date.now(),
          };
          patchConversation(convId, (c) => {
            const updated: AssistantConversation = {
              ...c,
              messages: [...c.messages, assistantMsg],
              apiMessages: done!.apiMessages,
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
  const resolveProposal = (
    convId: string,
    toolId: string,
    decision: { status: 'approved' | 'rejected'; input?: LooseRecord; rejectionReason?: string },
  ) => {
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

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        const last = messages[lastIdx];
        if (!last?.toolCalls) return c;
        const toolCalls = last.toolCalls.map((t) =>
          t.id === toolId
            ? {
                ...t,
                input: decision.input ?? t.input,
                status:
                  decision.status === 'approved' ? ('executed' as const) : ('rejected' as const),
                output: summaryOut,
                rejectionReason: decision.rejectionReason,
              }
            : t,
        );
        messages[lastIdx] = { ...last, toolCalls };
        return { ...c, messages };
      }),
    );
  };

  // Tracks assistant messages whose write decisions have already been sent back
  // to the model, so the auto-submit effect fires exactly once per turn.
  const submittedRef = useRef<Set<string>>(new Set());

  // After each resolution, check whether the last assistant turn's writes are
  // fully resolved; if so, send the batch of decisions back to the model.
  useEffect(() => {
    if (!active || streaming) return;
    const last = active.messages[active.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.toolCalls) return;
    if (submittedRef.current.has(last.id)) return;
    const writes = last.toolCalls.filter((t) => isWriteTool(t.name));
    if (writes.length === 0) return;
    if (writes.some((t) => t.status === 'pending')) return;

    submittedRef.current.add(last.id);
    const results = writes.map((t) => ({
      toolUseId: t.id,
      ok: t.status === 'executed',
      output: t.output,
      rejectionReason: t.rejectionReason,
    }));
    void runTurn(active.id, { type: 'tool_results', results });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.messages, streaming]);

  const prepSession = () => void send(PREP_SESSION_SEED_PROMPT);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="flex h-[70vh] gap-3 text-ink">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col rounded-lg border border-parchment-deep bg-parchment/40">
        <div className="flex items-center justify-between gap-2 border-b border-parchment-deep p-2">
          <button
            onClick={startConversation}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-wine/10 px-2 py-1.5 text-xs font-display uppercase tracking-wider text-wine hover:bg-wine/20"
          >
            <Plus size={13} /> New Conversation
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-b border-parchment-deep p-2">
          <Search size={13} className="text-ink-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-xs outline-none placeholder:text-ink-mute"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="p-2 text-xs italic text-ink-mute">
              {showArchived ? 'No archived conversations.' : 'No conversations yet.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-md px-2 py-1.5 ${
                      c.id === activeId ? 'bg-wine/15' : 'hover:bg-parchment-deep/60'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveId(c.id);
                        setError(null);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <MessageSquare size={12} className="shrink-0 text-ink-mute" />
                      <span className="truncate text-xs">{c.title}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      {c.status === 'active' ? (
                        <button
                          title="Archive"
                          onClick={() => archiveConversation(c.id)}
                          className="rounded p-0.5 text-ink-mute hover:text-brass-deep"
                        >
                          <Archive size={12} />
                        </button>
                      ) : (
                        <button
                          title="Restore"
                          onClick={() => restoreConversation(c.id)}
                          className="rounded p-0.5 text-ink-mute hover:text-brass-deep"
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                      <button
                        title="Delete"
                        onClick={() => deleteConversation(c.id)}
                        className="rounded p-0.5 text-ink-mute hover:text-crimson"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="border-t border-parchment-deep p-2 text-[11px] font-display uppercase tracking-wider text-ink-mute hover:text-ink"
        >
          {showArchived ? 'Show Active' : 'Show Archived'}
        </button>
      </aside>

      {/* Main pane */}
      <section className="flex flex-1 flex-col rounded-lg border border-parchment-deep bg-parchment/40">
        {!active ? (
          <EmptyState onStart={startConversation} onPrep={prepSession} />
        ) : (
          <>
            <header className="flex items-center justify-between gap-2 border-b border-parchment-deep p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Bot size={15} className="shrink-0 text-wine" />
                <h3 className="truncate text-sm font-display">{active.title}</h3>
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
                    className="flex items-center gap-1.5 rounded-md bg-wine/10 px-3 py-1.5 text-xs font-display uppercase tracking-wider text-wine hover:bg-wine/20"
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
                  className="flex items-center gap-1 rounded-md border border-parchment-deep px-2 py-1 text-[11px] font-display uppercase tracking-wider text-brass-deep hover:bg-parchment-deep/40 disabled:opacity-50"
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
                  className="flex items-center gap-1.5 rounded-md bg-wine px-3 py-2 text-sm font-display uppercase tracking-wider text-parchment hover:bg-wine/90 disabled:opacity-50"
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

function EmptyState({ onStart, onPrep }: { onStart: () => void; onPrep: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Sparkles size={28} className="text-wine" />
      <h3 className="text-base font-display">Campaign Assistant</h3>
      <p className="max-w-md text-sm text-ink-soft">
        A persistent agent that reads your whole campaign — NPCs, factions, secrets, sessions — and
        proposes content you approve before it&apos;s saved. Plan sessions, surface forgotten
        threads, and answer &quot;what happens next?&quot;
      </p>
      <div className="flex gap-2">
        <button
          onClick={onStart}
          className="flex items-center gap-1.5 rounded-md bg-wine px-3 py-2 text-sm font-display uppercase tracking-wider text-parchment hover:bg-wine/90"
        >
          <Plus size={14} /> New Conversation
        </button>
        <button
          onClick={onPrep}
          className="flex items-center gap-1.5 rounded-md border border-parchment-deep px-3 py-2 text-sm font-display uppercase tracking-wider text-brass-deep hover:bg-parchment-deep/40"
        >
          <Wand2 size={14} /> Prep My Next Session
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  complete,
  onApprove,
  onReject,
  disabled,
}: {
  message: AssistantMessage;
  complete: boolean;
  onApprove: (toolId: string, input: LooseRecord) => void;
  onReject: (toolId: string, reason: string) => void;
  disabled: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-lg border border-amber-300/50 bg-amber-100/40 px-3 py-2 text-sm text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  const reads = (message.toolCalls ?? []).filter((t) => !isWriteTool(t.name));
  const writes = (message.toolCalls ?? []).filter((t) => isWriteTool(t.name));

  return (
    <div
      className="flex items-start gap-2"
      data-assistant-response
      data-status={complete ? 'complete' : 'streaming'}
    >
      <Bot size={15} className="mt-0.5 shrink-0 text-wine" />
      <div className="min-w-0 flex-1 space-y-2">
        {reads.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {reads.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full bg-parchment-deep/60 px-2 py-0.5 text-[10px] text-ink-mute"
                title={JSON.stringify(t.input)}
              >
                <Search size={9} /> {t.name}
              </span>
            ))}
          </div>
        )}
        {message.content && (
          <div className="whitespace-pre-wrap text-sm text-ink-soft">{message.content}</div>
        )}
        {writes.map((t) => (
          <ProposalCard
            key={t.id}
            call={t}
            onApprove={onApprove}
            onReject={onReject}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function ProposalCard({
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
        <span className="flex items-center gap-1.5 text-xs font-display uppercase tracking-wider text-brass-deep">
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
                className="rounded-md bg-crimson px-2.5 py-1 text-xs font-display uppercase tracking-wider text-parchment hover:bg-crimson/90 disabled:opacity-50"
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
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-display uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={12} /> Approve
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={disabled}
                className="flex items-center gap-1 rounded-md border border-crimson/50 px-2.5 py-1 text-xs font-display uppercase tracking-wider text-crimson hover:bg-crimson/10 disabled:opacity-50"
              >
                <X size={12} /> Reject
              </button>
              <button
                onClick={() => setEditing((e) => !e)}
                disabled={disabled}
                className="flex items-center gap-1 rounded-md border border-parchment-deep px-2.5 py-1 text-xs font-display uppercase tracking-wider text-brass-deep hover:bg-parchment-deep/40 disabled:opacity-50"
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
