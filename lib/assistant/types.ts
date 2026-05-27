// Campaign Assistant — a persistent chat agent with read access to the whole
// campaign and write access via user-approved tool calls. Conversations live
// in `data.assistantConversations` (parallel to `data.sceneSessions`), capped
// at ASSISTANT_CONVERSATIONS_CAP via FIFO archival of the oldest active ones.

export const ASSISTANT_CONVERSATIONS_KEY = 'assistantConversations' as const;
export const ASSISTANT_CONVERSATIONS_CAP = 30;

export type ReadToolName =
  | 'searchEntities'
  | 'getCampaignSummary'
  | 'getRecentSessions'
  | 'getFactionStatus'
  | 'getEntityDetails'
  | 'getDanglingThreads';

export type WriteToolName =
  | 'createNpc'
  | 'createSecret'
  | 'createPotentialScene'
  | 'addFactionClock'
  | 'addRelationship'
  | 'addCluePath';

export type ToolName = ReadToolName | WriteToolName;

export const READ_TOOL_NAMES: readonly ReadToolName[] = [
  'searchEntities',
  'getCampaignSummary',
  'getRecentSessions',
  'getFactionStatus',
  'getEntityDetails',
  'getDanglingThreads',
];

export const WRITE_TOOL_NAMES: readonly WriteToolName[] = [
  'createNpc',
  'createSecret',
  'createPotentialScene',
  'addFactionClock',
  'addRelationship',
  'addCluePath',
];

export function isWriteTool(name: string): name is WriteToolName {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isReadTool(name: string): name is ReadToolName {
  return (READ_TOOL_NAMES as readonly string[]).includes(name);
}

export type ToolCallStatus = 'pending' | 'approved' | 'executed' | 'rejected';

export type ToolCallRecord = {
  id: string; // matches the Anthropic tool_use block id
  name: ToolName;
  input: Record<string, unknown>;
  output?: unknown;
  status: ToolCallStatus;
  rejectionReason?: string;
};

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallRecord[];
  timestamp: number;
};

export type PersonaId = 'lazy-dm' | 'loremaster' | 'devils-advocate';

export type AssistantConversation = {
  id: string;
  title: string;
  startedAt: number;
  lastActiveAt: number;
  messages: AssistantMessage[];
  status: 'active' | 'archived';
  persona?: PersonaId;
  // Raw Anthropic transcript used to faithfully replay tool_use / tool_result
  // blocks across turns. Internal — the UI renders `messages` instead.
  apiMessages?: unknown[];
  // Rough running token estimate for the conversation.
  tokensEstimate?: number;
};

export function makeAssistantId(prefix = 'asst'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// FIFO archival keeping the most-recent ASSISTANT_CONVERSATIONS_CAP *active*
// conversations. When the cap is exceeded, the oldest active conversations
// (by lastActiveAt) are flipped to 'archived' rather than deleted — archived
// ones don't count toward the cap and remain searchable/restorable.
export function capConversations(
  conversations: AssistantConversation[],
  cap = ASSISTANT_CONVERSATIONS_CAP,
): AssistantConversation[] {
  const active = conversations.filter((c) => c.status === 'active');
  if (active.length <= cap) return conversations;
  const toArchive = new Set(
    [...active]
      .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
      .slice(0, active.length - cap)
      .map((c) => c.id),
  );
  return conversations.map((c) =>
    toArchive.has(c.id) ? { ...c, status: 'archived' as const } : c,
  );
}

// Cheap token estimate (~4 chars/token) over a conversation's visible text.
export function estimateConversationTokens(conv: AssistantConversation): number {
  let chars = 0;
  for (const m of conv.messages) {
    chars += m.content.length;
    for (const tc of m.toolCalls ?? []) {
      chars += JSON.stringify(tc.input).length;
      if (tc.output !== undefined) chars += JSON.stringify(tc.output).length;
    }
  }
  return Math.ceil(chars / 4);
}
